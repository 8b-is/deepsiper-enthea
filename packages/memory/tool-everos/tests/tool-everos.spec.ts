/**
 * Unit tests for the tool-everos plugin: tool registration, model-facing
 * schemas, wire payload construction, constraint enforcement, and error
 * mapping. The EverOS server is stubbed at the fetch boundary.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as EverosTool from '../src/index.ts'
import type { EverosConfig } from '../src/types.ts'

const testToolSignal = new AbortController().signal

function config(over: Partial<EverosConfig> = {}): EverosConfig {
  return {
    baseURL: 'http://everos.test',
    appId: 'default',
    projectId: 'default',
    timeoutMs: 5000,
    ...over,
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

/** Scripted fetch: records request URLs and bodies, returns scripted responses. */
function stubFetch(scripted: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; body: unknown }> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : init?.body
    calls.push({ url: resolved, body })
    return scripted(resolved, init ?? {})
  })
  vi.stubGlobal('fetch', fetchImpl)
  return calls
}

async function setup(config: EverosConfig) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(EverosTool, config)
  return ctx
}

let callCounter = 0
function callTool(ctx: Context, tool: string, args: unknown) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: tool,
    arguments: args,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tool-everos', () => {
  it('registers the three everos_* tools with the configured default scope', async () => {
    const ctx = await setup(config())
    const names = ctx.tools.schemas().map(s => s.name)
    expect(names).toContain('everos_memory_add')
    expect(names).toContain('everos_memory_flush')
    expect(names).toContain('everos_memory_search')
  })

  it('stores messages through everos_memory_add with the wire payload', async () => {
    const calls = stubFetch(() => jsonResponse({ request_id: 'req-1', data: { message_count: 2, status: 'accumulated' } }))
    const ctx = await setup(config())
    const result = await callTool(ctx, 'everos_memory_add', {
      session_id: 'sess-1',
      messages: [
        { sender_id: 'user-1', role: 'user', timestamp: 1_700_000_000_000, content: 'remember this' },
        { sender_id: 'agent', role: 'assistant', timestamp: 1_700_000_000_001, content: 'noted' },
      ],
    })
    expect(result.value).toEqual({ request_id: 'req-1', message_count: 2, status: 'accumulated' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('http://everos.test/api/v2/memory/add')
    expect(calls[0]?.body).toMatchObject({
      session_id: 'sess-1',
      app_id: 'default',
      project_id: 'default',
      messages: [
        { sender_id: 'user-1', role: 'user', timestamp: 1_700_000_000_000, content: 'remember this' },
        { sender_id: 'agent', role: 'assistant', timestamp: 1_700_000_000_001, content: 'noted' },
      ],
    })
  })

  it('forwards per-call app/project scope and defer_extraction', async () => {
    const calls = stubFetch(() => jsonResponse({ request_id: 'req-1', data: { message_count: 1, status: 'accumulated' } }))
    const ctx = await setup(config())
    await callTool(ctx, 'everos_memory_add', {
      session_id: 'sess-1',
      app_id: 'team-a',
      project_id: 'proj-2',
      defer_extraction: true,
      messages: [{ sender_id: 'user-1', role: 'user', timestamp: 1, content: 'x' }],
    })
    expect(calls[0]?.body).toMatchObject({ app_id: 'team-a', project_id: 'proj-2', defer_extraction: true })
  })

  it('rejects an empty messages array, oversize batches, and invalid timestamps', async () => {
    const ctx = await setup(config())
    const empty = await callTool(ctx, 'everos_memory_add', { session_id: 's-1', messages: [] })
    expect(empty).toMatchObject({ isError: true, error: /at least one message/ })
    const oversized = await callTool(ctx, 'everos_memory_add', {
      session_id: 's-1',
      messages: Array.from({ length: 501 }, () => ({ sender_id: 'u', role: 'user', timestamp: 1, content: 'x' })),
    })
    expect(oversized).toMatchObject({ isError: true, error: /at most 500 messages/ })
    const badTimestamp = await callTool(ctx, 'everos_memory_add', {
      session_id: 's-1',
      messages: [{ sender_id: 'u', role: 'user', timestamp: 0, content: 'x' }],
    })
    expect(badTimestamp).toMatchObject({ isError: true, error: /positive integer/ })
    const emptySender = await callTool(ctx, 'everos_memory_add', {
      session_id: 's-1',
      messages: [{ sender_id: '   ', role: 'user', timestamp: 1, content: 'x' }],
    })
    expect(emptySender).toMatchObject({ isError: true, error: /non-empty string/ })
  })

  it('flushes a session and maps no_extraction', async () => {
    const calls = stubFetch(() => jsonResponse({ request_id: 'req-2', data: { status: 'no_extraction' } }))
    const ctx = await setup(config())
    const result = await callTool(ctx, 'everos_memory_flush', { session_id: 'sess-1' })
    expect(result.value).toEqual({ request_id: 'req-2', status: 'no_extraction' })
    expect(calls[0]?.url).toBe('http://everos.test/api/v2/memory/flush')
    expect(calls[0]?.body).toEqual({ session_id: 'sess-1', app_id: 'default', project_id: 'default' })
  })

  it('searches user memory with keyword method and ranking bounds', async () => {
    const calls = stubFetch(() => jsonResponse({
      request_id: 'req-3',
      data: {
        episodes: [{
          id: 'ep-1',
          user_id: 'user-1',
          app_id: 'default',
          project_id: 'default',
          session_id: 'sess-1',
          timestamp: '2026-01-01T00:00:00Z',
          sender_ids: ['user-1'],
          summary: 'prefers concise answers',
          subject: 'prefers concise',
          episode: 'prefers concise answers',
          type: 'Conversation',
          score: 0.9,
          atomic_facts: [],
        }],
        profiles: [],
        agent_cases: [],
        agent_skills: [],
        unprocessed_messages: [],
      },
    }))
    const ctx = await setup(config())
    const result = await callTool(ctx, 'everos_memory_search', {
      user_id: 'user-1',
      query: 'answer style',
      method: 'keyword',
      top_k: 5,
      radius: 0.5,
      min_score: 0.2,
      include_profile: true,
    })
    expect(result.value).toMatchObject({
      request_id: 'req-3',
      episodes: [{ id: 'ep-1', summary: 'prefers concise answers', score: 0.9 }],
    })
    expect(calls[0]?.body).toMatchObject({
      user_id: 'user-1',
      query: 'answer style',
      method: 'keyword',
      top_k: 5,
      radius: 0.5,
      min_score: 0.2,
      include_profile: true,
      enable_llm_rerank: false,
    })
    expect(calls[0]?.body).not.toHaveProperty('agent_id')
  })

  it('searches agent memory via agent_id and forwards filters', async () => {
    const calls = stubFetch(() => jsonResponse({
      request_id: 'req-4',
      data: {
        episodes: [],
        profiles: [],
        agent_cases: [],
        agent_skills: [{
          id: 'sk-1',
          agent_id: 'agent-1',
          app_id: 'default',
          project_id: 'default',
          name: 'fizzbuzz-writer',
          description: 'writes fizzbuzz in Rust',
          content: 'fn main() {}',
          confidence: 0.8,
          maturity_score: 0.9,
          source_case_ids: ['c-1'],
          score: 0.7,
        }],
        unprocessed_messages: [],
      },
    }))
    const ctx = await setup(config())
    const result = await callTool(ctx, 'everos_memory_search', {
      agent_id: 'agent-1',
      query: 'rust',
      filters: { session_id: 'sess-1', AND: [{ tag: 'x' }] },
    })
    expect(result.value).toMatchObject({ agent_skills: [{ name: 'fizzbuzz-writer', confidence: 0.8 }] })
    expect(calls[0]?.body).toMatchObject({
      agent_id: 'agent-1',
      method: 'hybrid',
      top_k: -1,
      filters: { session_id: 'sess-1', AND: [{ tag: 'x' }] },
    })
    expect(calls[0]?.body).not.toHaveProperty('user_id')
  })

  it('rejects search without exactly one owner and with out-of-range bounds', async () => {
    const ctx = await setup(config())
    const neither = await callTool(ctx, 'everos_memory_search', { query: 'q' })
    expect(neither).toMatchObject({ isError: true, error: /exactly one of `user_id` \/ `agent_id`/ })
    const both = await callTool(ctx, 'everos_memory_search', { user_id: 'u', agent_id: 'a', query: 'q' })
    expect(both).toMatchObject({ isError: true, error: /exactly one of `user_id` \/ `agent_id`/ })
    const badTopK = await callTool(ctx, 'everos_memory_search', { user_id: 'u', query: 'q', top_k: 0 })
    expect(badTopK).toMatchObject({ isError: true, error: /top_k/ })
    const badRadius = await callTool(ctx, 'everos_memory_search', { user_id: 'u', query: 'q', radius: 1.5 })
    expect(badRadius).toMatchObject({ isError: true, error: /radius/ })
  })

  it('surfaces server failures with the HTTP status and bounded detail', async () => {
    stubFetch(() => new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }))
    const ctx = await setup(config())
    const result = await callTool(ctx, 'everos_memory_flush', { session_id: 's-1' })
    expect(result).toMatchObject({ isError: true, error: /HTTP 500/ })
  })

  it('classifies an aborted request as the canonical tool-call abort', async () => {
    stubFetch(() => {
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    const ctx = await setup(config())
    const controller = new AbortController()
    controller.abort()
    const result = await ctx.tools.execute({
      signal: controller.signal,
      callId: CallId(`call-${++callCounter}`),
      name: 'everos_memory_flush',
      arguments: { session_id: 's-1' },
    })
    expect(result).toMatchObject({ isError: true, error: /tool call aborted/ })
  })

  it('unregisters the tools when its contributing fiber is disposed (HMR-safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(EverosTool, config())
    expect(ctx.tools.schemas().some(s => s.name === 'everos_memory_add')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().some(s => s.name === 'everos_memory_add')).toBe(false)
    expect(ctx.tools.schemas().some(s => s.name === 'everos_memory_search')).toBe(false)
  })
})
