/**
 * Wire tests for the EverOS client against a real local HTTP server
 * speaking the EverOS `/api/v2` dialect: envelope parsing, error mapping,
 * malformed payload rejection, and timeout behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EverosClient, EverosError } from '../src/client.ts'
import { EverosStubServer } from './everos-stub.ts'
import type { EverosConfig } from '../src/types.ts'

const signal = new AbortController().signal

let stub: EverosStubServer

beforeEach(async () => {
  stub = new EverosStubServer()
  await stub.start()
})

afterEach(async () => {
  await stub.close()
})

function client(over: Partial<EverosConfig> = {}): EverosClient {
  return new EverosClient({
    baseURL: stub.url,
    appId: 'default',
    projectId: 'default',
    timeoutMs: 5000,
    ...over,
  })
}

describe('EverosClient wire contract', () => {
  it('adds messages and spreads the envelope data', async () => {
    const result = await client().add('sess-1', [
      { sender_id: 'user-1', role: 'user', timestamp: 1_700_000_000_000, content: 'remember this' },
    ], {}, signal)
    expect(result).toEqual({ request_id: 'req-1', message_count: 1, status: 'accumulated' })
    expect(stub.sessions.get('sess-1')).toHaveLength(1)
  })

  it('flushes a session and reports extraction', async () => {
    await client().add('sess-1', [{ sender_id: 'u', role: 'user', timestamp: 1, content: 'x' }], {}, signal)
    const result = await client().flush('sess-1', {}, signal)
    expect(result).toEqual({ request_id: 'req-2', status: 'extracted' })
  })

  it('searches and parses the full typed data envelope', async () => {
    await client().add('sess-1', [{ sender_id: 'user-1', role: 'user', timestamp: 1, content: 'prefers concise answers' }], {}, signal)
    const result = await client().search({ userId: 'user-1' }, { query: 'style', method: 'keyword', top_k: 5 }, {}, signal)
    expect(result.request_id).toBe('req-2')
    expect(result.data.episodes).toHaveLength(1)
    expect(result.data.episodes[0]).toMatchObject({
      id: 'ep-1',
      session_id: 'sess-1',
      summary: 'prefers concise answers',
      score: 0.9,
    })
    expect(result.data.agent_cases).toEqual([])
    expect(result.data.agent_skills).toEqual([])
  })

  it('rejects a search without exactly one owner', async () => {
    await expect(client().search({}, { query: 'q' }, {}, signal)).rejects.toThrow(/exactly one/)
    await expect(client().search({ userId: 'u', agentId: 'a' }, { query: 'q' }, {}, signal)).rejects.toThrow(/exactly one/)
  })

  it('maps a server error to EverosError with status and detail', async () => {
    stub.scripted = path => path === '/api/v2/memory/flush'
      ? { status: 422, body: { detail: 'session_id must be 1..128 chars' } }
      : undefined
    const error = await client().flush('sess-1', {}, signal).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EverosError)
    expect((error as EverosError).status).toBe(422)
    expect((error as EverosError).message).toContain('HTTP 422')
    expect((error as EverosError).message).toContain('session_id must be 1..128 chars')
  })

  it('rejects an invalid response envelope with a field-level message', async () => {
    stub.scripted = path => path === '/api/v2/memory/add'
      ? { body: { request_id: 'req-9', data: { message_count: 'many', status: 'accumulated' } } }
      : undefined
    const error = await client().add('s-1', [{ sender_id: 'u', role: 'user', timestamp: 1, content: 'x' }], {}, signal)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EverosError)
    expect((error as EverosError).status).toBeNull()
    expect((error as EverosError).message).toMatch(/invalid response.*message_count/)
  })

  it('rejects a non-JSON success body', async () => {
    stub.scripted = path => path === '/api/v2/memory/flush'
      ? { body: 'not-json' }
      : undefined
    const error = await client().flush('s-1', {}, signal).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EverosError)
    expect((error as EverosError).message).toMatch(/invalid response/)
  })

  it('aborts on timeout with a visible deadline message', async () => {
    stub.delayMs = 500
    const error = await client({ timeoutMs: 50 }).flush('s-1', {}, signal).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('timed out after 50ms')
  })

  it('honours a caller-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await client().flush('s-1', {}, controller.signal).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('AbortError')
  })
})
