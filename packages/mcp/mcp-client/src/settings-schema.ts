/** Persisted HOST-local MCP configuration, including structurally redacted secrets. */
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { RECONNECT_DEFAULTS, resolveReconnectPolicy } from './connection.ts'
import type { ReconnectConfig } from './connection.ts'
import type { Config, SmartTreeMemoryPolicy } from './index.ts'

/** Namespace managed by the HOST-local MCP service. */
export const MCP_SETTINGS_NAMESPACE = settingsNamespace('mcp-servers')

/** Saved configuration. Inactive transport fields are retained for transport switching. */
export interface SavedMcpServer {
  enabled: boolean
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  url: string
  headers: Record<string, string>
  connectTimeoutMs: number
  toolCallTimeoutMs: number
  reconnect: ReconnectConfig
  /** Applies only to the exact raw memory tool; does not sandbox other tools. */
  smartTreeMemory?: SmartTreeMemoryPolicy
}

/** Persistent servers keyed by their stable model-tool namespace. */
export interface McpSettings {
  servers: Record<string, SavedMcpServer>
}

const duration = () => z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS)

/** Flat objects keep secrets reachable by the settings redactor, including inactive fields. */
export const McpSettingsSchema: z<McpSettings> = z.object({
  servers: z.dict(z.object({
    enabled: z.boolean().default(false),
    transport: z.union(['stdio', 'streamable-http']).default('stdio'),
    command: z.string().default(''),
    args: z.array(String).default([]),
    cwd: z.string().default(''),
    env: z.dict(z.string().role('secret')).default({}),
    url: z.string().default(''),
    headers: z.dict(z.string().role('secret')).default({}),
    connectTimeoutMs: duration().default(10_000),
    toolCallTimeoutMs: duration().default(60_000),
    smartTreeMemory: z.union(['off', 'read-only', 'read-write']),
    reconnect: z.object({
      enabled: z.boolean().default(RECONNECT_DEFAULTS.enabled),
      initialDelayMs: duration().default(RECONNECT_DEFAULTS.initialDelayMs),
      maxDelayMs: duration().default(RECONNECT_DEFAULTS.maxDelayMs),
      maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(RECONNECT_DEFAULTS.maxAttempts),
    }).default(RECONNECT_DEFAULTS),
  })).default({}),
})

/**
 * Reject malformed commands, URLs and cross-field reconnect values before persistence.
 * @param settings - Schema-resolved persisted section.
 */
export function validateMcpSettings(settings: McpSettings): void {
  if (Object.keys(settings).some(key => key !== 'servers')) throw new Error('MCP settings only accepts the servers section')
  const fields = new Set(['enabled', 'transport', 'command', 'args', 'cwd', 'env', 'url', 'headers', 'connectTimeoutMs', 'toolCallTimeoutMs', 'reconnect', 'smartTreeMemory'])
  for (const [name, server] of Object.entries(settings.servers)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) {
      throw new Error('MCP server names must contain 1–32 ASCII letters, digits, underscores or hyphens and must not be reserved object keys')
    }
    const label = `MCP server ${name}`
    if (Object.keys(server).some(key => !fields.has(key))) throw new Error(`${label}: unknown option; credentials belong in env or headers`)
    resolveReconnectPolicy(server.reconnect, `${label} reconnect`)
    if ([server.command, server.cwd, ...server.args, ...Object.values(server.env)].some(value => value.includes('\0'))) {
      throw new Error(`${label}: command, cwd, args and environment must not contain NUL characters`)
    }
    if (Object.keys(server.env).some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))) {
      throw new Error(`${label}: environment keys must be portable variable names`)
    }
    if (Object.entries(server.headers).some(([key, value]) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /[\r\n\0]/.test(value))) {
      throw new Error(`${label}: invalid HTTP header name or value`)
    }
    if (server.transport === 'stdio') {
      if (!server.command.trim()) throw new Error(`${label}: stdio requires an executable command`)
    } else {
      let url: URL
      try { url = new URL(server.url) } catch { throw new Error(`${label}: HTTP transport requires an absolute http(s) URL`) }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
        throw new Error(`${label}: URL must use http(s), without credentials or a fragment; use secret headers for authentication`)
      }
    }
  }
}

/**
 * Resolve a saved server into the existing connection supervisor's configuration.
 * @param name - Saved server key.
 * @param server - Schema-resolved saved entry.
 * @returns Transport configuration with isolated startup failure handling.
 */
export function connectionConfig(name: string, server: SavedMcpServer): Config {
  const common = {
    serverName: name,
    connectTimeoutMs: server.connectTimeoutMs,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: false,
    reconnect: server.reconnect,
    ...server.smartTreeMemory === undefined ? {} : { smartTreeMemory: server.smartTreeMemory },
  }
  return server.transport === 'stdio'
    ? { ...common, transport: 'stdio', command: server.command, args: server.args, cwd: server.cwd, env: server.env }
    : { ...common, transport: 'streamable-http', url: server.url, headers: server.headers }
}
