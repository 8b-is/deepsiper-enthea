/** Real Loader composition with file-backed settings and a keyless stdio MCP process. */
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import FileSettings from '@deepseek-ai/dsh-settings-file'
import McpServers, { MCP_SETTINGS_NAMESPACE } from '../src/settings.ts'
import { McpSettingsSchema, validateMcpSettings } from '../src/settings-schema.ts'

const fixture = fileURLToPath(new URL('./fixtures/settings-server.mjs', import.meta.url))
const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function boot(root?: string) {
  root ??= await mkdtemp(join(tmpdir(), 'dsh-mcp-settings-'))
  if (!roots.includes(root)) roots.push(root)
  const path = join(root, 'settings.yaml')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: settings',
    "  name: '@deepseek-ai/dsh-settings-file'",
    '  config:',
    `    path: ${JSON.stringify(path)}`,
    '    debounceMs: 10',
    '- id: system-prompt',
    "  name: '@deepseek-ai/dsh-system-prompt'",
    '- id: tools',
    "  name: '@deepseek-ai/dsh-tools'",
    '- id: mcp-settings',
    "  name: '@deepseek-ai/dsh-mcp-client/settings'",
    '',
  ].join('\n'))
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-settings-file', FileSettings],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-mcp-client/settings', McpServers],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  const manager = ctx.get('mcpServers')!
  const managerFiber = [...ctx.loader.entries()].find(entry => entry.options.id === 'mcp-settings')?.fiber
  if (managerFiber === undefined) throw new Error('MCP settings Loader entry did not activate')
  const settings = ctx.get('settings')!
  const save = async (servers: Record<string, unknown>) => settings.replace(MCP_SETTINGS_NAMESPACE, { servers })
  const server = (name: string, enabled = true, tool = 'inspect') => ({
    enabled, transport: 'stdio', command: process.execPath,
    args: [fixture, join(root, `${name}.pid`), tool], reconnect: { enabled: false },
  })
  return { ctx, manager, managerFiber, settings, root, path, save, server }
}

async function connected(manager: McpServers, name: string) {
  await vi.waitFor(() => { expect(manager.list().find(row => row.name === name)?.state).toBe('connected') }, { timeout: 10_000 })
}

describe('persistent HOST-local MCP settings', () => {
  it('boots empty opt-in, persists disabled entries, redacts secrets and restores them on a fresh Host', async () => {
    const first = await boot()
    expect(first.manager.list()).toEqual([])
    await first.save({ local: { ...first.server('local', false), env: { API_KEY: 'private-value' }, headers: { Authorization: 'Bearer private-value' } } })
    await vi.waitFor(() => { expect(first.manager.list()).toEqual([{ name: 'local', state: 'disabled', toolCount: 0 }]) })
    const descriptor = first.settings.describe({ redactSecrets: true }).find(row => row.ns === MCP_SETTINGS_NAMESPACE)!
    expect(JSON.stringify(descriptor)).not.toContain('private-value')
    expect(descriptor.secrets).toEqual(expect.arrayContaining([
      { path: ['servers', 'local', 'env', 'API_KEY'], set: true },
      { path: ['servers', 'local', 'headers', 'Authorization'], set: true },
    ]))
    await first.settings.mutate(MCP_SETTINGS_NAMESPACE, [{ op: 'set', path: ['servers', 'local', 'cwd'], value: first.root }], descriptor.revision)
    await expect(first.settings.mutate(MCP_SETTINGS_NAMESPACE, [{ op: 'set', path: ['servers', 'local', 'cwd'], value: '' }], descriptor.revision)).rejects.toThrow('changed since it was read')
    expect(await readFile(first.path, 'utf8')).toContain('private-value')
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)
    const second = await boot(first.root)
    await vi.waitFor(() => { expect(second.manager.list()[0]?.state).toBe('disabled') })
    expect(second.settings.describe().find(row => row.ns === MCP_SETTINGS_NAMESPACE)?.value).toMatchObject({ servers: { local: { env: { API_KEY: 'private-value' } } } })
    await expect(access(join(first.root, 'local.pid'))).rejects.toThrow()
  })

  it('enables, replaces only the changed process, disables, deletes and disposes registrations', async () => {
    const { ctx, manager, managerFiber, root, save, server } = await boot()
    const alpha = server('alpha')
    const beta = server('beta')
    await save({ alpha, beta })
    await Promise.all([connected(manager, 'alpha'), connected(manager, 'beta')])
    const alphaPid = await readFile(join(root, 'alpha.pid'), 'utf8')
    const betaPid = await readFile(join(root, 'beta.pid'), 'utf8')
    await save({ alpha: server('alpha', true, 'changed'), beta })
    await vi.waitFor(() => { expect(ctx.get('tools')!.get('mcp__alpha__changed')).toBeDefined() }, { timeout: 10_000 })
    expect(await readFile(join(root, 'alpha.pid'), 'utf8')).not.toBe(alphaPid)
    expect(await readFile(join(root, 'beta.pid'), 'utf8')).toBe(betaPid)
    expect(ctx.get('tools')!.get('mcp__alpha__inspect')).toBeUndefined()
    await save({ alpha: server('alpha', false), beta })
    await vi.waitFor(() => { expect(manager.list().find(row => row.name === 'alpha')?.state).toBe('disabled') })
    await expect(access(join(root, 'alpha.pid'))).rejects.toThrow()
    await save({ beta })
    await vi.waitFor(() => { expect(manager.list().map(row => row.name)).toEqual(['beta']) })
    const tools = ctx.get('tools')!
    await managerFiber.dispose()
    await vi.waitFor(() => { expect(tools.get('mcp__beta__inspect')).toBeUndefined() })
    await expect(access(join(root, 'beta.pid'))).rejects.toThrow()
  })

  it('tests disabled saved configuration without enabling or registering tools and reuses active connections', async () => {
    const { manager, settings, ctx, root, save, server } = await boot()
    await save({ local: server('local', false) })
    await vi.waitFor(() => { expect(manager.list()).toHaveLength(1) })
    const before = settings.describe().find(row => row.ns === MCP_SETTINGS_NAMESPACE)!.revision
    expect(await manager.test('local')).toEqual({ toolCount: 1, tools: ['inspect'] })
    expect(settings.describe().find(row => row.ns === MCP_SETTINGS_NAMESPACE)!.revision).toBe(before)
    expect(ctx.get('tools')!.get('mcp__local__inspect')).toBeUndefined()
    await expect(access(join(root, 'local.pid'))).rejects.toThrow()
    await save({ local: server('local') })
    await connected(manager, 'local')
    const pid = await readFile(join(root, 'local.pid'), 'utf8')
    expect(await manager.test('local')).toEqual({ toolCount: 1, tools: ['inspect'] })
    expect(await readFile(join(root, 'local.pid'), 'utf8')).toBe(pid)
  })

  it('serializes temporary discovery with enabling the same saved server', async () => {
    const { manager, save, server } = await boot()
    await save({ local: server('local', false) })
    await vi.waitFor(() => { expect(manager.list()).toHaveLength(1) })
    const probing = manager.test('local')
    await save({ local: server('local') })
    expect(await probing).toEqual({ toolCount: 1, tools: ['inspect'] })
    await connected(manager, 'local')
  })

  it('aborts and closes an in-flight discovery when the manager is disposed', async () => {
    const { manager, managerFiber, save, server, root } = await boot()
    await save({ local: server('local', false, 'hang') })
    await vi.waitFor(() => { expect(manager.list()).toHaveLength(1) })
    const probing = expect(manager.test('local')).rejects.toThrow('MCP discovery failed')
    await vi.waitFor(async () => { await access(join(root, 'local.pid')) })
    await managerFiber.dispose()
    await probing
    await expect(access(join(root, 'local.pid'))).rejects.toThrow()
  })

  it('isolates failed connection, rejects malformed writes and never exposes supplied secrets in diagnostics', async () => {
    const { manager, settings, save, server } = await boot()
    await save({ good: server('good'), bad: { ...server('bad'), command: '/missing/private-secret-command', env: { TOKEN: 'private-secret-value' } } })
    await connected(manager, 'good')
    await vi.waitFor(() => { expect(manager.list().find(row => row.name === 'bad')?.state).toBe('error') }, { timeout: 10_000 })
    expect(JSON.stringify(manager.list())).not.toContain('private-secret')
    await expect(manager.test('bad')).rejects.toThrow('MCP discovery failed')
    const revision = settings.describe().find(row => row.ns === MCP_SETTINGS_NAMESPACE)!.revision
    for (const servers of [
      { 'bad name': server('x', false) },
      { local: { ...server('x', false), command: '' } },
      { local: { ...server('x', false), apiKey: 'must-not-be-stored-here' } },
      { local: { ...server('x', false), connectTimeoutMs: 0 } },
      { local: { ...server('x', false), reconnect: { initialDelayMs: 50, maxDelayMs: 10 } } },
      { local: { transport: 'streamable-http', url: 'file:///tmp/server' } },
      { local: { transport: 'streamable-http', url: 'http://user:secret@localhost/' } },
      { local: { ...server('x', false), headers: { Authorization: 'a\nb' } } },
    ]) await expect(save(servers)).rejects.toThrow()
    expect(settings.describe().find(row => row.ns === MCP_SETTINGS_NAMESPACE)!.revision).toBe(revision)
  })

  it('applies saved Smart Tree memory modes through the real connection and tool executor', async () => {
    const { ctx, manager, save, server } = await boot()
    const local = server('local', true, 'memory')
    const tools = ctx.get('tools')!
    const execute = (operation: string) => tools.execute({
      callId: CallId(`memory-${operation}`), name: 'mcp__local__memory', signal: new AbortController().signal,
      arguments: { operation, keywords: ['fixture'], context: 'fixture context', anchor_type: 'pattern' },
    })
    await save({ local: { ...local, smartTreeMemory: 'read-only' } })
    await connected(manager, 'local')
    expect(tools.get('mcp__local__memory')?.parameters).toMatchObject({ properties: { operation: { enum: ['find'] } } })
    expect((await execute('anchor')).isError).toBe(true)
    expect((await execute('find')).isError).toBe(false)
    await save({ local: { ...local, smartTreeMemory: 'off' } })
    await vi.waitFor(() => { expect(manager.list()).toEqual([{ name: 'local', state: 'connected', toolCount: 0 }]) })
    expect(tools.get('mcp__local__memory')).toBeUndefined()
    expect((await execute('find')).isError).toBe(true)
    await save({ local: { ...local, smartTreeMemory: 'read-write' } })
    await vi.waitFor(() => { expect(manager.list()).toEqual([{ name: 'local', state: 'connected', toolCount: 1 }]) })
    expect((await execute('anchor')).isError).toBe(false)
  })

  it('validates an HTTP configuration without requiring a connection or embedding credentials', () => {
    const config = McpSettingsSchema({ servers: { remote: { transport: 'streamable-http', url: 'http://127.0.0.1:28428/mcp/message' } } } as never)
    expect(() => { validateMcpSettings(config) }).not.toThrow()
    expect(config.servers.remote?.enabled).toBe(false)
    expect(config.servers.remote?.headers).toEqual({})
  })
})
