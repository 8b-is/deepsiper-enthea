import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as EverosInvariant from '../src/invariant.ts'

describe('tool-everos invariant companion', () => {
  it('registers the package-owned companion (explained empty installer)', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(EverosInvariant)
    expect(EverosInvariant.name).toBe('tool-everos-invariant')
    expect(EverosInvariant.inject).toEqual(['invariants'])
  })
})
