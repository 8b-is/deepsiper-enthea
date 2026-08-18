import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import type { SubagentProvider, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import * as AgentField from '../src/index.ts'
import * as AgentFieldInvariant from '../src/invariant.ts'

function fakeRequest(): SubagentStartRequest {
  const header: SessionHeader = { version: 0, id: SessionId('parent'), createdAt: 1, cwd: process.cwd() }
  return {
    prompt: [{ type: 'text', text: 'fix it' }],
    label: 'swe',
    parent: { session: { header } } as never,
    signal: new AbortController().signal,
  } as unknown as SubagentStartRequest
}

/** A ctx whose subagents service records the registered provider. */
function harnessCtx() {
  const registered: SubagentProvider[] = []
  const ctx = {
    subagents: { registerProvider: (provider: SubagentProvider) => { registered.push(provider) } },
    logger: { warn: vi.fn() },
  }
  return { ctx, registered }
}

/** A fetch stub that settles an execution immediately. */
function stubFetch(): typeof fetch {
  return async (url) => {
    if (rawUrl(url).includes('/execute/async/')) {
      return { ok: true, status: 200, json: async () => ({ execution_id: 'exec-x' }) } as Response
    }
    return { ok: true, status: 200, json: async () => ({ status: 'succeeded', result: { ok: true } }) } as Response
  }
}

/** Extract a stable URL string from any fetch input. */
function rawUrl(url: string | URL | Request): string {
  return typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
}


describe('subagent-agentfield plugin', () => {
  it('registers the agentfield provider through apply', () => {
    const { ctx, registered } = harnessCtx()
    AgentField.apply(ctx as never, {})
    expect(registered).toHaveLength(1)
    expect(registered[0]!.name).toBe('agentfield')
    expect(registered[0]!.capabilities).toEqual({
      outputSchema: false, depthLimit: false, toolFilter: false, persona: false,
    })
    expect(registered[0]!.inheritsParentContext).toBe(false)
  })

  it('starts a run with a model override and no parent cwd', async () => {
    const { ctx, registered } = harnessCtx()
    AgentField.apply(ctx as never, { model: 'openrouter/x', fetchImpl: stubFetch() })
    const provider = registered[0]!
    const noCwd = {
      ...fakeRequest(),
      parent: { session: { header: { version: 0, id: SessionId('parent'), createdAt: 1 } } },
    }
    const run = await provider.start({
      ...noCwd,
      descriptor: { provider: 'agentfield', id: SessionId('child'), authority: 'parent' },
    } as never)
    const result = await run.result
    expect(result.stopReason).toBe('completed')
    await run.dispose()
  })

  it('logs a child failure through the diagnostic sink', async () => {
    const { ctx, registered } = harnessCtx()
    const failingFetch = (async () => ({
      ok: true, status: 200, json: async () => ({ status: 'failed', error: 'boom' }),
    }) as Response) as typeof fetch
    AgentField.apply(ctx as never, { fetchImpl: failingFetch })
    const provider = registered[0]!
    const run = await provider.start({
      ...fakeRequest(),
      descriptor: { provider: 'agentfield', id: SessionId('child'), authority: 'parent' },
    } as never)
    const result = await run.result
    expect(result.stopReason).toBe('error')
    expect(ctx.logger.warn).toHaveBeenCalled()
    await run.dispose()
  })

  it('starts a run through the registered provider against a stubbed control plane', async () => {
    const { ctx, registered } = harnessCtx()
    AgentField.apply(ctx as never, { fetchImpl: stubFetch() })
    const provider = registered[0]!
    const run = await provider.start({
      ...fakeRequest(),
      descriptor: { provider: 'agentfield', id: SessionId('child'), authority: 'parent' },
    } as never)
    const result = await run.result
    expect(result.stopReason).toBe('completed')
    expect((result.output[0]! as { text: string }).text).toContain('"ok"')
    await run.dispose()
  })
})

describe('subagent-agentfield invariant companion', () => {
  it('registers under the invariants service', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(AgentFieldInvariant)).resolves.toBeDefined()
  })
})
