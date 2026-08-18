/**
 * E2E contract for the core context services (docs/cordis-api/context.md):
 * `ctx.root`, `ctx.baseUrl`, `ctx.events`, `ctx.logger`, `ctx.reflect`, and
 * `ctx.registry` are present with their documented shapes, and their members
 * are mixed onto `ctx` (so `ctx.on`, `ctx.emit`, `ctx.plugin`, `ctx.inject`,
 * and `ctx.provide` forward to the underlying services, binding methods to the
 * service). Exercised from a real Loader-mounted plugin fiber.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { bootComposition } from './harness.ts'

// Declare the test-only event on the Cordis event map so the mixed-in
// `ctx.on`/`ctx.emit` overloads accept it (the standard Cordis pattern).
declare module '@deepseek-ai/cordis' {
  interface Events {
    'cordis-context/ping'(value: unknown): void
  }
}

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

const DRIVER = "export const name = 'driver'\nexport function apply(ctx) { return globalThis.__coreDriver(ctx) }\n"
const YML = '- id: driver\n  name: ./driver.mjs\n'

async function boot(): Promise<{ dispose: () => Promise<void>; out: Record<string, unknown> }> {
  const out: Record<string, unknown> = {}
  ;(globalThis as Record<string, unknown>).__coreDriver = async (ctx: Context) => {
    // Presence + shape of each documented core service.
    out.hasEvents = typeof ctx.events?.on === 'function' && typeof ctx.events?.emit === 'function'
    out.hasReflect = typeof ctx.reflect?.get === 'function' && typeof ctx.reflect?.provide === 'function'
    out.hasRegistry = typeof ctx.registry?.plugin === 'function' && typeof ctx.registry?.inject === 'function'
    out.loggerCallable = typeof ctx.logger === 'function'
    out.loggerNamed = typeof ctx.logger('driver').info === 'function' && typeof ctx.logger('driver').error === 'function'

    // ctx.root is the shared root; children differ from it but share it.
    out.rootShared = ctx.root.root === ctx.root
    out.rootNotChild = ctx.root !== ctx
    out.baseUrl = ctx.baseUrl

    // events mixin: a ctx.on listener is delivered by ctx.events.emit and by ctx.emit.
    const viaService: unknown[] = []
    const viaCtx: unknown[] = []
    const offA = ctx.on('cordis-context/ping', (v: unknown) => viaService.push(v))
    const offB = ctx.events.on('cordis-context/ping', (v: unknown) => viaCtx.push(v)) as () => void
    ctx.events.emit('cordis-context/ping', 'from-events')
    ctx.emit('cordis-context/ping', 'from-ctx')
    offA()
    offB()
    ctx.emit('cordis-context/ping', 'after-off')
    out.eventsForwarded = { viaService, viaCtx }

    // registry mixin: ctx.plugin loads a real plugin; ctx.inject defers a body.
    let pluginRan = false
    await ctx.plugin({ apply: () => { pluginRan = true } })
    let injectRan = false
    await ctx.inject([], () => { injectRan = true })
    out.pluginForwarded = pluginRan
    out.injectForwarded = injectRan

    // reflect mixin: ctx.provide registers a service ctx.get can read.
    ctx.provide('coreProvided', 'value')
    out.provideForwarded = ctx.get('coreProvided')
    out.provideVisibleToService = ctx.reflect.get('coreProvided')
  }
  const comp = await bootComposition({ 'driver.mjs': DRIVER }, YML)
  disposers.push(() => comp.dispose())
  return { dispose: () => comp.dispose(), out }
}

describe('ctx core services', () => {
  it('exposes events/reflect/registry/logger with documented shapes', async () => {
    const { out } = await boot()
    expect(out).toMatchObject({
      hasEvents: true,
      hasReflect: true,
      hasRegistry: true,
      loggerCallable: true,
      loggerNamed: true,
      rootShared: true,
      rootNotChild: true,
    })
  })

  it('lets the runtime set baseUrl to the mounted config directory URL', async () => {
    const { out } = await boot()
    // The Loader/Include runtime sets ctx.baseUrl so relative plugin/module
    // specifiers resolve against the mounted config's directory.
    expect(typeof out.baseUrl).toBe('string')
    expect(out.baseUrl).toMatch(/^file:\/\//)
    expect(out.baseUrl).toMatch(/\/$/)
  })

  it('forwards event members onto ctx (listeners registered on either side are delivered)', async () => {
    const { out } = await boot()
    expect(out.eventsForwarded).toEqual({
      // ctx.events.emit delivered to the ctx.on listener.
      viaService: ['from-events', 'from-ctx'],
      // ctx.emit delivered to the ctx.events.on listener.
      viaCtx: ['from-events', 'from-ctx'],
    })
  })

  it('forwards registry and reflect members onto ctx (plugin/inject/provide)', async () => {
    const { out } = await boot()
    expect(out.pluginForwarded).toBe(true)
    expect(out.injectForwarded).toBe(true)
    expect(out.provideForwarded).toBe('value')
    expect(out.provideVisibleToService).toBe('value')
  })
})
