/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-skill-crabcc`.
 *
 * @module @deepseek-ai/dsh-skill-crabcc/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { spawn } from 'node:child_process'

const PACKAGE_NAME = '@deepseek-ai/dsh-skill-crabcc'

/** Cordis companion plugin name. */
export const name = 'skill-crabcc-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Install this package's invariant checks. */
const install: InvariantInstaller = async (_ctx, fail) => {
  // crabcc --version prints plain text ("crabcc 6.2.0"), so the check is the
  // exit code. The CLI is an optional external tool: an absent binary leaves
  // the skill unavailable rather than violating a harness invariant, while an
  // installed-but-broken binary still fails loud.
  return new Promise<void>((resolve) => {
    const child = spawn('crabcc', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let settled = false
    const settle = (failure?: string): void => {
      if (settled) return
      settled = true
      if (failure !== undefined) fail(failure)
      resolve()
    }
    // Attach the failure path before the stdio listeners so a spawn error is
    // always observed; ENOENT means the optional CLI is simply absent.
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') settle()
      else settle(`crabcc CLI probe failed: ${error.message}`)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('close', (code) => {
      settle(code === 0 ? undefined : `crabcc CLI not available (exit code ${code}): ${stderr.trim()}`)
    })
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
