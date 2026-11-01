/** Launch-scoped credentials and cancellation must not become a successful partial run. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Options, Result } from 'execa'
import { main } from './opencode-local.ts'

const { run, readable } = vi.hoisted(() => ({
  run: vi.fn<(command: string, args: string[], options: Options) => Promise<Partial<Result>>>(),
  readable: vi.fn<typeof import('node:fs/promises').access>(),
}))
vi.mock('execa', () => ({ execa: run }))
vi.mock('node:fs/promises', () => ({ access: readable }))

const accessToken = 'private-launch-access'
const refreshToken = 'private-launch-refresh'

beforeEach(() => {
  run.mockReset()
  readable.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  run.mockResolvedValueOnce({ stdout: JSON.stringify({ data: [{
    integrationID: 'openai', active: true,
    value: { type: 'oauth', access: accessToken, refresh: refreshToken, expires: Date.now() + 120_000 },
  }] }) })
})
afterEach(() => { vi.restoreAllMocks() })

describe('OpenCode launcher', () => {
  it('passes only the access token through the child environment', async () => {
    run.mockResolvedValueOnce({ exitCode: 0 })
    expect(await main(['headless', 'hello'])).toBe(0)
    const [command, args, options] = run.mock.calls[1]!
    expect(command).toBe(process.execPath)
    expect(args).toEqual([
      expect.stringMatching(/apps\/cli\/lib\/bin\.js$/), '--profile', 'headless',
      '--patch', expect.stringMatching(/openai-opencode\/cordis\.patch\.yml$/), 'hello',
    ])
    expect(options.env).toEqual({ DSH_OPENCODE_ACCESS_TOKEN: accessToken })
    expect(JSON.stringify(args)).not.toContain(accessToken)
    expect(JSON.stringify(options)).not.toContain(refreshToken)
    expect(options.timeout).toBeGreaterThan(0)
    expect(options.timeout).toBeLessThanOrEqual(120_000)
  })

  it('reports expiry as failure even when the child traps termination and exits zero', async () => {
    run.mockResolvedValueOnce({ exitCode: 0, timedOut: true })
    expect(await main(['web'])).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('expired'))
  })

  it('cancels the child and releases signal listeners', async () => {
    const before = process.listenerCount('SIGTERM')
    run.mockImplementationOnce((_command, _args, options) => {
      process.listeners('SIGTERM').at(-1)?.('SIGTERM')
      expect(options.cancelSignal?.aborted).toBe(true)
      return Promise.resolve({ exitCode: 0 })
    })
    expect(await main(['web'])).toBe(130)
    expect(process.listenerCount('SIGTERM')).toBe(before)
  })

  it('keeps credential-command errors out of diagnostics', async () => {
    run.mockReset().mockRejectedValue(new Error(`${accessToken} ${refreshToken}`))
    expect(await main(['check'])).toBe(1)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(accessToken)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(refreshToken)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not start a child when built files are absent', async () => {
    readable.mockRejectedValue(new Error('ENOENT'))
    expect(await main(['web'])).toBe(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('built harness is missing'))
  })
})
