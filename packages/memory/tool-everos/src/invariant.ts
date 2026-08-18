/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-everos`.
 * @module @deepseek-ai/dsh-tool-everos/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-everos'

/** Cordis companion plugin name. */
export const name = 'tool-everos-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this tool's contracts are HTTP round-trips to a
 * local EverOS server (wire payloads, envelope validation, timeout and
 * abort mapping) proven by package tests; it owns no durable event/data
 * relation to assert.
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
