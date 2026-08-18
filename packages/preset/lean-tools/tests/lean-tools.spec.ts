import { describe, expect, it, vi } from 'vitest'
import * as LeanTools from '../src/index.ts'
import * as LeanToolsInvariant from '../src/invariant.ts'
import { Context, type Context as CordisContext } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

describe('lean-tools preset', () => {
  it('restricts every agent to the configured deny set on creation', () => {
    const restrict = vi.fn()
    const ctx = {
      on: (event: string, listener: (arg: { agent: unknown }) => void) => {
        expect(event).toBe('agent/created')
        ;(ctx as unknown as { listener: typeof listener }).listener = listener
      },
    } as unknown as CordisContext
    LeanTools.apply(ctx, {})
    const agent = { ctx: { tools: { restrict } } }
    ;(ctx as unknown as { listener: (arg: { agent: unknown }) => void }).listener({ agent })
    expect(restrict).toHaveBeenCalledWith({ deny: ['ralph', 'subagent_fork', 'workflow'] })
  })

  it('honors a custom deny list', () => {
    const restrict = vi.fn()
    let listener: (arg: { agent: unknown }) => void = () => {}
    const ctx = {
      on: (_event: string, fn: (arg: { agent: unknown }) => void) => { listener = fn },
    } as unknown as CordisContext
    LeanTools.apply(ctx, { deny: ['workflow'] })
    listener({ agent: { ctx: { tools: { restrict } } } })
    expect(restrict).toHaveBeenCalledWith({ deny: ['workflow'] })
  })
})

describe('lean-tools invariant companion', () => {
  it('registers under the invariants service', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(LeanToolsInvariant)).resolves.toBeDefined()
  })
})
