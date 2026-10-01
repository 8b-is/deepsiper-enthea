import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, watch as fsWatch, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Hmr from '@deepseek-ai/cordis-plugin-hmr'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { FSWatcher, type ChokidarOptions } from 'chokidar'
import { watchConfig } from '../src/watch-config.ts'

const configWatch = vi.hoisted(() => ({ create: undefined as ((options?: ChokidarOptions) => FSWatcher) | undefined }))
vi.mock('chokidar', async (importOriginal) => {
  const native = await importOriginal<typeof import('chokidar')>()
  return {
    ...native,
    watch: (paths: string | string[], options?: ChokidarOptions) =>
      configWatch.create === undefined ? native.watch(paths, options) : configWatch.create(options),
  }
})

async function bootHmr(dir: string, root: string[] = [], usePolling?: boolean): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, {
    root,
    ignored: [],
    debounce: 0,
    ...usePolling === undefined ? {} : { usePolling },
  })
  return ctx
}

/**
 * Block until this process's native directory watches deliver events. Chokidar
 * reports `ready` once `fs.watch()` returns, but libuv on darwin builds the
 * per-process FSEvents stream later on its CoreFoundation thread, and a write
 * that lands before then is never reported. Closing any directory handle runs
 * the stream-teardown wait, so a watcher registered before this call observes
 * the next write. Linux inotify and Windows ReadDirectoryChangesW are armed
 * inside `fs.watch()`, so there this is an immediate open and close.
 */
function ensureNativeWatchLive(dir: string): void {
  fsWatch(dir).close()
}

async function eventually(test: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!test()) {
    if (Date.now() >= deadline) throw new Error(message)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('watchConfig exact paths', () => {
  it('observes module changes when its watch base is a filesystem alias', { timeout: 30_000 }, async () => {
    const target = mkdtempSync(join(tmpdir(), 'dsh-hmr-module-canonical-'))
    const alias = `${target}-alias`
    const aliasFilename = join(alias, 'module.ts')
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(aliasFilename, 'export const generation = 0\n')
    // This acceptance owns alias-to-cache identity. Other cases below exercise
    // native events; polling keeps Windows fs.watch queue pressure out of it.
    const ctx = await bootHmr(alias, ['.'], true)
    const filename = join(await realpath(target), 'module.ts')
    const expected = pathToFileURL(filename).href
    const cacheHas = vi.spyOn(ctx.loader.internal!.loadCache, 'has').mockReturnValue(false)
    const observed: string[] = []
    ctx.on('hmr/change', (url) => { observed.push(url) })
    try {
      const deadline = Date.now() + 20_000
      for (let generation = 1; !observed.includes(expected); generation += 1) {
        if (Date.now() >= deadline) {
          throw new Error(`HMR did not observe ${expected} through the alias; observed ${JSON.stringify(observed)}`)
        }
        // The watch base, not the writer spelling, is the alias under test.
        // Grow the file on every write: polling must not depend on timestamp
        // precision when several generations land inside one filesystem tick.
        writeFileSync(filename, `export const generation = ${generation}\n${' '.repeat(generation)}\n`)
        // Leave Chokidar's atomic-write window idle so one coalesced change can publish.
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      expect(cacheHas).toHaveBeenCalledWith(expected)
    } finally {
      await ctx.fiber.dispose()
      unlinkSync(alias)
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('collapses filesystem aliases before registering an exact watch', async () => {
    const target = mkdtempSync(join(tmpdir(), 'dsh-hmr-canonical-'))
    const alias = `${target}-alias`
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    try {
      await watchConfig(ctx, join(alias, 'plugins.yml'), {}, () => {})
      await expect(watchConfig(ctx, join(await realpath(target), 'plugins.yml'), {}, () => {}))
        .rejects.toThrow('config path already registered')
    } finally {
      unlinkSync(alias)
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('observes add, change, and unlink outside its module roots', { timeout: 20_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const filename = join(dir, 'plugins.yml')
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const observed: string[] = []
    try {
      await watchConfig(ctx, filename, {}, () => {
        try {
          observed.push(readFileSync(filename, 'utf8'))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          observed.push('missing')
        }
      })
      ensureNativeWatchLive(dir)

      writeFileSync(filename, 'one', { flag: 'wx' })
      await eventually(() => observed.includes('one'), 'watchConfig did not observe config creation')
      writeFileSync(filename, 'two')
      await eventually(() => observed.includes('two'), 'watchConfig did not observe config change')
      unlinkSync(filename)
      await eventually(() => observed.includes('missing'), 'watchConfig did not observe config removal')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('observes creation when the config parent did not exist at registration', { timeout: 20_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const dir = join(root, 'later')
    const filename = join(dir, 'plugins.yml')
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const observed: string[] = []
    try {
      await watchConfig(ctx, filename, {}, () => {
        observed.push(readFileSync(filename, 'utf8'))
      })
      ensureNativeWatchLive(root)
      mkdirSync(dir)
      writeFileSync(filename, 'created')
      await eventually(() => observed.includes('created'), 'watchConfig did not observe config creation under a new parent')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a patch path whose parent is a regular file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-patch-parent-'))
    const parent = join(dir, 'file')
    writeFileSync(parent, '')
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    try {
      await expect(watchConfig(ctx, join(parent, 'plugins.yml'), {}, () => {}))
        .rejects.toThrow('config watch parent is not a directory')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('serializes refreshes and waits for them during disposal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const filename = join(dir, 'plugins.yml')
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    const watcher = new FSWatcher()
    const previousFactory = configWatch.create
    onTestFinished(() => { configWatch.create = previousFactory })
    configWatch.create = () => { queueMicrotask(() => { watcher.emit('ready') }); return watcher }
    const started = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    onTestFinished(() => { release.resolve(undefined) })
    let calls = 0
    let active = 0
    let maxActive = 0
    const dispose = await watchConfig(ctx, filename, {}, async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      if (++calls === 1) {
        started.resolve(undefined)
        await release.promise
      }
      active -= 1
    })
    watcher.emit('change', join(dir, 'unrelated.yml'))
    expect(calls).toBe(0)
    watcher.emit('add', filename)
    await started.promise
    watcher.emit('change', filename)
    watcher.emit('unlink', filename)
    let disposed = false
    const disposal = dispose().then(() => { disposed = true })
    await Promise.resolve()
    expect(disposed).toBe(false)
    release.resolve(undefined)
    await disposal
    expect(maxActive).toBe(1)
    expect(calls).toBe(2)
  })

  it('logs refresh failures without escaping the watcher', { timeout: 20_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const filename = join(dir, 'plugins.yml')
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    onTestFinished(() => { warn.mockRestore() })
    const reloadWarnings = () => warn.mock.calls.filter(call => String(call[0]).includes('config reload at'))
    try {
      await watchConfig(ctx, filename, {}, () => { throw 42 })
      ensureNativeWatchLive(dir)
      writeFileSync(filename, 'invalid')
      await eventually(() => reloadWarnings().length === 1, 'refresh failure was not logged')
      const logged = warn.mock.calls.find(call => call[0] instanceof Error)?.[0]
      expect(logged).toBeInstanceOf(Error)
      expect((logged as Error).message).toBe('42')

      // Let Chokidar's atomic-write window close before requiring a distinct
      // second notification from the same path.
      await new Promise(resolve => setTimeout(resolve, 250))
      writeFileSync(filename, 'invalid again')
      await eventually(() => reloadWarnings().length === 2, 'the watcher stopped observing after a refresh failure')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
