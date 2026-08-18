/**
 * E2E contract for `ctx.extend(meta?)` (docs/cordis-api/context.md):
 * the child prototypally inherits the parent context, own `meta` properties
 * (including symbol keys) shadow inherited ones, and the parent is never
 * mutated. Exercised from a real Loader-mounted plugin fiber.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { bootComposition, type BootedComposition } from './harness.ts'

/** A context carrying arbitrary own meta properties introduced by `extend(meta)`. */
type Extensible = Context & Record<string, unknown> & { [key: symbol]: unknown }

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

/** A driver plugin fixture that delegates its body to a spec-provided function. */
const driverSource = (globalKey: string): string => [
  "export const name = 'driver'",
  `export function apply(ctx) { return globalThis[${JSON.stringify(globalKey)}](ctx) }`,
  '',
].join('\n')

/** Boot a single-entry composition running the named driver. */
async function bootDriver(globalKey: string): Promise<BootedComposition> {
  return bootComposition(
    { 'driver.mjs': driverSource(globalKey) },
    '- id: driver\n  name: ./driver.mjs\n',
  )
}

describe('ctx.extend(meta?)', () => {
  it('children prototypally inherit parent properties and nested children keep inheriting', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__extendInherit = (ctx: Context) => {
      const parent = ctx.extend({ base: 'parent' }) as Extensible
      const child = parent.extend({})
      out.parentBase = parent.base
      out.childBase = child.base
      // Inherited, not own on the child.
      out.childOwn = Object.prototype.hasOwnProperty.call(child, 'base')
      out.parentOwn = Object.prototype.hasOwnProperty.call(parent, 'base')
      // Nested extension keeps inheriting up the chain.
      out.grandchildBase = child.extend({}).base
    }
    const comp = await bootDriver('__extendInherit')
    disposers.push(() => comp.dispose())
    expect(out).toEqual({
      parentBase: 'parent',
      childBase: 'parent',
      childOwn: false,
      parentOwn: true,
      grandchildBase: 'parent',
    })
  })

  it('own meta properties shadow inherited ones without mutating the parent', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__extendShadow = (ctx: Context) => {
      const parent = ctx.extend({ base: 'parent', n: 1 }) as Extensible
      const child = parent.extend({ base: 'child', extra: true })
      out.childBase = child.base
      out.childOwn = Object.prototype.hasOwnProperty.call(child, 'base')
      out.childExtra = child.extra
      // Parent untouched by the child's meta: `extra` never becomes a parent
      // property (reading an absent prop through the proxy would throw).
      out.parentBase = parent.base
      out.parentHasExtra = Object.prototype.hasOwnProperty.call(parent, 'extra')
      out.parentN = parent.n
    }
    const comp = await bootDriver('__extendShadow')
    disposers.push(() => comp.dispose())
    expect(out).toEqual({
      childBase: 'child',
      childOwn: true,
      childExtra: true,
      parentBase: 'parent',
      parentHasExtra: false,
      parentN: 1,
    })
  })

  it('accepts symbol keys, shadows inherited symbols, and never leaks them onto the parent', async () => {
    const KEY = Symbol('extend.key')
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__extendSymbol = (ctx: Context) => {
      const parent = ctx.extend({ [KEY]: 'parent-sym', base: 'p' }) as Extensible
      const child = parent.extend({ [KEY]: 'child-sym' })
      out.symbolValue = child[KEY]
      out.symbolOwn = Object.prototype.hasOwnProperty.call(child, KEY)
      out.symbolInherited = parent.extend({})[KEY]
      // Shadowing a symbol does not reach the parent's symbol.
      out.parentSymbol = parent[KEY]
      // A symbol only present on the child stays off the parent.
      const only = ctx.extend({ [KEY]: 'only' }) as Extensible
      out.otherSymbol = (ctx.extend({}) as Extensible)[KEY]
      out.onlyOwn = Object.prototype.hasOwnProperty.call(only, KEY)
    }
    const comp = await bootDriver('__extendSymbol')
    disposers.push(() => comp.dispose())
    expect(out).toEqual({
      symbolValue: 'child-sym',
      symbolOwn: true,
      symbolInherited: 'parent-sym',
      parentSymbol: 'parent-sym',
      otherSymbol: undefined,
      onlyOwn: true,
    })
  })

  it('leaves the parent context object untouched (no meta own properties appear on it)', async () => {
    const KEY = Symbol('extend.key')
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__extendNoMutate = (ctx: Context) => {
      const parent = ctx.extend({ a: 1 }) as Extensible
      const before = Reflect.ownKeys(parent)
      const child = parent.extend({ b: 2, [KEY]: 'x' })
      const after = Reflect.ownKeys(parent)
      out.parentKeysUnchanged = JSON.stringify(before) === JSON.stringify(after)
      out.parentABefore = parent.a
      out.parentHasB = Object.prototype.hasOwnProperty.call(parent, 'b')
      out.parentHasKey = Object.prototype.hasOwnProperty.call(parent, KEY)
      out.childHasB = Object.prototype.hasOwnProperty.call(child, 'b')
      out.childHasA = Object.prototype.hasOwnProperty.call(child, 'a')
    }
    const comp = await bootDriver('__extendNoMutate')
    disposers.push(() => comp.dispose())
    expect(out).toEqual({
      parentKeysUnchanged: true,
      parentABefore: 1,
      parentHasB: false,
      parentHasKey: false,
      childHasB: true,
      childHasA: false,
    })
  })
})
