/** HOST-local MCP management. Configuration writes use the mcp-servers settings namespace. */
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Runtime status without commands, URLs, headers, environment or raw server errors. */
export interface McpServerView {
  name: string
  state: 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  toolCount: number
  error?: string
}

/** Privileged host configuration operations, never agent-callable tool execution. */
export interface McpApi {
  /**
   * Read saved servers' runtime status.
   * @param request - Empty request payload.
   * @returns Detached status rows; missing manager answers internal error.
   */
  list(request: RpcRequest<{}>): Promise<RpcResponse<{ servers: McpServerView[] }>>
  /**
   * Discover tools using saved configuration without invoking tools or persisting changes.
   * @param request - Saved server name.
   * @param signal - Carrier cancellation; saved timeout still applies.
   * @returns Raw tool names and count, or a sanitized failure.
   */
  test(request: RpcRequest<{ name: string }>, signal?: AbortSignal): Promise<RpcResponse<{ toolCount: number; tools: string[] }>>
}
