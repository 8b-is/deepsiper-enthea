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
  // Verify crabcc CLI is available via exit code (no JSON parsing needed).
  // crabcc --version outputs plain text like "crabcc 6.2.0", not JSON.
  return new Promise<void>((resolve) => {
    const child = spawn('crabcc', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (c: string) => { stderr += c })
    child.on('close', (code) => {
      if (code !== 0) {
        fail(`crabcc CLI not available (exit code ${code}): ${stderr.trim()}`)
      } else {
        resolve()
      }
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
