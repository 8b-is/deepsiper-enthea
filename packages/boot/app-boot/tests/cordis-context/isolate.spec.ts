/**
 * E2E contract for `ctx.isolate(name, label?)` (docs/cordis-api/context.md):
 * the child gets an independent service scope for `name`, passing the same
 * `label` joins two isolates' scopes, a fresh default label is issued per call,
 * and the parent scope is never touched. Exercised from a real Loader-mounted
 * plugin fiber; child contexts are stashed on `globalThis` and asserted after
 * the tree settles (so the providing fiber is `ACTIVE` and strict `get` works).
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { bootComposition, type BootedComposition } from './harness.ts'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

interface Stash {
  child: Context
  joinedA: Context
  joinedB: Context
  sepC: Context
  sepD: Context
  freshE: Context
  freshF: Context
  parent: Context
}

const boot = async (): Promise<BootedComposition> => {
  const out: Record<string, unknown> = {}
  ;(globalThis as Record<string, unknown>).__isolateDriver = (ctx: Context) => {
    // Independent scope: providing under a child must not reach the parent.
    const child = ctx.isolate('foo')
    child.provide('foo', 'child-value')
    out.parentGet = ctx.get('foo', false)
    out.parentStrictGet = ctx.get('foo')

    // Same explicit label joins two isolates into one scope.
    const label = Symbol('joined')
    const joinedA = ctx.isolate('foo', label)
    const joinedB = ctx.isolate('foo', label)
    joinedA.provide('foo', 'joined')

    // Distinct labels stay independent.
    const sepC = ctx.isolate('foo', Symbol('c'))
    const sepD = ctx.isolate('foo', Symbol('d'))
    sepC.provide('foo', 'c-only')

    // A fresh label is issued per default isolate call.
    const freshE = ctx.isolate('foo')
    const freshF = ctx.isolate('foo')
    freshE.provide('foo', 'e-only')

    ;(globalThis as Record<string, unknown>).__isolateStash = {
      child, joinedA, joinedB, sepC, sepD, freshE, freshF, parent: ctx,
    }
  }
  return bootComposition(
    { 'driver.mjs': "export const name = 'driver'\nexport function apply(ctx) { return globalThis.__isolateDriver(ctx) }\n" },
    '- id: driver\n  name: ./driver.mjs\n',
  )
}

describe('ctx.isolate(name, label?)', () => {
  it('gives the child an independent scope that leaves the parent untouched', async () => {
    const comp = await boot()
    disposers.push(() => comp.dispose())
    const stash = (globalThis as Record<string, unknown>).__isolateStash as Stash
    expect(stash.child.get('foo')).toBe('child-value')
    // Parent never sees the isolated name, strict or non-strict.
    expect(stash.parent.get('foo')).toBeUndefined()
    expect(stash.parent.get('foo', false)).toBeUndefined()
  })

  it('joins scopes sharing the same label and keeps differing labels separate', async () => {
    const comp = await boot()
    disposers.push(() => comp.dispose())
    const stash = (globalThis as Record<string, unknown>).__isolateStash as Stash
    // Same label: both children read the single joined implementation.
    expect(stash.joinedA.get('foo')).toBe('joined')
    expect(stash.joinedB.get('foo')).toBe('joined')
    // Different labels: each scope sees only its own implementation.
    expect(stash.sepC.get('foo')).toBe('c-only')
    expect(stash.sepD.get('foo')).toBeUndefined()
    // Parent still isolated from every child scope.
    expect(stash.parent.get('foo')).toBeUndefined()
  })

  it('issues a fresh default label per call so default isolates never share scope', async () => {
    const comp = await boot()
    disposers.push(() => comp.dispose())
    const stash = (globalThis as Record<string, unknown>).__isolateStash as Stash
    expect(stash.freshE.get('foo')).toBe('e-only')
    expect(stash.freshF.get('foo')).toBeUndefined()
  })
})
