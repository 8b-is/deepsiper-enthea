import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as EvalInvariant from '../src/invariant.ts'

describe('tool-eval invariant companion', () => {
  it('registers the package-owned companion (explained empty installer)', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(EvalInvariant)
    expect(EvalInvariant.name).toBe('tool-eval-invariant')
    expect(EvalInvariant.inject).toEqual(['invariants'])
  })
})
