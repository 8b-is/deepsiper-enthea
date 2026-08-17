/**
 * crabcc symbol index tools and skill provider.
 *
 * Wraps the crabcc CLI (https://github.com/8b-is/crabcc) as agent tools:
 * - code_search: find symbols by name with optional reference expansion
 * - goto_definition: locate a symbol's definition
 * - find_references: find all references to a symbol
 *
 * Also registers a skill provider that contributes a "crabcc" skill
 * describing how to use these tools effectively.
 *
 * @module @deepseek-ai/dsh-skill-crabcc
 */

import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
} from '@deepseek-ai/dsh-skill'

export const name = 'skill-crabcc'
export const inject = ['tools', 'skills']

/** crabcc tool configuration. */
export interface Config {
  /** Path to crabcc binary. Defaults to `crabcc` in PATH. */
  crabccBin?: string
  /** Default repository root for queries. Defaults to process.cwd(). */
  defaultRoot?: string
  /** Whether to run crabcc as MCP server for skill discovery. */
  useMcp?: boolean
  /** MCP server address when useMcp is true. */
  mcpAddr?: string
  /** Skill provider name. */
  providerName?: string
}

export const Config: Schema<Config> = z.object({
  crabccBin: z.string().default('crabcc'),
  defaultRoot: z.string().default(process.cwd()),
  useMcp: z.boolean().default(false),
  mcpAddr: z.string().default('127.0.0.1:8091'),
  providerName: z.string().min(1).default('crabcc'),
})

/** Default configuration values. */
const DEFAULT_CONFIG: Config = {
  crabccBin: 'crabcc',
  defaultRoot: process.cwd(),
  useMcp: false,
  mcpAddr: '127.0.0.1:8091',
  providerName: 'crabcc',
}

/** Module-level config store set by apply() for tool access. */
let currentConfig: Config = Object.assign({}, DEFAULT_CONFIG)

/** Get the current crabcc config. */
function getConfig(): Config {
  return currentConfig
}

/** Set the current crabcc config. */
function setConfig(config: Config): void {
  currentConfig = config
}

interface CrabccSymbolResult {
  name: string
  kind: string
  file: string
  line: number
  column: number
  signature?: string
  doc?: string
}

interface CrabccRefsResult {
  symbol: string
  refs: Array<{
    file: string
    line: number
    column: number
    kind: 'read' | 'write' | 'call' | 'import'
  }>
}

/** Execute crabcc command and return parsed JSON output. */
export async function runCrabcc(
  bin: string,
  args: string[],
  options: { root?: string; signal?: AbortSignal | undefined } = {},
): Promise<unknown> {
  const { root = process.cwd(), signal } = options
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer | string) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk: Buffer | string) => { stderr += String(chunk) })
    child.on('error', (err) => { reject(err) })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`crabcc ${args.join(' ')} failed (exit ${code}): ${stderr.trim()}`))
        return
      }
      try {
        const parsed: unknown = JSON.parse(stdout.trim())
        resolve(parsed)
      } catch (err) {
        reject(new Error(`Failed to parse crabcc output: ${err instanceof Error ? err.message : String(err)}\nOutput: ${stdout}`))
      }
    })
  })
}

/** `code_search` tool: query symbols with optional reference count. */
const codeSearchTool = defineTool({
  name: 'code_search',
  description:
    'Search for code symbols (functions, types, classes, methods) in the repository using the crabcc symbol index. Fast, fuzzy name matching with optional reference counts. Use this instead of grep when looking for definitions.',
  parameters: {
    query: { type: 'string', required: true, description: 'Symbol name or search pattern' },
    limit: { type: 'integer', description: 'Maximum number of results to return (default: 20)' },
    includeRefs: { type: 'boolean', description: 'Include reference counts for each symbol (slower)' },
    root: { type: 'string', description: 'Repository root path (defaults to workspace root)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', required: true },
              kind: { type: 'string', required: true },
              file: { type: 'string', required: true },
              line: { type: 'integer', required: true },
              column: { type: 'integer', required: true },
              signature: { type: 'string' },
              doc: { type: 'string' },
              refCount: { type: 'integer' },
            },
          },
        },
        query: { type: 'string', required: true },
        total: { type: 'integer', required: true },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args, exec) {
    const { crabccBin = 'crabcc', defaultRoot = process.cwd() } = getConfig()
    const root = args.root ?? defaultRoot
    const query = args.query
    const limit = args.limit ?? 20
    const includeRefs = args.includeRefs ?? false

    const raw = await runCrabcc(crabccBin, ['lookup', 'sym', query, '--json', '--limit', String(limit)], {
      root,
      signal: exec.signal,
    })

    if (!raw || !Array.isArray(raw)) {
      return { results: [], query, total: 0 }
    }

    const results = raw as CrabccSymbolResult[]
    let enriched = results.slice(0, limit)
    if (includeRefs) {
      enriched = await Promise.all(
        enriched.map(async (sym) => {
          try {
            const refs = await runCrabcc(
              crabccBin,
              ['lookup', 'refs', sym.name, '--json'],
              { root, signal: exec.signal },
            ) as CrabccRefsResult
            return { ...sym, refCount: refs.refs.length }
          } catch {
            return { ...sym, refCount: 0 }
          }
        }),
      )
    }

    return { results: enriched, query, total: results.length }
  },
  presentCall(args) {
    return {
      card: 'generic',
      title: `Search symbols: ${args.query}`,
      kind: 'read',
      rawInput: args,
    }
  },
  presentResult(_args, result) {
    const { results = [], total = 0 } = (result as unknown) as { results?: unknown[]; total?: number }
    return {
      card: 'generic',
      title: `Found ${total} symbol${total === 1 ? '' : 's'}`,
      kind: 'read',
      rawOutput: { results: Array.isArray(results) ? results.slice(0, 5) : [], total },
    }
  },
})

/** `goto_definition` tool: locate a symbol's definition. */
const gotoDefinitionTool = defineTool({
  name: 'goto_definition',
  description:
    'Find the exact definition location of a symbol. Returns the file, line, column, and signature. Use this when you need to jump to where a function, type, or class is defined.',
  parameters: {
    symbol: { type: 'string', required: true, description: 'Exact symbol name to locate' },
    root: { type: 'string', description: 'Repository root path (defaults to workspace root)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        found: { type: 'boolean', required: true },
        symbol: { type: 'string' },
        kind: { type: 'string' },
        file: { type: 'string' },
        line: { type: 'integer' },
        column: { type: 'integer' },
        signature: { type: 'string' },
        doc: { type: 'string' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args, exec) {
    const { crabccBin = 'crabcc', defaultRoot = process.cwd() } = getConfig()
    const root = args.root ?? defaultRoot
    const symbol = args.symbol

    const raw = await runCrabcc(crabccBin, ['lookup', 'sym', symbol, '--json', '--limit', '1'], {
      root,
      signal: exec.signal,
    })

    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      return { found: false, symbol }
    }

    const results = raw as CrabccSymbolResult[]
    const sym = results[0]
    if (!sym) {
      return { found: false, symbol }
    }

    return {
      found: true,
      symbol: sym.name,
      kind: sym.kind,
      file: sym.file,
      line: sym.line,
      column: sym.column,
      signature: sym.signature ?? '',
      doc: sym.doc ?? '',
    }
  },
  presentCall(args) {
    return {
      card: 'generic',
      title: `Go to definition: ${args.symbol}`,
      kind: 'read',
      rawInput: args,
    }
  },
  presentResult(_args, result) {
    const { found, symbol, file, line } = (result as unknown) as { found: boolean; symbol: string; file?: string; line?: number }
    return {
      card: 'generic',
      title: found ? `Definition found: ${symbol} at ${file}:${line}` : `Not found: ${symbol}`,
      kind: 'read',
      rawOutput: result,
    }
  },
})

/** `find_references` tool: find all usages of a symbol. */
const findReferencesTool = defineTool({
  name: 'find_references',
  description:
    'Find all references/usages of a symbol across the entire repository. Returns each reference location (file, line, column) and kind (read, write, call, import).',
  parameters: {
    symbol: { type: 'string', required: true, description: 'Symbol name to find references for' },
    limit: { type: 'integer', description: 'Maximum number of references to return (default: 50)' },
    root: { type: 'string', description: 'Repository root path (defaults to workspace root)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: { type: 'string', required: true },
        references: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              file: { type: 'string', required: true },
              line: { type: 'integer', required: true },
              column: { type: 'integer', required: true },
              kind: { type: 'string', required: true, enum: ['read', 'write', 'call', 'import'] },
            },
          },
        },
        total: { type: 'integer', required: true },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args, exec) {
    const { crabccBin = 'crabcc', defaultRoot = process.cwd() } = getConfig()
    const root = args.root ?? defaultRoot
    const symbol = args.symbol
    const limit = args.limit ?? 50

    const raw = await runCrabcc(crabccBin, ['lookup', 'refs', symbol, '--json'], {
      root,
      signal: exec.signal,
    })

    if (!raw || typeof raw !== 'object' || !('refs' in raw)) {
      return { symbol, references: [], total: 0 }
    }

    const result = raw as CrabccRefsResult
    return {
      symbol: result.symbol,
      references: result.refs.slice(0, limit),
      total: result.refs.length,
    }
  },
  presentCall(args) {
    return {
      card: 'generic',
      title: `Find references: ${args.symbol}`,
      kind: 'read',
      rawInput: args,
    }
  },
  presentResult(_args, result) {
    const { symbol, total = 0, references = [] } = (result as unknown) as { symbol: string; total?: number; references?: unknown[] }
    return {
      card: 'generic',
      title: `Found ${total} reference${total === 1 ? '' : 's'} to ${symbol}`,
      kind: 'read',
      rawOutput: { symbol, references: Array.isArray(references) ? references.slice(0, 10) : [], total },
    }
  },
})

const CRABCC_SKILL_CONTENT = `# crabcc Symbol Index Tools

This skill provides access to the **crabcc** symbol index (https://github.com/8b-is/crabcc) — a fast, incremental code indexer with structured queries for AI agents.

## Available Tools

### \`code_search\`
Search for symbols by name pattern. Returns definitions with file locations and optional reference counts.

\`\`\`json
{
  "query": "ParseError",
  "includeRefs": true,
  "limit": 20
}
\`\`\`

Use when: exploring a codebase, finding relevant functions/types, discovering APIs.

### \`goto_definition\`
Jump to the exact definition of a symbol. Returns file, line, column, signature, and doc comment.

\`\`\`json
{
  "symbol": "ParseError"
}
\`\`\`

Use when: you need to read the implementation of a specific symbol.

### \`find_references\`
Find all usages of a symbol across the codebase. Returns each reference with location and kind (read/write/call/import).

\`\`\`json
{
  "symbol": "ParseError",
  "limit": 50
}
\`\`\`

Use when: understanding how a symbol is used, impact analysis, refactoring.

## Workflow Tips

1. **Start broad** → \`code_search\` with a pattern to discover symbols
2. **Drill down** → \`goto_definition\` to read the implementation
3. **Understand impact** → \`find_references\` to see all usages

## Index Management

The crabcc index is built automatically when you first query a repository. To refresh:
\`\`\`bash
crabcc index
\`\`\`

Or run \`crabcc go\` for a full bootstrap (index + graph + memory + Claude handoff).
`

/** Skill provider that contributes the crabcc skill to the registry. */
class CrabccSkillProvider implements SkillProvider {
  readonly name: string
  private readonly config: Config

  constructor(config: Config) {
    this.name = config.providerName ?? 'crabcc'
    this.config = config
  }

  async list(options: SkillLookupOptions): Promise<SkillCandidate[]> {
    // Only offer the skill if crabcc is available
    try {
      await runCrabcc(this.config.crabccBin ?? 'crabcc', ['--version'], {
        root: options.cwd ?? this.config.defaultRoot ?? process.cwd(),
        signal: options.signal,
      })
    } catch {
      return []
    }

    return [
      {
        name: 'crabcc',
        description: 'Fast symbol index tools for code navigation (code_search, goto_definition, find_references)',
        whenToUse: 'When you need to find, navigate, or understand code symbols in the workspace',
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
        provider: this.name,
        rank: 100,
        locator: { type: 'builtin' },
        resourceBase: { kind: 'opaque', description: 'crabcc CLI tool' },
        metadata: {},
      },
    ]
  }

  async get(candidate: SkillCandidate, _options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    if (candidate.name !== 'crabcc') return undefined

    // Verify crabcc is available
    try {
      await runCrabcc(this.config.crabccBin ?? 'crabcc', ['--version'], { root: this.config.defaultRoot ?? process.cwd() })
    } catch {
      return undefined
    }

    return {
      name: 'crabcc',
      description: 'Fast symbol index tools for code navigation (code_search, goto_definition, find_references)',
      whenToUse: 'When you need to find, navigate, or understand code symbols in the workspace',
      invocation: { modelInvocable: true, userInvocable: true },
      source: candidate.source,
      provider: this.name,
      content: CRABCC_SKILL_CONTENT,
      resourceBase: { kind: 'opaque', description: 'crabcc CLI tool' },
      metadata: {},
    }
  }
}

/** Register the crabcc tools and skill provider. */
export function apply(ctx: Context, config: Config = {}): void {
  const resolvedConfig: Config = Object.assign({}, DEFAULT_CONFIG, config)
  setConfig(resolvedConfig)

  // Register tools
  ctx.tools.register(codeSearchTool)
  ctx.tools.register(gotoDefinitionTool)
  ctx.tools.register(findReferencesTool)

  // Register skill provider
  const provider = new CrabccSkillProvider(resolvedConfig)
  ctx.skills.registerProvider(() => provider)
}
