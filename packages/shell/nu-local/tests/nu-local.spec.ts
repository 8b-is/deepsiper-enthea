import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalNuExecutor, { resolveNuBin } from '../src/index.ts'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** A fake `node:child_process.spawn` that emits a store path then closes. */
function fakeChild(stdout: string, code = 0): EventEmitter {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  process.nextTick(() => {
    child.stdout.emit('data', stdout)
    child.stderr.emit('data', '')
    child.emit('close', code)
  })
  return child
}

function nixSpawn(stdout: string, code = 0): typeof import('node:child_process').spawn {
  return ((_cmd: string, ..._rest: unknown[]) => fakeChild(stdout, code)) as unknown as typeof import('node:child_process').spawn
}

describe('resolveNuBin', () => {
  it('returns an explicit nuBin without invoking nix', async () => {
    await expect(resolveNuBin({ nuBin: '/custom/bin/nu' }, nixSpawn(''))).resolves.toBe('/custom/bin/nu')
  })

  it('resolves the nushell store path from nix build', async () => {
    const args: string[][] = []
    const spawnImpl = ((cmd: string, ...rest: unknown[]) => {
      args.push([cmd, ...rest.map(String)])
      return fakeChild('/nix/store/abc-nushell-0.113.1\n')
    }) as unknown as typeof import('node:child_process').spawn
    await expect(resolveNuBin({}, spawnImpl)).resolves.toBe('/nix/store/abc-nushell-0.113.1/bin/nu')
    expect(args[0]![0]).toBe('nix')
    expect(args[0]!.join(' ')).toContain('nushell')
  })

  it('rejects when nix build fails', async () => {
    await expect(resolveNuBin({}, nixSpawn('error', 1))).rejects.toThrow(/nix build .* failed/)
  })

  it('rejects when nix build produces no store path', async () => {
    await expect(resolveNuBin({}, nixSpawn('  \n'))).rejects.toThrow(/no store path/)
  })
})

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-nu-exec-spec-'))

/**
 * A stub nushell binary that records its argv and echoes a fixed line;
 * `__BLOCK__` makes it sleep so timeout/abort tests have a real process to cut.
 */
function stubNu(): { path: string; logPath: string } {
  const logPath = join(spillDir, `nu-argv-${Math.random().toString(36).slice(2)}.log`)
  const stubPath = join(spillDir, `nu-stub-${Math.random().toString(36).slice(2)}`)
  writeFileSync(stubPath, `#!/bin/bash\nif [[ "$*" == *__BLOCK__* ]]; then sleep 30; fi\nif [[ "$*" == *__KILL__* ]]; then kill -TERM $$; fi\nif [[ "$*" == *__STDERR__* ]]; then printf 'out'; echo 'err' >&2; exit 0; fi\nif [[ "$*" == *__SPILL__* ]]; then yes x | head -c 200000; exit 0; fi\nprintf '%s' "$0" > "${logPath}"\nfor a in "$@"; do printf '|%s' "$a" >> "${logPath}"; done\nprintf '\\n' >> "${logPath}"\necho 'stub-out'\n`)
  chmodSync(stubPath, 0o755)
  return { path: stubPath, logPath }
}

async function setup(config: ConstructorParameters<typeof LocalNuExecutor>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  await ctx.plugin(LocalNuExecutor, { nuBin: '/unused', ...config })
  return { ctx, nu: ctx.shell as LocalNuExecutor }
}

describe('LocalNuExecutor', () => {
  it('caps per-call timeouts at maxTimeoutMs', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path, timeoutMs: 1_000, maxTimeoutMs: 2_000 })
    const result = await nu.run(nu.resolve({ command: 'true', timeoutMs: 99_999 }))
    expect(result.timeoutMs).toBe(2_000)
  })

  it('rejects invalid numeric config and timeout overrides', async () => {
    await expect(setup({ timeoutMs: Number.NaN })).rejects.toThrow(/timeoutMs/)
    await expect(setup({ maxTimeoutMs: 0 })).rejects.toThrow(/maxTimeoutMs/)
    await expect(setup({ maxOutputBytes: -1 })).rejects.toThrow(/maxOutputBytes/)
    await expect(setup({ maxSpillBytes: 0 })).rejects.toThrow(/maxSpillBytes/)
    await expect(setup({ graceMs: 0 })).rejects.toThrow(/graceMs/)
    await expect(setup({ graceMs: MAX_TIMER_DELAY_MS + 1 })).rejects.toThrow(/graceMs must be no greater than/)

    const { nu } = await setup()
    expect(() => nu.resolve({ command: 'true', timeoutMs: Number.NaN })).toThrow(/request\.timeoutMs/)
    expect(() => nu.resolve({ command: 'true', timeoutMs: -1 })).toThrow(/request\.timeoutMs/)
    expect(() => nu.resolve({ command: 'true', stdoutMaxBytes: Number.NaN })).toThrow(/request\.stdoutMaxBytes/)
    expect(() => nu.resolve({ command: 'true', stdoutMaxBytes: -1 })).toThrow(/request\.stdoutMaxBytes/)
  })

  it('per-call timeout takes precedence under the cap and kills on expiry', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path, timeoutMs: 60_000 })
    const result = await nu.run(nu.resolve({ command: '__BLOCK__', timeoutMs: 100 }))
    expect(result.timedOut).toBe(true)
    expect(result.aborted).toBe(false)
    expect(result.timeoutMs).toBe(100)
  })

  it('propagates abort signals', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    const controller = new AbortController()
    const pending = nu.run(nu.resolve({ command: '__BLOCK__', signal: controller.signal }))
    setTimeout(() => { controller.abort() }, 50)
    const result = await pending
    expect(result.aborted).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('rejects on spawn failure (bad workdir)', async () => {
    const { nu } = await setup()
    await expect(nu.run(nu.resolve({ command: 'true', workdir: '/nonexistent-dsh' }))).rejects.toThrow(/ENOENT/)
  })

  it('resolve() carries stdin/env/dshEnv onto the spec', async () => {
    const { nu } = await setup()
    const spec = nu.resolve({ command: 'cat', stdin: 'data', env: { SEAM_VAR: 'a' }, dshEnv: { DSH_SEAM_VAR: 'b' } })
    expect(spec.stdin).toBe('data')
    expect(spec.env).toEqual({ SEAM_VAR: 'a' })
    expect(spec.dshEnv).toEqual({ DSH_SEAM_VAR: 'b' })
  })

  it('resolve() omits stdin/env/dshEnv when the request supplies none', async () => {
    const { nu } = await setup()
    const spec = nu.resolve({ command: 'true' })
    expect(spec.stdin).toBeUndefined()
    expect(spec.env).toBeUndefined()
    expect(spec.dshEnv).toBeUndefined()
  })

  it('a background spawn failure settles as killed with the error readable on stderr', async () => {
    const { nu } = await setup({ nuBin: join(spillDir, 'missing-nu') })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: 'true' }))
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.readOutput().delta).toContain('spawn failed')
  })

  it('readOutput is consuming: increments are never re-delivered', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: 'true' }))
    await proc.done
    const first = proc.readOutput()
    expect(first.delta).toContain('stub-out')
    expect(proc.readOutput().delta).toBe('')
  })

  it('kill() terminates the process group: true once, false after settlement', async () => {
    const { nu } = await setup()
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: 'true' }))
    expect(proc.kill()).toBe(true)
    await proc.done
    expect(proc.kill()).toBe(false)
  })

  it('settles a signal-terminated background handle as killed, not completed', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: '__KILL__' }))
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.signal).toBe('SIGTERM')
  })

  it('rejects a background start with an already-aborted signal before spawning', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.ensureNu()
    const controller = new AbortController()
    controller.abort()
    expect(() => nu.start(nu.resolve({ command: 'true', signal: controller.signal }))).toThrow(/aborted before spawn/)
  })

  it('readOutput marks a stderr section and inserts a separator when stdout lacks a trailing newline', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: '__STDERR__' }))
    await proc.done
    const read = proc.readOutput()
    expect(read.delta).toContain('[stderr]\nerr')
  })

  it('readOutput flags lossy reads and reports stdout spill paths', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: '__SPILL__' }))
    await proc.done
    const read = proc.readOutput()
    expect(read.lossy).toBe(true)
    expect(read.stdoutSpillPath).toBeDefined()
  })

  it('runs a command through the provisioned nushell with --no-config-file', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    const result = await nu.run(nu.resolve({ command: 'ls | length' }))
    expect(result.stdout.text.trim()).toBe('stub-out')
    const recorded = await nu.ensureNu()
    expect(recorded).toBe(stub.path)
  })

  it('records the nushell argv including the raw command', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.run(nu.resolve({ command: 'open foo | get bar' }))
    const recorded = (await (await import('node:fs/promises')).readFile(stub.logPath, 'utf8')).trim()
    expect(recorded).toBe(`${stub.path}|--no-config-file|-c|open foo | get bar`)
  })

  it('memoizes the nushell resolution', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    const first = await nu.ensureNu()
    const second = await nu.ensureNu()
    expect(first).toBe(stub.path)
    expect(second).toBe(stub.path)
  })

  it('rejects a background start before the binary is resolved', async () => {
    const fresh = new Context()
    await fresh.plugin(LocalSubprocessRuntime)
    const service = new LocalNuExecutor(fresh, { timeoutMs: 120_000, maxTimeoutMs: 600_000, maxOutputBytes: 64_000, maxSpillBytes: 64 * 1024 * 1024, graceMs: 3_000, nuBin: '/unresolved' })
    expect(() => service.start(service.resolve({ command: 'watch ls' }))).toThrow(/not resolved yet/)
  })

  it('starts a background process once the binary is resolved', async () => {
    const stub = stubNu()
    const { nu } = await setup({ nuBin: stub.path })
    await nu.ensureNu()
    const proc = nu.start(nu.resolve({ command: 'sleep 0.05' }))
    expect(proc.status).toBe('running')
    await proc.done
    expect(proc.status).toBe('completed')
  })
})
