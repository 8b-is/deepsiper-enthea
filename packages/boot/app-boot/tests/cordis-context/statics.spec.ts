/**
 * E2E contract for the static members of `Context` (docs/cordis-api/context.md):
 * `Context.effect`, `Context.filter`, `Context.isolate`, and `Context.intercept`
 * are the global-symbol keys under which effects, listener filters, the
 * isolation map, and the intercept map live; and `Context.is(value)` brands
 * contexts by a global symbol (so it holds across realms and is not
 * `instanceof`). Exercised against a real Loader-mounted context.
 */

import { afterEach, describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { bootComposition } from './harness.ts'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

describe('Context static symbol keys', () => {
  it('are the global symbols used by the context internals', async () => {
    expect(Context.effect).toBe(Symbol.for('cordis.effect'))
    expect(Context.filter).toBe(Symbol.for('cordis.filter'))
    expect(Context.isolate).toBe(Symbol.for('cordis.isolate'))
    expect(Context.intercept).toBe(Symbol.for('cordis.intercept'))
    expect(Context.effect).toBeTypeOf('symbol')
    expect(Context.filter).toBeTypeOf('symbol')
    expect(Context.isolate).toBeTypeOf('symbol')
    expect(Context.intercept).toBeTypeOf('symbol')
  })

  it('are distinct keys that index the real isolation/intercept maps on a context', async () => {
    const comp = await bootComposition(
      { 'driver.mjs': "export const name = 'driver'\nexport function apply() {}\n" },
      '- id: driver\n  name: ./driver.mjs\n',
    )
    disposers.push(() => comp.dispose())
    // The static symbol keys index the real maps; Context's interface has no
    // symbol index signature, so read through a symbol-keyed view.
    const symbolView = comp.ctx as unknown as { [key: symbol]: unknown }
    const isolate = symbolView[Context.isolate]
    const intercept = symbolView[Context.intercept]
    expect(isolate).toBeTypeOf('object')
    expect(intercept).toBeTypeOf('object')
    // The static symbol and the inline symbol key reach the same map.
    expect(symbolView[Symbol.for('cordis.isolate')]).toBe(isolate)
    expect(symbolView[Symbol.for('cordis.intercept')]).toBe(intercept)
    expect(Context.isolate).not.toBe(Context.intercept)
    expect(Context.effect).not.toBe(Context.filter)
  })
})

describe('Context.is(value)', () => {
  it('accepts real context proxies and the context prototype', async () => {
    const comp = await bootComposition(
      { 'driver.mjs': "export const name = 'driver'\nexport function apply() {}\n" },
      '- id: driver\n  name: ./driver.mjs\n',
    )
    disposers.push(() => comp.dispose())
    expect(Context.is(comp.ctx)).toBe(true)
    expect(Context.is(comp.ctx.root)).toBe(true)
    expect(Context.is(Context.prototype)).toBe(true)
  })

  it('rejects non-context values', () => {
    expect(Context.is(undefined)).toBe(false)
    expect(Context.is(null)).toBe(false)
    expect(Context.is({})).toBe(false)
    expect(Context.is(42)).toBe(false)
    expect(Context.is('ctx')).toBe(false)
    expect(Context.is(() => {})).toBe(false)
  })

  it('brands by a global symbol rather than instanceof, across realms', () => {
    // A foreign-realm object that carries only the global-symbol brand is a
    // context to Context.is even though it has no instanceof relationship.
    const sandbox: Record<string, unknown> = {}
    vm.createContext(sandbox)
    vm.runInContext('globalThis.__brand = { [Symbol.for("cordis.is")]: true }', sandbox)
    const foreign = sandbox.__brand as object
    expect(foreign instanceof Context).toBe(false)
    expect(Context.is(foreign)).toBe(true)
  })
})
