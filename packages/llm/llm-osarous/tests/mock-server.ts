import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

/**
 * One scripted behavior for the next `/chat/completions` request. The
 * `/v1/models` health endpoint always answers 200 with an empty model list,
 * mirroring the real sidecar, without consuming a scripted behavior.
 */
export type Behavior =
  | { kind: 'sse'; events: string[]; delayMs?: number }
  | { kind: 'http-error'; status: number; body: string; contentType?: string }

export interface MockServer {
  url: string
  /** Bodies of received `/chat/completions` requests, in order. */
  requests: unknown[]
  /** Header bags of received `/chat/completions` requests, in order. */
  headers: IncomingMessage['headers'][]
  script: Behavior[]
  close(): Promise<void>
}

const servers: Server[] = []

/** Close every server opened since the last call; run from each spec's afterEach. */
export async function closeMockServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => { resolve() }))))
}

/** A minimal complete text generation, reused by request-shape assertions. */
export const textEvents = [
  '{"choices":[{"delta":{"content":"hello"}}]}',
  '{"choices":[{"delta":{"content":" world"}}]}',
  '{"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
  '[DONE]',
]

/**
 * Local osaurus stand-in: answers the `/v1/models` health endpoint and
 * replays scripted behaviors per `/chat/completions` request.
 */
export async function mockServer(script: Behavior[]): Promise<MockServer> {
  const requests: unknown[] = []
  const headers: IncomingMessage['headers'][] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"object":"list","data":[]}')
      return
    }
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      requests.push(JSON.parse(body))
      headers.push(request.headers)
      const behavior = script.shift()
      if (!behavior) {
        response.writeHead(500).end('mock script exhausted')
        return
      }
      if (behavior.kind === 'http-error') {
        response.writeHead(behavior.status, { 'content-type': behavior.contentType ?? 'application/json' })
        response.end(behavior.body)
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const write = (index: number): void => {
        if (index >= behavior.events.length) {
          response.end()
          return
        }
        response.write(`data: ${behavior.events[index]}\n\n`)
        setTimeout(() => { write(index + 1) }, behavior.delayMs ?? 0)
      }
      write(0)
    })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    headers,
    script,
    close: () => new Promise(resolve => server.close(() => { resolve() })),
  }
}
