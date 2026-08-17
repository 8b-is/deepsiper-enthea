/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-llm-memo`.
 * @module @deepseek-ai/dsh-llm-memo/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-memo'

/** Cordis companion plugin name. */
export const name = 'llm-memo-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the cache's correctness relation (a stored entry
 * equals its exact-request response) is a private memo with no cross-package
 * event or mutable-data relation to check; it is exercised by unit and
 * real-composition tests instead.
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
