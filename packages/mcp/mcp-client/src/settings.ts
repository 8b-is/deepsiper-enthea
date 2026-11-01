/** Persistent HOST-local MCP manager. Mount once beside settings and the tool registry. */
import { Context, Service } from '@deepseek-ai/cordis'
import { deepEqualJson } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { resolveReconnectPolicy, startConnection } from './connection.ts'
import type { ConnectionHandle, ConnectionStatus } from './connection.ts'
import { discoverServer } from './discovery.ts'
import { McpShutdownIncompleteError } from './ownership.ts'
import { connectionConfig, MCP_SETTINGS_NAMESPACE, McpSettingsSchema, validateMcpSettings } from './settings-schema.ts'
import type { McpSettings, SavedMcpServer } from './settings-schema.ts'

export { MCP_SETTINGS_NAMESPACE, McpSettingsSchema } from './settings-schema.ts'
export type { McpSettings, SavedMcpServer } from './settings-schema.ts'

/** Value-free runtime status of a saved server. */
export interface McpServerStatus {
  name: string
  state: ConnectionStatus['state'] | 'disabled'
  toolCount: number
  error?: string
}

interface Entry {
  config: SavedMcpServer | undefined
  connection: ConnectionHandle | undefined
  error: string | undefined
  tail: Promise<void>
}

const CONNECTION_ERROR = 'MCP connection failed. Check the saved configuration and server availability.'
const SHUTDOWN_ERROR = 'MCP server shutdown is incomplete; replacement refused. Restart the Host after checking the server process.'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpServers: McpServers
  }
}

/** Saved configurations are durable through settings; connections are process-local and effect-owned. */
export default class McpServers extends Service {
  static inject = ['settings', 'tools']
  private readonly scope: SettingsScope<McpSettings>
  private readonly entries = new Map<string, Entry>()
  private readonly lifetime = new AbortController()

  constructor(ctx: Context) {
    super(ctx, 'mcpServers')
    this.scope = ctx.settings.register(MCP_SETTINGS_NAMESPACE, McpSettingsSchema, { applies: 'live', validate: validateMcpSettings })
    const unwatch = this.scope.watch(next => this.reconcile(next))
    ctx.effect(() => async () => {
      unwatch()
      this.lifetime.abort()
      await Promise.all([...this.entries.values()].map(async (entry) => {
        await entry.tail
        await entry.connection?.dispose()
      }))
      this.entries.clear()
    }, 'mcp-settings.connections')
    void this.reconcile(this.scope.get())
  }

  /**
   * Read actual connection states, including a pending failed shutdown.
   * @returns Detached status rows without commands, credentials or raw transport errors.
   */
  list(): McpServerStatus[] {
    return [...this.entries].map(([name, entry]) => {
      if (entry.error !== undefined) return { name, state: 'error', toolCount: entry.connection?.status().toolCount ?? 0, error: entry.error }
      if (entry.connection !== undefined) return { name, ...entry.connection.status() }
      return { name, state: entry.config?.enabled === true ? 'connecting' : 'disabled', toolCount: 0 }
    })
  }

  /**
   * Discover tools using saved configuration without invoking tools or changing enabled.
   * Connected servers reuse their existing client; disabled servers use a temporary client.
   * Operations for one name serialize with edits, so stdio children cannot overlap.
   * @param name - Saved server key.
   * @param signal - Optional caller cancellation; the saved connection timeout still applies.
   * @returns Raw discovered names and their count; failures never include server diagnostics.
   */
  async test(name: string, signal?: AbortSignal): Promise<{ toolCount: number; tools: string[] }> {
    const entry = this.entries.get(name)
    if (entry === undefined) throw new Error('MCP server is not saved')
    const operation = entry.tail.then(async () => {
      this.lifetime.signal.throwIfAborted()
      const config = entry.config
      if (config === undefined) throw new Error('MCP server is not saved')
      if (entry.error === SHUTDOWN_ERROR) throw new Error(SHUTDOWN_ERROR)
      const signals = [this.lifetime.signal, AbortSignal.timeout(config.connectTimeoutMs)]
      if (signal !== undefined) signals.push(signal)
      const deadline = AbortSignal.any(signals)
      const tools = entry.connection === undefined
        ? await discoverServer(this.ctx, connectionConfig(name, config), deadline)
        : await entry.connection.discover(deadline)
      return { toolCount: tools.length, tools }
    })
    entry.tail = operation.then(() => {}, () => {})
    try { return await operation } catch (error) {
      if (error instanceof McpShutdownIncompleteError) entry.error = SHUTDOWN_ERROR
      throw new Error('MCP discovery failed or timed out. Check the saved configuration and server availability.')
    }
  }

  private async reconcile(settings: McpSettings): Promise<void> {
    const stopped = () => this.lifetime.signal.aborted
    if (stopped()) return
    const names = new Set([...this.entries.keys(), ...Object.keys(settings.servers)])
    await Promise.all([...names].map(async (name) => {
      let entry = this.entries.get(name)
      if (entry === undefined) {
        entry = { config: undefined, connection: undefined, error: undefined, tail: Promise.resolve() }
        this.entries.set(name, entry)
      }
      const current = entry
      const next = settings.servers[name]
      const operation = current.tail.then(async () => {
        if (stopped() || deepEqualJson(current.config, next)) return
        try { await current.connection?.dispose() } catch {
          current.error = SHUTDOWN_ERROR
          return
        }
        current.connection = undefined
        current.config = next
        current.error = undefined
        if (next === undefined) {
          this.entries.delete(name)
          return
        }
        if (!next.enabled || stopped()) return
        try {
          current.connection = startConnection(this.ctx, connectionConfig(name, next), resolveReconnectPolicy(next.reconnect, 'MCP reconnect'))
        } catch {
          current.error = CONNECTION_ERROR
        }
      })
      current.tail = operation
      await operation
    }))
  }
}
