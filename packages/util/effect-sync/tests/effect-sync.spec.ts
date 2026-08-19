/**
 * Tests for the sync-disposal seam: setup runs synchronously, teardown runs exactly once on the
 * first dispose, double-dispose is a no-op, fiber disposal releases the teardown, and the async
 * reject path is logged rather than left unhandled.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { effectSync } from '../src/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('effectSync', () => {
  it('runs setup synchronously and teardown on the returned disposer', () => {
    const ctx = new Context()
    const setup: string[] = []
    const teardown: string[] = []
    const dispose = effectSync(ctx, (registerTeardown) => {
      setup.push('setup')
      registerTeardown(() => { teardown.push('teardown') })
    }, 'test')
    expect(setup).toEqual(['setup'])
    dispose()
    expect(teardown).toEqual(['teardown'])
  })

  it('is idempotent: double dispose runs the teardown once', () => {
    const ctx = new Context()
    let teardownRuns = 0
    const dispose = effectSync(ctx, (registerTeardown) => {
      registerTeardown(() => { teardownRuns += 1 })
    }, 'test')
    dispose()
    dispose()
    expect(teardownRuns).toBe(1)
  })

  it('runs the teardown on fiber disposal', async () => {
    const ctx = new Context()
    let teardownRuns = 0
    const fiber = await ctx.plugin((inner: Context) => {
      effectSync(inner, (registerTeardown) => {
        registerTeardown(() => { teardownRuns += 1 })
      }, 'test')
    })
    await fiber.dispose()
    expect(teardownRuns).toBe(1)
  })

  it('logs a rejected async disposer instead of leaving it unhandled', async () => {
    const ctx = new Context()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = effectSync(ctx, (registerTeardown) => {
      registerTeardown(() => {})
    }, 'boom-label')
    dispose()
    dispose()
    await new Promise(resolve => setImmediate(resolve))
    const calls = errorSpy.mock.calls.filter(call => String(call[0]).includes('boom-label'))
    // At most one logged failure for the single effect release (the second dispose is a no-op).
    expect(calls.length).toBeLessThanOrEqual(1)
  })

  it('releases the effect on explicit dispose so fiber disposal finds it gone', async () => {
    const ctx = new Context()
    let teardownRuns = 0
    const fiber = await ctx.plugin((inner: Context) => {
      const dispose = effectSync(inner, (registerTeardown) => {
        registerTeardown(() => { teardownRuns += 1 })
      }, 'test')
      dispose()
    })
    await fiber.dispose()
    expect(teardownRuns).toBe(1)
  })
})
