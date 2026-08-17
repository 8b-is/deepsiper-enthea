import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { DEFAULT_BASE_URL, OsarousAdapter } from '../src/adapter.ts'
import type { OsarousConnectionOptions } from '../src/adapter.ts'

/**
 * Adapter lifecycle and stream-cleanup contract: one resolution per stream,
 * caller abort maps to ABORTED, the idle watchdog maps to TIMEOUT, the
 * consumer controller is aborted and the transport iterator returned in the
 * finally block, and the sidecar health check / stop() stay process-safe.
 */

const textEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":""}}]}',
  '{"choices":[{"delta":{"content":"hello"}}]}',
  '{"choices":[{"delta":{"content":" world"}}]}',
  '{"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
  '[DONE]',
]

const servers: Server[] = []

/**
 * One scripted behavior for the next `/chat/completions` request. The
 * `/v1/models` health endpoint always answers 200 with an empty model list,
 * mirroring the real sidecar.
 */
type CompletionBehavior =
  | { kind: 'sse'; events: string[] }
  | { kind: 'http-error'; status: number; body: string }
  | { kind: 'open' }

function startServer(behavior: CompletionBehavior): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"object":"list","data":[]}')
        return
      }
      if (behavior.kind === 'http-error') {
        response.writeHead(behavior.status, { 'content-type': 'application/json' })
        response.end(behavior.body)
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      if (behavior.kind === 'sse') {
        response.end(behavior.events.map(event => `data: ${event}\n\n`).join(''))
        return
      }
      // 'open': write one chunk and keep the connection open for the test
      // to abort or time out against.
      response.write('data: {"choices":[{"delta":{"content":"stall"}}]}\n\n')
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('unexpected address')
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => { server.close(() => { done() }) }),
      })
    })
  })
}

/** A port nothing listens on: bind a server, note the port, close it. */
async function deadPort(): Promise<number> {
  const server = await startServer({ kind: 'sse', events: [] })
  const port = Number(new URL(server.url).port)
  await server.close()
  return port
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((done) => { server.close(() => { done() }) })))
})

function connection(overrides: Partial<OsarousConnectionOptions> = {}): OsarousConnectionOptions {
  return {
    baseURL: DEFAULT_BASE_URL,
    autoStart: false,
    defaultContextWindow: 262_144,
    models: [{ id: 'local-model', name: 'Local Model', contextWindow: 262_144 }],
    streamIdleTimeoutMs: 300_000,
    ...overrides,
  }
}

function options(connectionOptions: OsarousConnectionOptions): { options: () => OsarousConnectionOptions } {
  return { options: () => connectionOptions }
}

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'osarous',
    model: 'local-model',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] } as never],
    ...overrides,
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('OsarousAdapter: sidecar lifecycle', () => {
  it('reports provider info and advertises catalog models', async () => {
    const adapter = new OsarousAdapter(options(connection()))
    expect(adapter.providerInfo('osarous')).toEqual({ id: 'osarous', name: 'Osarous' })
    const models = await adapter.listModels('osarous')
    expect(models).toEqual([{
      provider: 'osarous',
      id: 'local-model',
      name: 'Local Model',
      inputModalities: ['text'],
    }])
  })

  it('resolves model metadata with the configured context window', async () => {
    const adapter = new OsarousAdapter(options(connection({ models: [{ id: 'local-model' }] })))
    const resolved = await adapter.resolveModel('osarous', 'local-model')
    expect(resolved).toEqual({
      provider: 'osarous',
      id: 'local-model',
      name: 'local-model',
      inputModalities: ['text'],
      context: { contextWindow: 262_144 },
    })
  })

  it('falls back to the default context window for unknown models', async () => {
    const adapter = new OsarousAdapter(options(connection()))
    const resolved = await adapter.resolveModel('osarous', 'unknown-model')
    expect(resolved.context).toEqual({ contextWindow: 262_144 })
  })

  it('answers true from ensureSidecar when the sidecar is reachable', async () => {
    const server = await startServer({ kind: 'sse', events: [] })
    const adapter = new OsarousAdapter(options(connection({ baseURL: server.url })))
    expect(await adapter.ensureSidecar()).toBe(true)
    await server.close()
  })

  it('answers false from ensureSidecar with autoStart off and nothing listening', async () => {
    // Point at a port nothing listens on; autoStart: false must not spawn.
    const port = await deadPort()
    const adapter = new OsarousAdapter(options(connection({ baseURL: `http://127.0.0.1:${port}` })))
    expect(await adapter.ensureSidecar()).toBe(false)
  }, 10_000)

  it('stop() is a no-op when no process was spawned', () => {
    const adapter = new OsarousAdapter(options(connection()))
    expect(() => { adapter.stop() }).not.toThrow()
  })
})

describe('OsarousAdapter: stream', () => {
  it('streams a complete generation through the SSE pipeline', async () => {
    const server = await startServer({ kind: 'sse', events: textEvents })
    const adapter = new OsarousAdapter(options(connection({ baseURL: server.url })))
    const chunks = await collect(adapter.stream(request()))
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'hello' },
      { type: 'text-delta', index: 0, text: ' world' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'hello world' } },
      { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    await server.close()
  })

  it('maps an HTTP error body message into a SERVER LlmError', async () => {
    const server = await startServer({
      kind: 'http-error',
      status: 500,
      body: '{"error":{"message":"model not loaded"}}',
    })
    const adapter = new OsarousAdapter(options(connection({ baseURL: server.url })))
    await expect(collect(adapter.stream(request()))).rejects.toThrow(/model not loaded/)
    await expect(collect(adapter.stream(request()))).rejects.toThrow(LlmError)
    await server.close()
  })

  it('reports ABORTED when the caller aborts mid-stream', async () => {
    const server = await startServer({ kind: 'open' })
    const adapter = new OsarousAdapter(options(connection({ baseURL: server.url })))
    const controller = new AbortController()
    const pending = collect(adapter.stream(request({ signal: controller.signal })))
    setTimeout(() => { controller.abort('test abort') }, 30)
    await expect(pending).rejects.toThrow(/aborted by caller/)
    await server.close()
  })

  it('maps the idle watchdog to TIMEOUT', async () => {
    const server = await startServer({ kind: 'open' })
    const adapter = new OsarousAdapter(options(connection({
      baseURL: server.url,
      streamIdleTimeoutMs: 50,
    })))
    await expect(collect(adapter.stream(request()))).rejects.toThrow(/idle timeout/)
    await expect(collect(adapter.stream(request()))).rejects.toThrow(LlmError)
    await server.close()
  })

  it('fails loud with TRANSPORT when the sidecar is unreachable', async () => {
    const port = await deadPort()
    const adapter = new OsarousAdapter(options(connection({ baseURL: `http://127.0.0.1:${port}` })))
    await expect(collect(adapter.stream(request()))).rejects.toThrow(/unreachable/)
  }, 10_000)

  it('aborts the transport iterator on early consumer return (cleanup contract)', async () => {
    const server = await startServer({ kind: 'open' })
    const adapter = new OsarousAdapter(options(connection({ baseURL: server.url })))
    const stream = adapter.stream(request())
    const iterator = stream[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first.done).toBe(false)
    // Returning early must not hang or throw: the finally block aborts the
    // consumer controller and drains the transport iterator.
    await iterator.return?.()
    await server.close()
  })
})
