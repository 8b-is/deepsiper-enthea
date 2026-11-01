/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-voice-kokoro`.
 * @module @deepseek-ai/dsh-voice-kokoro/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-voice-kokoro'

/** Cordis companion plugin name. */
export const name = 'voice-kokoro-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this provider owns no event/data relation — it wraps the
 * kokoro-speak CLI whose correctness is test-gated, and its id reservation is
 * atomically maintained by the seam.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
