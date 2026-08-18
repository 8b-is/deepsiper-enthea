/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-lean-tools`.
 * @module @deepseek-ai/dsh-lean-tools/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-lean-tools'

/** Cordis companion plugin name. */
export const name = 'lean-tools-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the per-agent restriction is applied at creation and
 * owned by the tool runtime's scoped restriction enforcement; there is no
 * continuously observable in-process relation to check here.
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
