/**
 * Real-composition guard for the osaurus wiring chain: LlmRuntime,
 * settings-file, and llm-osarous boot from a test-only cordis.yml through the
 * actual Loader + Include path, a request streams through the osaurus mock
 * (health check plus chat-completions), and an external edit of settings.yaml
 * hot-publishes so the very next request carries the fresh base URL and model
 * catalog. The same adapter composition without a settings entry keeps
 * entry-config behavior — the documented optional-inject fallback.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import * as LlmOsarous from '@deepseek-ai/dsh-llm-osarous'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

const NS = settingsNamespace('llm-osarous')

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
})

async function loadComposition(options: { withSettings: boolean; baseURL: string }): Promise<{ ctx: Context; settingsPath: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-osarous-composition-'))
  const settingsPath = join(root, 'settings.yaml')
  if (options.withSettings) await writeFile(settingsPath, '# personal settings\n')

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: 'test-llm-service'",
    ...options.withSettings
      ? [
        '- id: settings',
        "  name: '@deepseek-ai/dsh-settings-file'",
        '  config:',
        `    path: ${JSON.stringify(settingsPath)}`,
        '    debounceMs: 10',
      ]
      : [],
    '- id: llm-osarous',
    "  name: '@deepseek-ai/dsh-llm-osarous'",
    '  config:',
    `    baseURL: ${JSON.stringify(options.baseURL)}`,
    '    autoStart: false',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-llm-service', LlmRuntime],
    ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
    ['@deepseek-ai/dsh-llm-osarous', LlmOsarous],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, settingsPath }
}

describe('llm-osarous real composition', () => {
  it('boots from cordis.yml, streams through the mock sidecar, and routes the next request after an external settings edit', async () => {
    const serverA = await mockServer([{ kind: 'sse', events: textEvents }])
    const serverB = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx, settingsPath } = await loadComposition({ withSettings: true, baseURL: serverA.url })

    expect(ctx.get('settings')!.describe().map(entry => entry.ns)).toEqual([NS])
    expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['osarous'])
    expect((await ctx.llm.listModels('osarous')).map(model => model.id)).toEqual(['local-model'])

    const first = await assemble(ctx, { model: 'local-model', messages: [] })
    expect(first.message.content).toEqual([{ type: 'text', text: 'hello world' }])
    expect(first.usage).toEqual({ inputTokens: 3, outputTokens: 2 })
    expect(first.finish).toEqual({ kind: 'stop' })
    expect(serverA.requests).toHaveLength(1)
    expect((serverA.requests[0] as { model?: unknown }).model).toBe('local-model')
    expect((serverA.requests[0] as { stream?: unknown }).stream).toBe(true)

    // External edit, exactly as a user or the web UI would leave it on disk:
    // a new endpoint and a narrowed catalog must reach the next request.
    await writeFile(settingsPath, `llm-osarous:\n  baseURL: ${serverB.url}\n  models:\n    - id: local-model\n      contextWindow: 131072\n`)
    await vi.waitFor(() => {
      expect((ctx.get('settings')!.get(NS) as { baseURL?: string }).baseURL).toBe(serverB.url)
    }, { timeout: 5000 })

    const second = await assemble(ctx, { model: 'local-model', messages: [] })
    expect(second.message.content).toEqual([{ type: 'text', text: 'hello world' }])
    expect(serverA.requests).toHaveLength(1)
    expect(serverB.requests).toHaveLength(1)
  })

  it('boots the same adapter on entry config alone', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ withSettings: false, baseURL: server.url })

    expect(ctx.get('settings')).toBeUndefined()
    const result = await assemble(ctx, { model: 'local-model', messages: [] })
    expect(result.message.content).toEqual([{ type: 'text', text: 'hello world' }])
    expect(result.finish).toEqual({ kind: 'stop' })
  })

  it('reports a SERVER failure chunk when the sidecar answers an HTTP error', async () => {
    const server = await mockServer([{ kind: 'http-error', status: 500, body: '{"error":{"message":"model not loaded"}}' }])
    const { ctx } = await loadComposition({ withSettings: false, baseURL: server.url })

    const result = await assemble(ctx, { model: 'local-model', messages: [] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind !== 'error') throw new Error('expected an error finish')
    expect(result.finish.failure.code).toBe('SERVER')
  })
})
