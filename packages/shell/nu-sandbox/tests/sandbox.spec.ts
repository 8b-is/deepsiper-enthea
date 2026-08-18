/**
 * Consumer-side `SandboxNuExecutor` tests. A fake Cordis sandbox service makes wrapping,
 * policy hand-off, fail-closed propagation, classification, and fact stamping deterministic;
 * real-provider integration follows the bash lane's e2e pattern. The nushell binary is a
 * stub (see `nu-local`'s spec) so every assertion is hermetic.
 */

import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ShellRunResult, CollectedOutput } from '@deepseek-ai/dsh-shell'
import { SANDBOX_UNAVAILABLE, SandboxProvider, SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, SandboxMode, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SandboxNuExecutor } from '@deepseek-ai/dsh-nu-sandbox'
import { classifyDenial, classifyRunnerFailure, isRunnerSpawnFailure } from '../src/helpers.ts'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import type { Config } from '@deepseek-ai/dsh-nu-sandbox'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-nu-sandbox-spec-'))

/** One recorded provider call: the argv handed over and the policy it rode with. */
interface ConfineCall {
  argv: string[]
  policy: SandboxPolicy
}

/** The Linux file-denial dialects the fake wraps carry. */
const UNIX_SIGNATURES = ['read-only file system', 'permission denied'] as const

/** The runner-failure rule the fake wraps carry (a fake-runner: error line marks the sandbox itself failing). */
const RUNNER_FAILURE = [{ fatalSignatures: ['fake-runner: '] }] as const

/** Provider argv[0] forms that all share the caller-owned cwd spawn precondition. */
const RUNNER_FORMS = [
  ['absolute', process.execPath],
  ['bare', 'node'],
  ['relative', './sandbox-runner'],
] as const

/** A passthrough wrap: the caller's argv unchanged, asserted full — commands run unconfined, deterministically. */
const passthrough = (argv: readonly string[]): ConfinedArgv =>
  ({ argv: [...argv], enforcement: 'full', denialSignatures: UNIX_SIGNATURES, runnerFailureRules: RUNNER_FAILURE })

/** A stub nushell binary that echoes a fixed line. */
function stubNu(): string {
  const stubPath = join(spillDir, `nu-stub-${Math.random().toString(36).slice(2)}`)
  writeFileSync(stubPath, '#!/bin/bash\nif [[ "$*" == *deny-me* ]]; then echo "permission denied" >&2; exit 1; fi\necho "stub-out"\n')
  chmodSync(stubPath, 0o755)
  return stubPath
}

/**
 * Boot a context with a recording fake `ctx.sandbox` (behavior injectable
 * per test) and the executor under test on top of it.
 */
async function setup(
  config: { mode?: SandboxMode; workspaceRoot?: string } & Config = {},
  behavior: (argv: readonly string[], policy: SandboxPolicy) => ConfinedArgv = passthrough,
) {
  const { mode, workspaceRoot, ...execConfig } = config
  const calls: ConfineCall[] = []
  class FakeSandboxProvider extends SandboxProvider {
    confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
      calls.push({ argv: [...argv], policy })
      return behavior(argv, policy)
    }
  }
  const ctx = new Context()
  await ctx.plugin(FakeSandboxProvider)
  await ctx.plugin(SandboxPolicyService, {
    ...mode !== undefined ? { mode } : {},
    ...workspaceRoot !== undefined ? { workspaceRoot } : {},
  })
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  const nuBin = stubNu()
  await ctx.plugin(SandboxNuExecutor, { graceMs: 200, nuBin, ...execConfig })
  const nu = ctx.shell as SandboxNuExecutor
  return { ctx, nu, calls, nuBin }
}

function output(text: string): CollectedOutput {
  return { text, truncated: false }
}

function runResult(exitCode: number | null, stderr: string): ShellRunResult {
  return { exitCode, signal: null, timedOut: false, aborted: false, timeoutMs: 1000, stdout: output(''), stderr: output(stderr) }
}

describe('the provider hand-off', () => {
  it('hands the provider the exact nushell argv and the per-call policy, and runs the returned argv', async () => {
    const { nu, calls, nuBin } = await setup()
    const result = await nu.run(nu.resolve({ command: 'ls | length' }))
    expect(result.stdout.text.trim()).toBe('stub-out')
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
    expect(calls).toEqual([{
      argv: [nuBin, '--no-config-file', '-c', 'ls | length'],
      policy: { mode: 'read-only', workspaceRoot: resolve(process.cwd()) },
    }])
  })

  it("hands the provider's returned argv directly to ctx.subprocess.spawn", async () => {
    const { ctx, nu, nuBin } = await setup({}, () => ({ argv: returnedArgv, enforcement: 'full', denialSignatures: UNIX_SIGNATURES, runnerFailureRules: RUNNER_FAILURE }))
    const returnedArgv = ['env', 'DSH_WRAP=1', nuBin, '--no-config-file', '-c', 'print $env.DSH_WRAP']
    const spawn = vi.spyOn(ctx.subprocess, 'spawn')
    const result = await nu.run(nu.resolve({ command: 'print $env.DSH_WRAP' }))
    expect(result.stdout.text.trim()).toBe('stub-out')
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0]?.[0].argv).toEqual(returnedArgv)
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  })

  it('workspace-write rides the policy, workspaceRoot falling back to process.cwd() when not configured', async () => {
    const { nu, calls } = await setup({ mode: 'workspace-write' })
    const result = await nu.run(nu.resolve({ command: 'true' }))
    expect(result.sandbox).toEqual({ mode: 'workspace-write', denied: false, enforcement: 'full' })
    expect(calls[0]?.policy).toEqual({ mode: 'workspace-write', workspaceRoot: resolve(process.cwd()) })
  })

  it('an explicit workspaceRoot on the policy wins', async () => {
    const { calls, nu } = await setup({ mode: 'workspace-write', workspaceRoot: '/ws', cwd: tmpdir() })
    await nu.run(nu.resolve({ command: 'true' }))
    expect(calls[0]?.policy.workspaceRoot).toBe(resolve('/ws'))
  })

  it('the provider is consulted per wrap (no caching in the consumer): run and start each hand off', async () => {
    const { nu, calls } = await setup()
    await nu.run(nu.resolve({ command: 'true' }))
    await nu.ensureNu()
    const task = nu.start(nu.resolve({ command: 'true' }))
    await task.done
    expect(calls).toHaveLength(2)
  })
})

describe('fail closed', () => {
  it("propagates the provider's structured SANDBOX_UNAVAILABLE on run() and start()", async () => {
    const { nu } = await setup({}, () => { throw new SandboxUnavailableError('read-only') })
    const spec = nu.resolve({ command: 'echo hi' })
    await expect(nu.run(spec)).rejects.toMatchObject({ name: 'SandboxUnavailableError', code: SANDBOX_UNAVAILABLE })
    await nu.ensureNu()
    expect(() => nu.start(spec)).toThrow(SandboxUnavailableError)
  })

  it('preserves an already-aborted foreground call as cancellation', async () => {
    const { nu } = await setup()
    const controller = new AbortController()
    const reason = new Error('caller cancelled before spawn')
    controller.abort(reason)
    await expect(nu.run(nu.resolve({ command: 'true', signal: controller.signal }))).rejects.toBe(reason)
  })

  it.each(RUNNER_FORMS)(
    'keeps an invalid workdir ordinary with the %s provider-runner form',
    async (_form, runner) => {
      const { nu } = await setup({}, argv => ({
        argv: [runner, ...argv],
        enforcement: 'full',
        denialSignatures: UNIX_SIGNATURES,
        runnerFailureRules: RUNNER_FAILURE,
      }))
      const parent = mkdtempSync(join(tmpdir(), 'dsh-nu-sandbox-missing-cwd-'))
      try {
        const failure = await nu.run(nu.resolve({ command: 'true', workdir: join(parent, 'missing') }))
          .catch((error: unknown) => error)
        expect(failure).toMatchObject({ code: 'ENOENT' })
        expect(failure).not.toBeInstanceOf(SandboxUnavailableError)
      } finally {
        const { rmSync } = await import('node:fs')
        rmSync(parent, { recursive: true, force: true })
      }
    },
  )

  it('keeps an invalid workdir ordinary when danger-full-access bypasses the provider', async () => {
    const { nu } = await setup({ mode: 'danger-full-access' })
    const parent = mkdtempSync(join(tmpdir(), 'dsh-nu-sandbox-missing-cwd-'))
    try {
      const failure = await nu.run(nu.resolve({ command: 'true', workdir: join(parent, 'missing') }))
        .catch((error: unknown) => error)
      expect(failure).toMatchObject({ code: 'ENOENT' })
      expect(failure).not.toBeInstanceOf(SandboxUnavailableError)
    } finally {
      const { rmSync } = await import('node:fs')
      rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('classification and fact stamping', () => {
  it('marks a run denied when the provider argv produced a denial signature', async () => {
    const { nu } = await setup({}, (argv): ConfinedArgv => {
      if (argv.includes('deny-me')) {
        return { argv: [...argv], enforcement: 'partial', denialSignatures: UNIX_SIGNATURES, runnerFailureRules: RUNNER_FAILURE }
      }
      return passthrough(argv)
    })
    const denied = await nu.run(nu.resolve({ command: 'deny-me' }))
    expect(denied.sandbox).toEqual({ mode: 'read-only', denied: true, enforcement: 'partial' })
    const allowed = await nu.run(nu.resolve({ command: 'true' }))
    expect(allowed.sandbox?.denied).toBe(false)
  })

  it('throws SANDBOX_UNAVAILABLE for a runner failure outranking denial', async () => {
    const { nu } = await setup({}, () => ({
      argv: [process.execPath, '-e', 'console.error("fake-runner: boom"); process.exit(127)', 'nu', '--no-config-file', '-c', 'true'],
      enforcement: 'full',
      denialSignatures: UNIX_SIGNATURES,
      runnerFailureRules: RUNNER_FAILURE,
    }))
    await expect(nu.run(nu.resolve({ command: 'true' }))).rejects.toMatchObject({
      name: 'SandboxUnavailableError',
      code: SANDBOX_UNAVAILABLE,
    })
  })

  it('advertises the default sandbox mode', async () => {
    const { nu } = await setup()
    expect(nu.sandboxMode).toBe('read-only')
  })

  it('throws SANDBOX_UNAVAILABLE when a synchronous runner spawn failure hits a foreground run', async () => {
    const runner = join(spillDir, 'unexecutable-runner')
    const { ctx, nu } = await setup({}, argv => ({
      argv: [runner, ...argv],
      enforcement: 'full',
      denialSignatures: UNIX_SIGNATURES,
      runnerFailureRules: RUNNER_FAILURE,
    }))
    vi.spyOn(ctx.subprocess, 'spawn').mockImplementation(() => {
      throw Object.assign(new Error('spawn EACCES'), { code: 'EACCES', syscall: 'spawn', path: runner })
    })
    await expect(nu.run(nu.resolve({ command: 'true' })))
      .rejects.toMatchObject({ name: 'SandboxUnavailableError', code: SANDBOX_UNAVAILABLE })
  })

  it('rejects a background start before the nushell binary is resolved', async () => {
    const fresh = new Context()
    await fresh.plugin(LocalSubprocessRuntime)
    await fresh.plugin(SandboxPolicyService, {})
    class NoSandbox extends SandboxProvider {
      confine(argv: readonly string[]): ConfinedArgv {
        return { argv: [...argv], enforcement: 'full', denialSignatures: UNIX_SIGNATURES, runnerFailureRules: RUNNER_FAILURE }
      }
    }
    await fresh.plugin(NoSandbox)
    const service = new SandboxNuExecutor(fresh, { timeoutMs: 120_000, maxTimeoutMs: 600_000, maxOutputBytes: 64_000, maxSpillBytes: 64 * 1024 * 1024, graceMs: 3_000, nuBin: '/unresolved' })
    expect(() => service.start(service.resolve({ command: 'watch ls' }))).toThrow(/not resolved yet/)
  })

  it('stamps background-process facts: denied, runnerFailed, and clean completion', async () => {
    const { nu } = await setup({}, (argv): ConfinedArgv => {
      if (argv.includes('deny-me')) {
        return { argv: [...argv], enforcement: 'partial', denialSignatures: UNIX_SIGNATURES, runnerFailureRules: RUNNER_FAILURE }
      }
      return passthrough(argv)
    })
    await nu.ensureNu()
    const deniedTask = nu.start(nu.resolve({ command: 'deny-me' }))
    await deniedTask.done
    expect(deniedTask.sandbox).toEqual({ mode: 'read-only', denied: true, enforcement: 'partial' })

    const cleanTask = nu.start(nu.resolve({ command: 'true' }))
    await cleanTask.done
    expect(cleanTask.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  })

  it('danger-full-access bypasses the provider and reports no denial', async () => {
    const { nu, calls } = await setup({ mode: 'danger-full-access' })
    const result = await nu.run(nu.resolve({ command: 'true' }))
    expect(result.sandbox).toEqual({ mode: 'danger-full-access', denied: false })
    expect(calls).toHaveLength(0)
  })

  it('danger-full-access background starts bypass the provider', async () => {
    const { nu, calls } = await setup({ mode: 'danger-full-access' })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: 'true' }))
    await proc.done
    expect(proc.sandbox).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  it('marks a background process runnerFailed when the confined command exits with a fatal runner line', async () => {
    const { nu } = await setup({}, (argv) => {
      if (argv.includes('__RUNNER_FATAL__')) {
        return {
          argv: [process.execPath, '-e', 'console.error("landlock-run: ruleset creation failed"); process.exit(125)', ...argv],
          enforcement: 'full',
          denialSignatures: UNIX_SIGNATURES,
          runnerFailureRules: [{ allowedExitCodes: [125], fatalSignatures: ['landlock-run: '] }],
        }
      }
      return passthrough(argv)
    })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: '__RUNNER_FATAL__' }))
    await proc.done
    expect(proc.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full', runnerFailed: true })
  })
})

describe('classifyDenial', () => {
  it('never classifies a clean exit or a signal kill as a denial', () => {
    expect(classifyDenial(runResult(0, 'Permission denied'), UNIX_SIGNATURES)).toBe(false)
    expect(classifyDenial(runResult(null, 'Permission denied'), UNIX_SIGNATURES)).toBe(false)
  })

  it('classifies failed runs by the wrap\'s own dialect, conservatively', () => {
    expect(classifyDenial(runResult(1, 'touch: cannot touch /x: Read-only file system'), UNIX_SIGNATURES)).toBe(true)
    expect(classifyDenial(runResult(1, 'sh: /x: Permission denied'), UNIX_SIGNATURES)).toBe(true)
    expect(classifyDenial(runResult(1, 'mount: Operation not permitted'), UNIX_SIGNATURES)).toBe(false)
    expect(classifyDenial(runResult(1, 'No such file or directory'), UNIX_SIGNATURES)).toBe(false)
  })

  it('matches exactly the active backend\'s dialect', () => {
    expect(classifyDenial(runResult(1, 'bash: /etc/x: Operation not permitted'), ['operation not permitted'])).toBe(true)
    expect(classifyDenial(runResult(1, 'sh: /x: Permission denied'), ['read-only file system'])).toBe(false)
  })
})

describe('isRunnerSpawnFailure', () => {
  it.each(['EACCES', 'ENOENT'])(
    'attributes executable-class spawn code %s to argv[0] once cwd ambiguity is eliminated',
    (code) => {
      const runner = join(spillDir, 'runner')
      const error = Object.assign(new Error('spawn failed'), { code, syscall: `spawn ${runner}`, path: runner })
      expect(isRunnerSpawnFailure(error, runner, process.cwd())).toBe(true)
    },
  )

  it.each(['ENOEXEC', 'ENOTDIR', 'EPERM'])('keeps unproven executable code %s ordinary', (code) => {
    const runner = join(spillDir, 'runner')
    const error = Object.assign(new Error('spawn failed'), { code, syscall: `spawn ${runner}`, path: runner })
    expect(isRunnerSpawnFailure(error, runner, process.cwd())).toBe(false)
  })

  it('requires a usable caller cwd before classifying absolute, bare, or relative runners', () => {
    const missingWorkdir = join(spillDir, 'missing-workdir')
    for (const [, runner] of RUNNER_FORMS) {
      const error = Object.assign(new Error('spawn failed'), { code: 'ENOENT', syscall: `spawn ${runner}`, path: runner })
      expect(isRunnerSpawnFailure(error, runner, missingWorkdir)).toBe(false)
    }
    const fileWorkdir = join(spillDir, 'not-a-workdir')
    writeFileSync(fileWorkdir, '')
    const error = Object.assign(new Error('spawn failed'), { code: 'ENOTDIR', syscall: 'spawn node', path: 'node' })
    expect(isRunnerSpawnFailure(error, 'node', fileWorkdir)).toBe(false)
  })

  it('rejects resource, non-spawn, mismatched-program, and unstructured failures', () => {
    const missingRunner = join(spillDir, 'definitely-missing-runner')
    const spawnError = (code: unknown, syscall: unknown = `spawn ${missingRunner}`, path: unknown = missingRunner) =>
      Object.assign(new Error('spawn failed'), { code, syscall, path })
    expect(isRunnerSpawnFailure(spawnError('EMFILE'), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError('ENOMEM'), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError(2), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError('ENOENT', 'open'), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError('ENOENT', 1), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError('ENOENT', 'spawn', process.execPath), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError('ENOENT', 'spawn', ''), missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(undefined, missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(null, missingRunner, process.cwd())).toBe(false)
    expect(isRunnerSpawnFailure(spawnError('ENOENT'), undefined, process.cwd())).toBe(false)
  })

  it('accepts only syscall and error-path facts that identify the exact runner program', () => {
    const runner = join(spillDir, 'runner with spaces')
    const spawnError = (syscall: string, path?: string) =>
      Object.assign(new Error('spawn failed'), { code: 'ENOENT', syscall, path })
    expect(isRunnerSpawnFailure(spawnError('spawn', runner), runner, process.cwd())).toBe(true)
    expect(isRunnerSpawnFailure(spawnError(`spawn ${runner}`, runner), runner, process.cwd())).toBe(true)
    expect(isRunnerSpawnFailure(spawnError(`spawn ${runner}`), runner, process.cwd())).toBe(true)
    expect(isRunnerSpawnFailure(spawnError('spawn other-runner', runner), runner, process.cwd())).toBe(false)
  })
})

describe('classifyRunnerFailure', () => {
  it('ignores empty and whitespace-only fatal signatures instead of treating exit status or notice text as evidence', () => {
    const notice = 'landlock-run: partial enforcement (older Landlock ABI)'
    const emptyRule = [{ allowedExitCodes: [125], fatalSignatures: ['', ' ', '\t'] }]
    expect(classifyRunnerFailure(125, '', emptyRule)).toBeUndefined()
    expect(classifyRunnerFailure(125, notice, emptyRule)).toBeUndefined()
  })

  it('keeps valid fatal signatures active beside an ignored empty entry', () => {
    const notice = 'landlock-run: partial enforcement (older Landlock ABI)'
    const fatal = 'landlock-run: ruleset creation failed'
    const rules = [{
      allowedExitCodes: [125],
      fatalSignatures: ['', ' ', 'landlock-run: '],
      informationalLines: [notice],
    }]
    expect(classifyRunnerFailure(125, `${notice}\nchild diagnostic\n${fatal}`, rules)).toEqual({ detail: fatal })
  })

  it('requires the runner exit plus a non-notice fatal line and returns that original line', () => {
    const notice = 'landlock-run: partial enforcement (older Landlock ABI)'
    const rules = [{ allowedExitCodes: [125], fatalSignatures: ['landlock-run: '], informationalLines: [notice] }]
    expect(classifyRunnerFailure(1, notice, rules)).toBeUndefined()
    expect(classifyRunnerFailure(125, notice, rules)).toBeUndefined()
    expect(classifyRunnerFailure(125, `${notice}: extra detail`, rules)).toEqual({ detail: `${notice}: extra detail` })
  })

  it.each([
    'landlock-run: usage error: missing `-- <argv>...` command',
    'landlock-run: landlock is not enforced by this kernel (ABI unsupported or disabled)',
    'landlock-run: exec failed: Permission denied',
    'landlock-run: out of memory',
  ])('keeps known and future Landlock fatal diagnostics fail-closed: %s', (fatal) => {
    const rules = [{
      allowedExitCodes: [125],
      fatalSignatures: ['landlock-run: '],
      informationalLines: ['landlock-run: partial enforcement (older Landlock ABI)'],
    }]
    expect(classifyRunnerFailure(125, fatal, rules)).toEqual({ detail: fatal })
  })
})

describe('runner failures at the executor boundary', () => {
  it('throws SANDBOX_UNAVAILABLE for a runner failure in a foreground run', async () => {
    const { nu } = await setup({}, argv => ({
      argv: [process.execPath, '-e', 'console.error("landlock-run: ruleset creation failed"); process.exit(125)', ...argv],
      enforcement: 'full',
      denialSignatures: UNIX_SIGNATURES,
      runnerFailureRules: [{ allowedExitCodes: [125], fatalSignatures: ['landlock-run: '] }],
    }))
    await expect(nu.run(nu.resolve({ command: 'true' }))).rejects.toMatchObject({
      name: 'SandboxUnavailableError',
      code: SANDBOX_UNAVAILABLE,
    })
  })

  it('converts a synchronous runner spawn rejection in start() into SANDBOX_UNAVAILABLE', async () => {
    const runner = join(spillDir, 'unexecutable-runner')
    const { ctx, nu } = await setup({}, argv => ({
      argv: [runner, ...argv],
      enforcement: 'full',
      denialSignatures: UNIX_SIGNATURES,
      runnerFailureRules: RUNNER_FAILURE,
    }))
    vi.spyOn(ctx.subprocess, 'spawn').mockImplementation(() => {
      throw Object.assign(new Error('spawn EACCES'), { code: 'EACCES', syscall: 'spawn', path: runner })
    })
    await nu.ensureNu()
    expect(() => nu.start(nu.resolve({ command: 'true' }))).toThrow(expect.objectContaining({ name: 'SandboxUnavailableError', code: SANDBOX_UNAVAILABLE }))
  })

  it('keeps an ordinary synchronous spawn rejection in start() unchanged', async () => {
    const { ctx, nu } = await setup({}, argv => ({
      argv: [join(spillDir, 'malformed-runner'), ...argv],
      enforcement: 'full',
      denialSignatures: UNIX_SIGNATURES,
      runnerFailureRules: RUNNER_FAILURE,
    }))
    vi.spyOn(ctx.subprocess, 'spawn').mockImplementation(() => {
      throw Object.assign(new Error('spawn ENOEXEC'), { code: 'ENOEXEC', syscall: 'spawn' })
    })
    await nu.ensureNu()
    expect(() => nu.start(nu.resolve({ command: 'true' })))
      .toThrow(expect.objectContaining({ code: 'ENOEXEC' }))
  })

  it('marks a background process runnerFailed when its spawn rejects asynchronously', async () => {
    const runner = join(spillDir, 'missing-runner')
    const { nu } = await setup({}, argv => ({
      argv: [runner, ...argv],
      enforcement: 'full',
      denialSignatures: UNIX_SIGNATURES,
      runnerFailureRules: RUNNER_FAILURE,
    }))
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: 'true' }))
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full', runnerFailed: true })
  })
})
