/** Keyless MCP fixture: exclusive process marker proves replacement never overlaps. */
import { appendFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const marker = process.argv[2]
writeFileSync(marker, String(process.pid), { flag: 'wx' })
process.on('exit', () => unlinkSync(marker))
process.on('SIGTERM', () => process.exit(0))
process.stdin.on('end', () => process.exit(0))
const server = new Server({ name: 'settings-fixture', version: '1' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, () => {
  if (process.argv[3] === 'hang') return new Promise(() => {})
  const inputSchema = process.argv[3] === 'memory'
    ? {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['anchor', 'find'] },
        keywords: { type: 'array', items: { type: 'string' } },
        context: { type: 'string' }, anchor_type: { type: 'string' },
      },
      required: ['operation', 'keywords'],
    }
    : { type: 'object', properties: {} }
  return { tools: [{ name: process.argv[3] || 'inspect', inputSchema }] }
})
server.setRequestHandler(CallToolRequestSchema, (request) => {
  if (process.argv[3] !== 'memory') throw new Error('Discovery must never invoke tools')
  const operation = String(request.params.arguments.operation)
  if (process.argv[4]) appendFileSync(process.argv[4], `${request.params.name}:${operation}\n`)
  return { content: [{ type: 'text', text: operation }] }
})
await server.connect(new StdioServerTransport())
