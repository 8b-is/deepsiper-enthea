/** Streamable HTTP discovery and timeout behavior against a keyless local MCP endpoint. */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { discoverServer } from '../src/discovery.ts'
import type { Config } from '../src/index.ts'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })))
})

async function endpoint(options: { hang?: boolean; repeatedCursor?: boolean } = {}) {
  const methods: string[] = []
  const authorization: (string | undefined)[] = []
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
    const message = JSON.parse(Buffer.concat(chunks).toString()) as { id?: string | number; method: string }
    methods.push(message.method)
    authorization.push(request.headers.authorization)
    if (message.id === undefined) { response.writeHead(202).end(); return }
    if (options.hang && message.method === 'tools/list') return
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }], ...options.repeatedCursor ? { nextCursor: 'same' } : {} }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => { response.writeHead(500).end() })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing HTTP fixture address')
  const config: Config = {
    transport: 'streamable-http', serverName: 'remote', url: `http://127.0.0.1:${address.port}/mcp/message`,
    headers: { Authorization: 'Bearer fixture-token' }, toolCallTimeoutMs: 1000, failOnStartupError: false,
  }
  return { config, methods, authorization }
}

describe('saved-server discovery transport', () => {
  it('initializes authenticated HTTP, lists tools only and releases the name on close', async () => {
    const { config, methods, authorization } = await endpoint()
    const ctx = new Context()
    expect(await discoverServer(ctx, config, AbortSignal.timeout(2000))).toEqual(['inspect'])
    expect(await discoverServer(ctx, config, AbortSignal.timeout(2000))).toEqual(['inspect'])
    expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'initialize', 'notifications/initialized', 'tools/list'])
    expect(authorization.every(value => value === 'Bearer fixture-token')).toBe(true)
  })

  it('times out a stalled discovery and releases ownership before another attempt', async () => {
    const { config } = await endpoint({ hang: true })
    const ctx = new Context()
    await expect(discoverServer(ctx, config, AbortSignal.timeout(100))).rejects.toThrow()
    await expect(discoverServer(ctx, config, AbortSignal.timeout(100))).rejects.not.toThrow('already in use')
  })

  it('rejects repeated pagination cursors instead of looping indefinitely', async () => {
    const { config } = await endpoint({ repeatedCursor: true })
    await expect(discoverServer(new Context(), config, AbortSignal.timeout(2000))).rejects.toThrow('repeated cursor')
  })
})
