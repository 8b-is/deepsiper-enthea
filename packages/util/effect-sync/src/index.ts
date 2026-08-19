/**
 * Synchronous disposer seam over Cordis `ctx.effect`.
 *
 * `ctx.effect` registers a fiber-scoped effect and returns an async disposer; registries that
 * expose a synchronous dispose API (provider registration, service lifecycle) end up writing
 * `() => void dispose()` and discarding the promise. {@link effectSync} gives those callers a sync
 * disposer whose fiber scope and teardown semantics match `ctx.effect`, routing the async
 * reject path to a structured log instead of an unhandled rejection.
 * @module @deepseek-ai/dsh-effect-sync
 */

import type { Context } from '@deepseek-ai/cordis'

/** A synchronous disposer; idempotent (safe to call more than once). */
export interface SyncDisposable {
  /** Release the resource; repeated calls are no-ops. */
  dispose(): void
}

/**
 * The teardown a caller registers for its effect's cleanup. Runs exactly once, on the first
 * dispose (caller-initiated or fiber disposal), whichever comes first.
 */
export type EffectTeardown = () => void

/**
 * The `setup` callback: perform registration-side work and hand the teardown back.
 * @param registerTeardown - call with the cleanup to run on dispose.
 */
export type EffectSetup = (registerTeardown: (teardown: EffectTeardown) => void) => void

/**
 * Register a fiber-scoped effect with a synchronous disposer.
 *
 * The `setup` callback runs immediately (synchronously) at call time; whatever it registers as the
 * teardown runs exactly once — on the first explicit `dispose()` or fiber disposal, whichever comes
 * first — and the returned disposer is idempotent. The async `ctx.effect` disposer is released on
 * explicit dispose and its rejection path is logged with the label, never left unhandled.
 * @param ctx - the Cordis context registering the effect.
 * @param setup - perform setup and register the teardown.
 * @param label - diagnostic label for the effect (mirrors `ctx.effect`'s label).
 * @returns a synchronous, idempotent disposer releasing the effect.
 */
export function effectSync(ctx: Context, setup: EffectSetup, label: string): () => void {
  let teardown: EffectTeardown | undefined
  let disposed = false

  const runCleanup = (): void => {
    if (disposed) return
    disposed = true
    teardown?.()
  }

  // The fiber-scoped hook: dispose through ctx.effect runs our teardown once.
  const disposeEffect = ctx.effect(function* () {
    yield runCleanup
  }, label)

  const dispose = (): void => {
    runCleanup()
    void Promise.resolve(disposeEffect()).catch((error: unknown) => {
      console.error(`[effect-sync:${label}] effect dispose failed`, error)
    })
  }

  setup((fn) => { teardown = fn })
  return dispose
}

export default effectSync
