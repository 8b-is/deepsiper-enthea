/** Keyless real Web Host: persisted MCP settings, HTTP administration, and memory-tool policy. */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import McpServers, { MCP_SETTINGS_NAMESPACE, type McpSettings } from '@deepseek-ai/dsh-mcp-client/settings'
import type {
  RequestPayload, ResponseValue, RpcMethodMap, RpcResponse, SettingsNamespaceView,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/mcp-settings', import.meta.url))
const EXPECTED = join(SNAPSHOT_DIR, 'administration.expected.md')
const SERVER = fileURLToPath(new URL('../../../packages/mcp/mcp-client/tests/fixtures/settings-server.mjs', import.meta.url))
const ENV_SECRET = 'mcp-snapshot-env-secret'
const HEADER_SECRET = 'Bearer mcp-snapshot-header-secret'
let scaffold: WebScaffold | undefined

/** Select stable redacted settings fields without process paths or revision counters. */
function savedView(view: SettingsNamespaceView) {
  const server = (view.value as McpSettings).servers.local!
  return {
    enabled: server.enabled,
    transport: server.transport,
    smartTreeMemory: server.smartTreeMemory,
    env: server.env,
    headers: server.headers,
    secrets: view.secrets,
  }
}

afterEach(async () => {
  await scaffold?.close()
  scaffold = undefined
})

it('snapshots saved MCP administration and enforced read-only memory on the real Web Host', async () => {
  scaffold = await launchWebScaffold({ toolsMode: 'native' })
  const { ctx, baseUrl, workspaceCwd, harnessHome } = scaffold
  const connectionEntry = [...ctx.loader.entries()].find(entry => entry.options.id === 'connection')
  await connectionEntry?.fiber?.await()
  expect(ctx.get('connection'), 'real Web Host Connection must be active').toBeDefined()
  expect(ctx.get('mcpServers')).toBeUndefined()
  await ctx.plugin(McpServers)
  const cwd = join(workspaceCwd, 'private-mcp')
  await mkdir(cwd, { mode: 0o700 })
  const marker = join(cwd, 'server.pid')
  const callsPath = join(cwd, 'calls.txt')
  await writeFile(callsPath, '')
  const wireCalls = async () => (await readFile(callsPath, 'utf8')).split('\n').filter(Boolean)
  let nextRpc = 0
  const rpc = async <K extends keyof RpcMethodMap>(method: K, payload: RequestPayload<K>): Promise<ResponseValue<K>> => {
    const response = await fetch(`${baseUrl}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ type: 'client-request', rpcId: `mcp-snapshot-${++nextRpc}`, method, payload }),
    })
    const text = await response.text()
    expect(response.status, `${method}: ${text}`).toBe(200)
    expect(text).not.toContain(ENV_SECRET)
    expect(text).not.toContain(HEADER_SECRET)
    const envelope = JSON.parse(text) as RpcResponse<ResponseValue<K>>
    if (!envelope.result.ok) throw new Error(`${method}: ${envelope.result.error.message}`)
    return envelope.result.value
  }

  const description = await rpc('settings.describe', {})
  const initialView = description.namespaces.find(view => view.ns === MCP_SETTINGS_NAMESPACE)!
  expect(initialView.value).toEqual({ servers: {} })
  const initialStatus = await rpc('mcp.list', {})
  expect(initialStatus.servers).toEqual([])
  const saved = await rpc('settings.replace', {
    ns: MCP_SETTINGS_NAMESPACE,
    expectedRevision: initialView.revision,
    section: {
      servers: {
        local: {
          enabled: false, transport: 'stdio', command: process.execPath,
          args: [SERVER, marker, 'memory', callsPath], cwd,
          env: { MCP_FIXTURE_SECRET: ENV_SECRET }, headers: { Authorization: HEADER_SECRET },
          smartTreeMemory: 'read-only', reconnect: { enabled: false },
        },
      },
    },
  })
  expect(savedView(saved)).toMatchObject({ enabled: false, env: {}, headers: {} })
  await expect.poll(async () => (await rpc('mcp.list', {})).servers).toEqual([
    { name: 'local', state: 'disabled', toolCount: 0 },
  ])
  const disabled = await rpc('mcp.list', {})
  const discovered = await rpc('mcp.test', { name: 'local' })
  expect(discovered).toEqual({ toolCount: 1, tools: ['memory'] })
  expect(await wireCalls()).toEqual([])
  await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  const afterDiscovery = await rpc('mcp.list', {})
  expect(afterDiscovery).toEqual(disabled)
  expect(ctx.tools.get('mcp__local__memory')).toBeUndefined()

  const enabled = await rpc('settings.mutate', {
    ns: MCP_SETTINGS_NAMESPACE, expectedRevision: saved.revision,
    ops: [{ op: 'set', path: ['servers', 'local', 'enabled'], value: true }],
  })
  await expect.poll(async () => (await rpc('mcp.list', {})).servers, { timeout: 10_000 }).toEqual([
    { name: 'local', state: 'connected', toolCount: 1 },
  ])
  const connected = await rpc('mcp.list', {})
  const tool = ctx.tools.get('mcp__local__memory')!
  expect(tool.parameters).toMatchObject({ properties: { operation: { enum: ['find'] } } })
  const registeredTool = { name: tool.name, parameters: tool.parameters }
  const invoke = (operation: string) => ctx.tools.execute({
    callId: CallId(`mcp-snapshot-${operation}`), name: tool.name, signal: new AbortController().signal,
    arguments: { operation, keywords: ['snapshot'], context: 'must not be saved', anchor_type: 'pattern' },
  })
  const denied = await invoke('anchor')
  expect(denied.isError).toBe(true)
  expect(denied.content).toEqual([
    { type: 'text', text: 'Error: Smart Tree memory is read-only: only operation "find" is permitted.' },
  ])
  const callsAfterDenial = await wireCalls()
  expect(callsAfterDenial).toEqual([])
  const recalled = await invoke('find')
  expect(recalled.isError).toBe(false)
  expect(recalled.content).toEqual([{ type: 'text', text: 'find' }])
  const callsAfterRecall = await wireCalls()
  expect(callsAfterRecall).toEqual(['memory:find'])

  await rpc('settings.mutate', {
    ns: MCP_SETTINGS_NAMESPACE, expectedRevision: enabled.revision,
    ops: [{ op: 'set', path: ['servers', 'local', 'enabled'], value: false }],
  })
  await expect.poll(async () => (await rpc('mcp.list', {})).servers).toEqual(disabled.servers)
  expect(ctx.tools.get(tool.name)).toBeUndefined()
  await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  const document = await readFile(join(harnessHome, 'settings.yaml'), 'utf8')
  expect(document).toContain(ENV_SECRET)
  expect(document).toContain(HEADER_SECRET)
  const snapshot = {
    settingsWritable: description.writable,
    initial: initialStatus,
    savedDisabled: savedView(saved),
    disabled,
    discovery: discovered,
    afterDiscovery,
    savedEnabled: savedView(enabled),
    connected,
    registeredTool,
    refusedAnchor: { isError: denied.isError, content: denied.content, wireCalls: callsAfterDenial },
    allowedFind: { isError: recalled.isError, content: recalled.content, wireCalls: callsAfterRecall },
    disabledAgain: await rpc('mcp.list', {}),
    toolRemoved: ctx.tools.get(tool.name) === undefined,
    credentialsPersistedWithoutReturningValues: true,
  }
  const transcript = `# MCP settings on the Web Host\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\``
  await compareOrRefreshGolden(EXPECTED, transcript, webSnapshotMode())
  await assertFixtureInventory(SNAPSHOT_DIR, ['administration.expected.md'])
}, 120_000)
