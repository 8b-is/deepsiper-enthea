/** Explicit Smart Tree MEM8 memory-tool policy; other MCP tools remain unrestricted. */

/** Omission keeps a generic MCP server's tools unchanged. */
export type SmartTreeMemoryPolicy = 'off' | 'read-only' | 'read-write'

/**
 * Enforce the saved policy immediately before an MCP request, independently of advertised schemas.
 * @param rawName - Exact server-advertised tool name, never the normalized public name.
 * @param args - Parsed tool arguments.
 * @param policy - Explicit Smart Tree memory mode, or undefined for generic MCP behavior.
 * @returns Arguments to send; read-only operation is pinned to the validated literal.
 */
export function enforceMemoryPolicy(
  rawName: string,
  args: Record<string, unknown>,
  policy: SmartTreeMemoryPolicy | undefined,
): Record<string, unknown> {
  if (rawName !== 'memory' || policy === undefined || policy === 'read-write') return args
  if (policy === 'off') throw new Error('Smart Tree memory is disabled for this server.')
  if (Array.isArray(args) || !Object.hasOwn(args, 'operation') || args.operation !== 'find') {
    throw new Error('Smart Tree memory is read-only: only operation "find" is permitted.')
  }
  return { ...args, operation: 'find' }
}

/**
 * Advertise read-only memory operations without relying on this schema for enforcement.
 * @param rawName - Exact server tool name.
 * @param parameters - Server-provided input schema.
 * @param policy - Explicit memory mode.
 * @returns Original schema for unrelated tools; a detached narrowed schema for read-only memory.
 */
export function memoryParameters(
  rawName: string,
  parameters: Record<string, unknown>,
  policy: SmartTreeMemoryPolicy | undefined,
): Record<string, unknown> {
  if (rawName !== 'memory' || policy !== 'read-only') return parameters
  const properties = typeof parameters.properties === 'object' && parameters.properties !== null && !Array.isArray(parameters.properties)
    ? parameters.properties as Record<string, unknown>
    : {}
  const required: unknown[] = Array.isArray(parameters.required) ? parameters.required : []
  return {
    ...parameters,
    properties: { ...properties, operation: { type: 'string', enum: ['find'] } },
    required: [...new Set([...required, 'operation'])],
  }
}
