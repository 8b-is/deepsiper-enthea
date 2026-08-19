/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-quant`.
 * @module @deepseek-ai/dsh-tool-quant/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-quant'

/** Cordis companion plugin name. */
export const name = 'tool-quant-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this stateless adapter contributes one tool; toolset presence is
 * Loader-tested, and the quantize result relation is owned by the seam and its provider.
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
