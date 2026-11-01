/** Wire validation for privileged MCP status and saved-server discovery. */
import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** mcp.list request. */
export const mcpListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'mcp.list'>>>
/** mcp.list response. */
export const mcpListValueSchema = z.object({
  servers: z.array(z.object({
    name: z.string(),
    state: z.enum(['disabled', 'connecting', 'connected', 'reconnecting', 'error']),
    toolCount: z.number().int().nonnegative(),
    error: z.string().optional(),
  })),
}) satisfies z.ZodType<Wire<ResponseValue<'mcp.list'>>>
/** mcp.test request. */
export const mcpTestRequestSchema = z.object({ name: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/) }) satisfies z.ZodType<Wire<RequestPayload<'mcp.test'>>>
/** mcp.test response. */
export const mcpTestValueSchema = z.object({ toolCount: z.number().int().nonnegative(), tools: z.array(z.string()) }) satisfies z.ZodType<Wire<ResponseValue<'mcp.test'>>>
