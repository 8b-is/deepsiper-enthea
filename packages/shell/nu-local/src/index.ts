/**
 * Local nushell executor for the shell capability seam. Public commands run as
 * `nu --no-config-file -c <command>` in a managed process group spawned through
 * `ctx.subprocess`. The `nu` binary is provisioned from a **Nix store path** —
 * `nix build --no-link <flake>#nushell` resolved once and cached — so every
 * host runs the identical, deterministic nushell from the same nixpkgs pin,
 * with no per-command Nix overhead. `nuBin` overrides the resolution with an
 * explicit path.
 *
 * @module @deepseek-ai/dsh-nu-local
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { spawn } from 'node:child_process'
import { SHELL_SETTINGS_NAMESPACE, ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellProcessRead, ShellRunResult, CollectedOutput } from '@deepseek-ai/dsh-shell'
import type { SubprocessCollect, SubprocessHandle, SubprocessOutputReader, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import { clampTimeout, deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@deepseek-ai/dsh-timeout'

/**
 * Model-friendly environment overrides: disable colors, pagers, and
 * interactive terminal features that would garble tool output.
 */
export const ENV_OVERRIDES = {
  NO_COLOR: '1',
  TERM: 'dumb',
  PAGER: 'cat',
  GIT_PAGER: 'cat',
} as const

/** Default SIGTERM→SIGKILL grace period. */
const DEFAULT_GRACE_MS = 3_000

/** Default per-stream spill cap. */
const DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024

/** Plugin config (all optional — `static Config` supplies the defaults). */
export interface Config {
  /** Default working directory for commands (default: process.cwd()). */
  cwd?: string
  /** Default foreground timeout in milliseconds. */
  timeoutMs?: number
  /** Upper bound for per-call timeout overrides. */
  maxTimeoutMs?: number
  /** Per-stream in-memory output cap; overflow spills to a temp file. */
  maxOutputBytes?: number
  /** Per-stream spill-file cap. */
  maxSpillBytes?: number
  /** Grace period for kill escalation. */
  graceMs?: number
  /** Explicit nushell binary path; bypasses Nix resolution (e.g. `/nix/store/…/bin/nu` or `nu`). */
  nuBin?: string
  /** Flake ref providing nushell (default `nixpkgs`); `<flake>#nushell` is built. */
  nixpkgsFlake?: string
  /** The `nix` binary (default `nix`). */
  nixBinary?: string
}

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Omit<Config, 'cwd' | 'nuBin' | 'nixpkgsFlake' | 'nixBinary'>> & Pick<Config, 'cwd' | 'nuBin' | 'nixpkgsFlake' | 'nixBinary'>

/** Project a settled collect-mode reader into the final CollectedOutput shape. */
function finalOutput(reader: SubprocessOutputReader): CollectedOutput {
  const read = reader.readFrom(0)
  return {
    text: read.text,
    truncated: read.lossy,
    ...read.spillPath !== undefined ? { spillPath: read.spillPath } : {},
  }
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`nu-local: ${name} must be a positive finite number`)
  }
}

/** Reject a resolved section this executor could not run with. */
export function assertServiceableNuConfig(config: Config): void {
  const resolved = config as ResolvedConfig
  assertPositiveFinite('timeoutMs', resolved.timeoutMs)
  assertPositiveFinite('maxTimeoutMs', resolved.maxTimeoutMs)
  assertPositiveFinite('maxOutputBytes', resolved.maxOutputBytes)
  assertPositiveFinite('maxSpillBytes', resolved.maxSpillBytes)
  assertPositiveFinite('graceMs', resolved.graceMs)
  if (resolved.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`nu-local: graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

/**
 * Resolve the nushell binary path: an explicit `nuBin`, else a Nix store path
 * from `nix build --no-link <flake>#nushell`. Deterministic — the same flake
 * pin yields the same content-addressed store path on every host.
 * @param config - resolved config with the nix knobs.
 * @param spawnImpl - test seam replacing `node:child_process.spawn`.
 * @returns the resolved `nu` executable path.
 */
export async function resolveNuBin(
  config: Pick<ResolvedConfig, 'nuBin' | 'nixpkgsFlake' | 'nixBinary'>,
  spawnImpl: typeof spawn = spawn,
): Promise<string> {
  if (config.nuBin !== undefined) return config.nuBin
  const nixBinary = config.nixBinary ?? 'nix'
  const flake = config.nixpkgsFlake ?? 'nixpkgs'
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawnImpl(
      nixBinary,
      ['build', '--no-link', '--print-out-paths', '--extra-experimental-features', 'nix-command flakes', `${flake}#nushell`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer | string) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk: Buffer | string) => { stderr += String(chunk) })
    child.on('error', (error) => { reject(error) })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`nu-local: nix build ${flake}#nushell failed (exit ${String(code)}): ${stderr.trim()}`))
        return
      }
      resolve(stdout.trim())
    })
  })
  const path = output.trim().split('\n').at(-1)
  if (path === undefined || path.length === 0) {
    throw new Error('nu-local: nix build produced no store path')
  }
  return `${path}/bin/nu`
}

/**
 * Local nushell executor over `ctx.subprocess`. Same bounded-output, spill,
 * and process-group escalation mechanics as the bash executor; the command
 * argv targets the Nix-provisioned nushell.
 */
export class LocalNuExecutor extends ShellExecutor {
  static inject = ['subprocess']

  static Config: z<Config> = z.object({
    cwd: z.string(),
    timeoutMs: z.number().default(120_000),
    maxTimeoutMs: z.number().default(600_000),
    maxOutputBytes: z.number().default(64_000),
    maxSpillBytes: z.number().default(DEFAULT_MAX_SPILL_BYTES),
    graceMs: z.number().default(DEFAULT_GRACE_MS),
    nuBin: z.string(),
    nixpkgsFlake: z.string().default('nixpkgs'),
    nixBinary: z.string().default('nix'),
  })

  private source: () => ResolvedConfig
  private resolvedNu: string | undefined
  private nuResolution: Promise<string> | undefined

  /** The resolved nushell path, once known; undefined before the first resolution settles. */
  protected get currentNuPath(): string | undefined {
    return this.resolvedNu
  }

  /** Validated config (schemastery applied the defaults before construction). */
  get config(): ResolvedConfig {
    return this.source()
  }

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const entry = config as ResolvedConfig
    assertServiceableNuConfig(entry)
    this.source = () => entry
    installSettingsSection(ctx, SHELL_SETTINGS_NAMESPACE, LocalNuExecutor.Config, entry, {
      validate: assertServiceableNuConfig,
      setSource: (current) => {
        this.source = current as () => ResolvedConfig
      },
      onChange: () => { this.resolvedNu = undefined; this.nuResolution = undefined },
    })
    void this.ensureNu()
  }

  /**
   * Resolve (once) and cache the nushell binary path. A settings change clears
   * the cache so a new `nuBin`/flake takes effect on the next resolution.
   */
  async ensureNu(): Promise<string> {
    if (this.resolvedNu !== undefined) return this.resolvedNu
    this.nuResolution ??= resolveNuBin(this.config).then((path) => {
      this.resolvedNu = path
      return path
    })
    return this.nuResolution
  }

  resolve(request: ShellExecRequest): ShellExecSpec {
    const timeoutMs = clampTimeout(
      request.timeoutMs,
      this.config.timeoutMs,
      this.config.maxTimeoutMs,
      'nu-local: request.timeoutMs',
    )
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes
    assertPositiveFinite('request.stdoutMaxBytes', stdoutMaxBytes)
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
      timeoutMs,
      stdoutMaxBytes,
      ...request.signal ? { signal: request.signal } : {},
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      ...request.env !== undefined ? { env: request.env } : {},
      ...request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  private spawnSpec(
    spec: ShellExecSpec,
    argv: readonly string[],
    stdoutMaxBytes: number,
    signal: AbortSignal | undefined,
  ): SubprocessSpawnSpec {
    const collect = (maxBytes: number): SubprocessCollect =>
      ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes } })
    return {
      argv,
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== undefined ? { data: spec.stdin } : 'ignore',
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes),
      },
      graceMs: this.config.graceMs,
      signal,
      env: { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv },
    }
  }

  private static collected(handle: SubprocessHandle): { stdout: SubprocessOutputReader; stderr: SubprocessOutputReader } {
    const { stdout, stderr } = handle.collected
    /* v8 ignore start -- collect dispositions expose both readers by the seam contract; defensive. */
    if (stdout === undefined || stderr === undefined) {
      throw new Error('nu-local: subprocess implementation dropped a requested collect stream')
    }
    /* v8 ignore stop */
    return { stdout, stderr }
  }

  async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    const nuPath = await this.ensureNu()
    return this.runArgv(spec, [nuPath, '--no-config-file', '-c', spec.command])
  }

  /**
   * Run an explicit argv with the foreground lifecycle, environment, output,
   * timeout, and cancellation semantics of this executor.
   */
  protected async runArgv(spec: ShellExecSpec, argv: readonly string[]): Promise<ShellRunResult> {
    using d = deadline(spec.signal, spec.timeoutMs, 'NU_TIMEOUT')
    const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, spec.stdoutMaxBytes, d.signal))
    const outcome = await handle.done
    const collected = LocalNuExecutor.collected(handle)
    const timedOut = timeoutOf(d.signal, 'NU_TIMEOUT') !== undefined
    const aborted = d.signal.aborted && !timedOut
    return {
      ...outcome,
      timedOut,
      aborted,
      timeoutMs: spec.timeoutMs,
      stdout: finalOutput(collected.stdout),
      stderr: finalOutput(collected.stderr),
    }
  }

  start(spec: ShellExecSpec): ShellProcess {
    const nuPath = this.resolvedNu
    if (nuPath === undefined) {
      throw new Error('nu-local: the nushell binary is not resolved yet (nix build) — run a foreground command first')
    }
    return this.startArgv(spec, [nuPath, '--no-config-file', '-c', spec.command])
  }

  /**
   * Start an explicit argv with the background lifecycle, environment, output,
   * cancellation, and process-tree ownership semantics of this executor.
   */
  protected startArgv(spec: ShellExecSpec, argv: readonly string[]): ShellProcess {
    const running = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, this.config.maxOutputBytes, spec.signal))
    const collected = LocalNuExecutor.collected(running)

    let spawnFailureNote: string | undefined
    const consumeSpawnFailure = (): string => {
      const note = spawnFailureNote ?? ''
      spawnFailureNote = undefined
      return note
    }

    let stdoutOffset = 0
    let stderrOffset = 0
    const proc: ShellProcess = {
      status: 'running',
      exitCode: null,
      signal: null,
      done: running.done.then((outcome) => {
        if (proc.status === 'running') {
          proc.status = spec.signal?.aborted === true || outcome.signal !== null ? 'killed' : 'completed'
        }
        proc.exitCode = outcome.exitCode
        proc.signal = outcome.signal
        this.onProcessDone(proc, collected.stderr.readFrom(0).text, false)
      }, (error: unknown) => {
        proc.status = 'killed'
        spawnFailureNote = `spawn failed: ${String(error)}`
        this.onProcessDone(proc, spawnFailureNote, true, error)
      }),
      readOutput: (): ShellProcessRead => {
        const out = collected.stdout.readFrom(stdoutOffset)
        const err = collected.stderr.readFrom(stderrOffset)
        stdoutOffset = out.nextOffset
        stderrOffset = err.nextOffset
        const errText = err.text.length > 0 ? err.text : consumeSpawnFailure()
        const separator = out.text.length > 0 && !out.text.endsWith('\n') ? '\n' : ''
        return {
          delta: out.text + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : ''),
          lossy: out.lossy || err.lossy,
          ...out.spillPath !== undefined ? { stdoutSpillPath: out.spillPath } : {},
          ...err.spillPath !== undefined ? { stderrSpillPath: err.spillPath } : {},
        }
      },
      kill: (): boolean => {
        if (proc.status !== 'running') return false
        proc.status = 'killed'
        running.terminate()
        return true
      },
    }
    return proc
  }

  /** Settlement hook for subclasses that attach execution facts to a process. */
  protected onProcessDone(_proc: ShellProcess, _stderr: string, _spawnFailed: boolean, _spawnError?: unknown): void {}
}

export default LocalNuExecutor
