/**
 * Launch the local harness with OpenCode V2's active ChatGPT access token.
 * OpenCode owns login and refresh; this process never copies refresh tokens to disk.
 */
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

/** Non-secret connection metadata plus the access token kept in process memory. */
export interface OpenCodeAccess {
  access: string
  expires: number
}

/** Narrow an untrusted API value without including it in diagnostics. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Select exactly one active OpenAI OAuth credential from OpenCode's V2 response.
 * @param response - parsed `/api/credential` response, which may contain secrets.
 * @param now - current Unix time in integer milliseconds.
 * @returns the usable access token and its expiry; never the refresh token.
 * @throws a secret-free diagnostic for absent, ambiguous, invalid, or expired credentials.
 */
export function selectOpenCodeAccess(response: unknown, now: number): OpenCodeAccess {
  const data = record(response)?.data
  if (!Array.isArray(data)) throw new Error('OpenCode returned an invalid credential response; OpenCode V2 is required.')
  const selected = data.map(record).filter(entry => entry?.integrationID === 'openai' && entry.active === true)
  if (selected.length !== 1) {
    throw new Error('Select one active OpenAI connection in OpenCode before launching Deepsiper.')
  }
  const value = record(selected[0]?.value)
  if (value?.type !== 'oauth') throw new Error('The active OpenAI connection must use ChatGPT sign-in in OpenCode.')
  if (typeof value.access !== 'string' || !/^[\x21-\x7e]+$/.test(value.access)) {
    throw new Error('OpenCode returned an invalid access token; reconnect OpenAI in OpenCode.')
  }
  if (typeof value.expires !== 'number' || !Number.isSafeInteger(value.expires) || value.expires <= now + 60_000) {
    throw new Error('The OpenCode access token is expired or expiring; refresh the OpenAI connection in OpenCode and relaunch.')
  }
  return { access: value.access, expires: value.expires }
}

/** Read through the authenticated CLI; subprocess diagnostics can contain credentials. */
async function readOpenCodeAccess(): Promise<OpenCodeAccess> {
  let output: string
  try {
    const result = await execa('opencode', ['api', 'get', '/api/credential'], {
      timeout: 30_000,
      maxBuffer: 1_048_576,
      stdin: 'ignore',
    })
    output = result.stdout
  } catch {
    throw new Error('Cannot read OpenCode credentials. Check `opencode service status` and your OpenAI sign-in.')
  }
  let response: unknown
  try {
    response = JSON.parse(output)
  } catch {
    throw new Error('OpenCode returned invalid JSON; update OpenCode V2 and retry.')
  }
  return selectOpenCodeAccess(response, Date.now())
}

/**
 * Run the built harness with the opt-in overlay and an in-memory credential.
 * @param args - `check`, `web [flags]`, or `headless <task>`.
 * @returns the harness exit status, or a nonzero status on setup failure.
 */
export async function main(args: readonly string[]): Promise<number> {
  const [mode, ...forwarded] = args
  if (mode === '--help' || mode === '-h' || mode === undefined) {
    console.log('Usage: pnpm local:opencode check | web [flags] | headless <task>')
    return 0
  }
  if (!['check', 'web', 'headless'].includes(mode)) {
    console.error('Expected check, web, or headless. Run with --help for usage.')
    return 1
  }
  try {
    const credential = await readOpenCodeAccess()
    if (mode === 'check') {
      console.log('OpenCode ChatGPT access token is valid. Configured model: openai-codex/gpt-6-astra.')
      console.log(`Access token expires: ${new Date(credential.expires).toISOString()}`)
      return 0
    }
    const bin = fileURLToPath(new URL('../apps/cli/lib/bin.js', import.meta.url))
    try {
      await access(bin, constants.R_OK)
    } catch {
      throw new Error('The built harness is missing. Run `pnpm install` and `pnpm build` first.')
    }
    const overlay = fileURLToPath(new URL('../examples/openai-opencode/cordis.patch.yml', import.meta.url))
    const controller = new AbortController()
    const stop = (): void => { controller.abort() }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      const child = await execa(process.execPath, [bin, '--profile', mode, '--patch', overlay, ...forwarded], {
        env: { DSH_OPENCODE_ACCESS_TOKEN: credential.access },
        stdio: 'inherit',
        cancelSignal: controller.signal,
        reject: false,
        // A launch-scoped token cannot authenticate after its expiry.
        timeout: Math.min(credential.expires - Date.now(), 2_147_483_647),
        forceKillAfterDelay: 5_000,
      })
      if (child.timedOut) {
        console.error('OpenCode access token expired. Refresh the OpenAI connection in OpenCode and relaunch.')
        return 1
      }
      return controller.signal.aborted ? 130 : child.exitCode ?? 1
    } finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Local OpenCode launch failed.')
    return 1
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
