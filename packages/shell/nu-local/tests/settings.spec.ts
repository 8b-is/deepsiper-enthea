/** The `nu` settings section layered over the executor's composition entry. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { SHELL_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-shell'
import LocalNuExecutor from '@deepseek-ai/dsh-nu-local'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function boot(config: ConstructorParameters<typeof LocalNuExecutor>[1] = {}): Promise<{
  ctx: Context
  settingsFiber: Fiber
  executorFiber: Fiber
  nu: LocalNuExecutor
}> {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const executorFiber = ctx.plugin(LocalNuExecutor, { timeoutMs: 60_000, nuBin: '/first/nu', ...config })
  await executorFiber.await()
  return { ctx, settingsFiber, executorFiber, nu: ctx.shell as LocalNuExecutor }
}

describe('nu settings section', () => {
  it('resolves the user layer over the composition entry and clears the cached binary on change', async () => {
    const bench = await boot()
    expect(bench.nu.config.timeoutMs).toBe(60_000)
    expect(await bench.nu.ensureNu()).toBe('/first/nu')

    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000, nuBin: '/second/nu' })

    expect(bench.nu.config.timeoutMs).toBe(5_000)
    expect(await bench.nu.ensureNu()).toBe('/second/nu')
    await bench.ctx.fiber.dispose()
  })

  it('refuses a stored value the constructor would have rejected', async () => {
    const bench = await boot()

    await expect(bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 0 }))
      .rejects.toThrow(/positive finite/)
  })
})
