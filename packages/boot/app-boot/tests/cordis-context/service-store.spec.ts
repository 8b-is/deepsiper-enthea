/**
 * E2E contracts for the service store and mixins (docs/cordis-api/context.md):
 * `ctx.get`/`ctx.set`/`ctx.provide`/`ctx.accessor`/`ctx.mixin`, including the
 * negative contracts (strict get before provide, set by a non-provider, setting
 * an unprovided name, duplicate provide/accessor, and removal of provided
 * services/accessors/mixins on fiber unload). Every case runs through a real
 * Loader composition with distinct entry fibers.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import { bootComposition } from './harness.ts'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

const disposeEntry = async (ctx: Context, id: string): Promise<void> => {
  const entry = [...ctx.loader.entries()].find(e => e.options.id === id)
  expect(entry, `entry ${id} should exist`).toBeDefined()
  await (entry as Entry).fiber!.dispose()
}

describe('ctx.get / ctx.set', () => {
  it('get defaults to strict, returns undefined when unprovided, and set updates the value', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__getDriver = (ctx: Context) => {
      out.strictBeforeProvide = ctx.get('alpha')
      out.nonStrictBeforeProvide = ctx.get('alpha', false)
      out.unprovided = ctx.get('missing')
      out.unprovidedExplicit = ctx.get('missing', true)
      ctx.provide('alpha', 'a0')
      // During the providing fiber's apply (LOADING, not yet ACTIVE), strict get
      // still returns undefined while non-strict sees the value.
      out.strictDuringApply = ctx.get('alpha')
      out.nonStrictDuringApply = ctx.get('alpha', false)
      // The providing fiber may set its own service.
      ctx.set('alpha', 'a1')
      out.nonStrictAfterSet = ctx.get('alpha', false)
      try {
        ctx.set('neverProvided', 1)
      } catch (error) {
        out.setUnprovidedError = String(error)
      }
    }
    const comp = await bootComposition(
      { 'alpha.mjs': "export const name = 'alpha'\nexport function apply(ctx) { return globalThis.__getDriver(ctx) }\n" },
      '- id: alpha\n  name: ./alpha.mjs\n',
    )
    disposers.push(() => comp.dispose())
    expect(out).toMatchObject({
      strictBeforeProvide: undefined,
      nonStrictBeforeProvide: undefined,
      unprovided: undefined,
      unprovidedExplicit: undefined,
      strictDuringApply: undefined,
      nonStrictDuringApply: 'a0',
      nonStrictAfterSet: 'a1',
    })
    expect(out.setUnprovidedError).toEqual(expect.stringContaining('without provide'))
    // Once the fiber is ACTIVE, strict get returns the (updated) value.
    expect(comp.ctx.get('alpha')).toBe('a1')
  })

  it('rejects set by a fiber that is not the provider', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__alphaDriver = (ctx: Context) => {
      ctx.provide('alpha', 'a0')
    }
    ;(globalThis as Record<string, unknown>).__otherDriver = (ctx: Context) => {
      try {
        ctx.set('alpha', 'stolen')
      } catch (error) {
        out.setByNonProviderError = String(error)
      }
    }
    const comp = await bootComposition(
      {
        'alpha.mjs': "export const name = 'alpha'\nexport function apply(ctx) { return globalThis.__alphaDriver(ctx) }\n",
        'other.mjs': [
          "export const name = 'other'",
          "export const inject = ['alpha']",
          'export function apply(ctx) { return globalThis.__otherDriver(ctx) }',
          '',
        ].join('\n'),
      },
      [
        '- id: alpha',
        '  name: ./alpha.mjs',
        '- id: other',
        '  name: ./other.mjs',
        '',
      ].join('\n'),
    )
    disposers.push(() => comp.dispose())
    expect(out.setByNonProviderError).toEqual(expect.stringContaining('in multiple fibers'))
  })
})

describe('ctx.provide', () => {
  it('duplicate provide in the same scope throws', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__dupDriver = (ctx: Context) => {
      ctx.provide('dup', 'one')
      try {
        ctx.provide('dup', 'two')
      } catch (error) {
        out.duplicateError = String(error)
      }
    }
    const comp = await bootComposition(
      { 'dup.mjs': "export const name = 'dup'\nexport function apply(ctx) { return globalThis.__dupDriver(ctx) }\n" },
      '- id: dup\n  name: ./dup.mjs\n',
    )
    disposers.push(() => comp.dispose())
    expect(out.duplicateError).toEqual(expect.stringContaining('has been registered at'))
  })

  it('the disposer unregisters the service and wakes dependents, which re-run on re-provide', async () => {
    const out: Record<string, unknown> = { seen: [] as unknown[] }
    ;(globalThis as Record<string, unknown>).__provideDriver = (ctx: Context) => {
      const dispose = ctx.provide('alpha', 'a0')
      ;(globalThis as Record<string, unknown>).__disposeAlpha = dispose
    }
    ;(globalThis as Record<string, unknown>).__consumeDriver = (ctx: Context) => {
      ;(out.seen as unknown[]).push(ctx.get('alpha'))
      ;(globalThis as Record<string, unknown>).__consumerCtx = ctx
    }
    const comp = await bootComposition(
      {
        'alpha.mjs': "export const name = 'alpha'\nexport function apply(ctx) { return globalThis.__provideDriver(ctx) }\n",
        'consumer.mjs': [
          "export const name = 'consumer'",
          "export const inject = ['alpha']",
          'export function apply(ctx) { return globalThis.__consumeDriver(ctx) }',
          '',
        ].join('\n'),
      },
      [
        '- id: alpha',
        '  name: ./alpha.mjs',
        '- id: consumer',
        '  name: ./consumer.mjs',
        '',
      ].join('\n'),
    )
    disposers.push(() => comp.dispose())
    // The dependent activated once the provider became visible.
    expect(out.seen).toEqual(['a0'])
    expect(comp.ctx.get('alpha')).toBe('a0')

    // Running the disposer unregisters the service (waking dependents).
    const dispose = (globalThis as Record<string, unknown>).__disposeAlpha as () => Promise<void>
    await dispose()
    expect(comp.ctx.get('alpha')).toBeUndefined()

    // Re-providing wakes the dependent again; its body re-runs with the new value.
    comp.ctx.provide('alpha', 'a2')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(out.seen).toEqual(['a0', 'a2'])
    expect(comp.ctx.get('alpha')).toBe('a2')
  })

  it('a provided service is unregistered when its owning fiber unloads', async () => {
    ;(globalThis as Record<string, unknown>).__ownedDriver = (ctx: Context) => {
      ctx.provide('fiberOwned', 'value')
    }
    const comp = await bootComposition(
      { 'owned.mjs': "export const name = 'owned'\nexport function apply(ctx) { return globalThis.__ownedDriver(ctx) }\n" },
      '- id: owned\n  name: ./owned.mjs\n',
    )
    disposers.push(() => comp.dispose())
    expect(comp.ctx.get('fiberOwned')).toBe('value')
    await disposeEntry(comp.ctx, 'owned')
    expect(comp.ctx.get('fiberOwned')).toBeUndefined()
  })
})

describe('ctx.accessor', () => {
  it('defines a get/set-backed property, rejects duplicates, and is removed on fiber unload', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__accessorDriver = (ctx: Context) => {
      const state = { n: 0 }
      ctx.accessor('computed', {
        get: () => `n=${state.n}`,
        set: (value: number) => { state.n = value; return true },
      })
      // `computed` is a dynamically-declared accessor, not a typed Context key.
      const dynamic = ctx as unknown as { computed: unknown }
      out.computedInitial = dynamic.computed
      dynamic.computed = 5
      out.computedAfterSet = dynamic.computed
      try {
        ctx.accessor('computed', { get: () => 'dup' })
      } catch (error) {
        out.duplicateError = String(error)
      }
    }
    const comp = await bootComposition(
      { 'accessor.mjs': "export const name = 'accessor'\nexport function apply(ctx) { return globalThis.__accessorDriver(ctx) }\n" },
      '- id: accessor\n  name: ./accessor.mjs\n',
    )
    disposers.push(() => comp.dispose())
    expect(out).toMatchObject({
      computedInitial: 'n=0',
      computedAfterSet: 'n=5',
    })
    expect(out.duplicateError).toEqual(expect.stringContaining('already declared as accessor'))
    expect((comp.ctx as unknown as { computed: unknown }).computed).toBe('n=5')
    await disposeEntry(comp.ctx, 'accessor')
    expect((comp.ctx as unknown as { computed: unknown }).computed).toBeUndefined()
  })

  it('rejects a declaration that conflicts with the other property kind', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__conflictDriver = (ctx: Context) => {
      ctx.accessor('acc', { get: () => 'a' })
      try {
        ctx.provide('acc', 'value')
      } catch (error) {
        out.provideOverAccessor = String(error)
      }
      ctx.provide('svc', 'value')
      try {
        ctx.accessor('svc', { get: () => 's' })
      } catch (error) {
        out.accessorOverService = String(error)
      }
    }
    const comp = await bootComposition(
      { 'conflict.mjs': "export const name = 'conflict'\nexport function apply(ctx) { return globalThis.__conflictDriver(ctx) }\n" },
      '- id: conflict\n  name: ./conflict.mjs\n',
    )
    disposers.push(() => comp.dispose())
    expect(out.provideOverAccessor).toEqual(expect.stringContaining('already declared as accessor'))
    expect(out.accessorOverService).toEqual(expect.stringContaining('already declared as service'))
  })
})

describe('ctx.mixin', () => {
  it('forwards service members onto ctx bound to the service, and removes them on fiber unload', async () => {
    const out: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__mixinDriver = (ctx: Context) => {
      const counter = {
        n: 0,
        bump() { this.n += 1; return this.n },
      }
      ctx.provide('counter', counter)
      // `counter`/`bump` are dynamic service keys, not typed Context members.
      const dynamic = ctx as unknown as { mixin: (name: string, keys: string[]) => unknown; bump: () => number }
      dynamic.mixin('counter', ['bump'])
      out.first = dynamic.bump()
      out.second = dynamic.bump()
      out.serviceState = counter.n
    }
    const comp = await bootComposition(
      { 'mixin.mjs': "export const name = 'mixin'\nexport function apply(ctx) { return globalThis.__mixinDriver(ctx) }\n" },
      '- id: mixin\n  name: ./mixin.mjs\n',
    )
    disposers.push(() => comp.dispose())
    // The forwarded ctx.bump is bound to the source service, so repeated calls
    // mutate the same state.
    expect(out).toEqual({ first: 1, second: 2, serviceState: 2 })
    // `bump` is a dynamically-mixed key, not a typed Context member.
    expect((comp.ctx as unknown as { bump: () => number }).bump()).toBe(3)
    await disposeEntry(comp.ctx, 'mixin')
    expect((comp.ctx as unknown as { bump?: unknown }).bump).toBeUndefined()
  })
})
