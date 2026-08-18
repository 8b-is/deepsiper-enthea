/**
 * Shared REAL-composition harness for the Cordis Context API E2E specs.
 *
 * Each spec boots a test-only `cordis.yml` (plus its plugin `.mjs` fixtures)
 * through the real Cordis Loader inside this process — the same composition
 * path a shipped app uses — and returns the mounted `Context`. Each fixture
 * delegates its body to a driver function the owning spec registers on
 * `globalThis`; that driver runs inside a real plugin fiber with the real
 * proxied `ctx` and records observations the spec asserts on. Hand-built
 * `ctx.plugin(...)` suites do not substitute for this Loader mount
 * (packages/AGENTS.md).
 *
 * This is a plain shared fixture module, never a `*.spec.ts`, so importing it
 * from several specs does not re-register any suite.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'

/** A booted Loader composition and its teardown. */
export interface BootedComposition {
  /** The mounted root context (the app's context). */
  ctx: Context
  /** The temp dir holding the fixtures, for specs that must reference it. */
  dir: string
  /** Dispose the whole fiber tree and remove the temp dir (idempotent). */
  dispose(): Promise<void>
}

/**
 * Mount a real Loader composition from an in-memory set of plugin fixtures and
 * a `cordis.yml` body, then wait for the tree to settle.
 *
 * @param files - plugin filename → source map; every fixture is written verbatim
 * to the temp dir so the config can reference it by relative path.
 * @param yml - the complete `cordis.yml` document body.
 * @returns the mounted root context and teardown.
 */
export async function bootComposition(files: Record<string, string>, yml: string): Promise<BootedComposition> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cordis-context-'))
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(dir, name), source)
    }
    writeFileSync(join(dir, 'cordis.yml'), yml)

    const ctx = new Context()
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
    await ctx.loader.await()

    return {
      ctx,
      dir,
      dispose: async () => {
        await ctx.fiber.dispose()
        rmSync(dir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}
