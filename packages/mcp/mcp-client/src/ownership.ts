/** Namespace ownership shared by persistent connections and temporary discovery clients. */
import type { Context } from '@deepseek-ai/cordis'

const activeNames = new WeakMap<Context, Set<string>>()

/** A server process without an observed close must not be replaced. */
export class McpShutdownIncompleteError extends Error {
  constructor() {
    super('MCP server shutdown is incomplete; replacement refused')
  }
}

/**
 * Reserve a namespace until its caller proves the server process has closed.
 * @param ctx - Host context identifying the owning application.
 * @param name - Stable server key.
 * @returns Release function; callers must retain the reservation on incomplete shutdown.
 */
export function reserveServerName(ctx: Context, name: string): () => void {
  let names = activeNames.get(ctx.root)
  if (names === undefined) activeNames.set(ctx.root, names = new Set())
  if (names.has(name)) throw new Error(`mcp-client: serverName "${name}" is already in use by another mcp-client instance`)
  names.add(name)
  const reservations = names
  return () => { reservations.delete(name) }
}

/** SDK stdio shutdown includes two two-second grace periods; allow its final close callback. */
export const MCP_CLOSE_TIMEOUT_MS = 5_000

/**
 * Await the transport-owned close signal with a bounded fail-closed outcome.
 * @param closed - Generation close notification.
 * @returns Whether the transport confirmed shutdown before the close deadline.
 */
export function waitForMcpClose(closed: Promise<void>): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() =>{  resolve(false) }, MCP_CLOSE_TIMEOUT_MS)
    timer.unref()
    void closed.then(() => { clearTimeout(timer); resolve(true) })
  })
}
