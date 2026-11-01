/** Discovery-only MCP requests; never register or invoke a server tool. */
import type { Context } from '@deepseek-ai/cordis'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { createTransport } from './transport.ts'
import { McpShutdownIncompleteError, reserveServerName, waitForMcpClose } from './ownership.ts'
import type { Config } from './index.ts'

/**
 * Read every page of raw tool names with a total caller-owned deadline.
 * @param client - Connected client, retained by its owner.
 * @param signal - Cancellation covering all pages.
 * @returns Unique raw tool names in server order.
 */
export async function discoverToolNames(client: Client, signal: AbortSignal): Promise<string[]> {
  const tools = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    signal.throwIfAborted()
    const page = await client.request({ method: 'tools/list', params: { cursor } }, ListToolsResultSchema, { signal })
    for (const tool of page.tools) tools.add(tool.name)
    cursor = page.nextCursor
    if (cursor !== undefined) {
      if (cursors.has(cursor)) throw new Error('MCP discovery returned a repeated cursor')
      cursors.add(cursor)
    }
  } while (cursor)
  return [...tools]
}

/**
 * Connect a temporary client for discovery and prove shutdown before releasing its name.
 * @param ctx - Host context owning the namespace reservation.
 * @param config - Saved server transport configuration.
 * @param signal - Total connection and discovery deadline.
 * @returns Raw tool names; protocol errors are not suitable for public diagnostics.
 */
export async function discoverServer(ctx: Context, config: Config, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted()
  const releaseName = reserveServerName(ctx, config.serverName)
  const client = new Client({ name: 'dsh-mcp-test', version: '0.0.1' }, { capabilities: {} })
  const closed: PromiseWithResolvers<void> = Promise.withResolvers()
  client.onclose = closed.resolve
  try {
    await client.connect(createTransport(config), { signal })
    return await discoverToolNames(client, signal)
  } finally {
    try { await client.close() } catch { /* The close notification, not close() success, proves transport shutdown. */ }
    if (!await waitForMcpClose(closed.promise)) throw new McpShutdownIncompleteError()
    releaseName()
  }
}
