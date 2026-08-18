/**
 * crabcc symbol index tools and skill provider.
 *
 * Wraps the crabcc CLI (https://github.com/8b-is/crabcc) as agent tools:
 * - code_search: fuzzy symbol lookup with optional reference expansion
 * - goto_definition: locate a symbol's definition
 * - find_references: find all references to a symbol
 *
 * Also registers a skill provider that contributes a "crabcc" skill
 * describing how to use these tools effectively.
 *
 * The CLI surface targeted here is crabcc 6.x: `lookup fuzzy`, `lookup sym`,
 * and `lookup refs` emit JSON on stdout by default and accept `--limit`
 * (fuzzy, refs) and `--root` (all lookup subcommands). `--version` prints
 * plain text and is used only for the availability probe.
 *
 * @module @deepseek-ai/dsh-skill-crabcc
 */

import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
} from '@deepseek-ai/dsh-skill'

export const name = 'skill-crabcc'
export const inject = ['skills']

/**
 * One cache lookup key: the exact query inputs a tool maps to a crabcc
 * invocation. All fields are non-null so the durable cache can key on them.
 */
export interface CrabccCacheKey {
  /** Repository root the lookup ran against. */
  root: string
  /** The crabcc lookup family. */
  kind: 'fuzzy' | 'sym' | 'refs'
  /** Fuzzy pattern or exact symbol name. */
  query: string
  /** Result cap; `0` when the caller did not set one. */
  limit: number
  /** `code_search` reference expansion flag. */
  includeRefs: boolean
}

/**
 * Durable result cache for crabcc lookups. A provider mounts an
 * implementation (e.g. the Postgres sidecar cache); when none is mounted the
 * tools run crabcc directly and cache misses cost nothing extra.
 */
export interface CrabccCache {
  /** Return the cached tool result for a key, or `undefined` on miss. */
  get(key: CrabccCacheKey): Promise<unknown>
  /** Store a tool result under a key. */
  set(key: CrabccCacheKey, result: unknown): Promise<void>
  /** Drop cached entries, optionally scoped to one root. */
  invalidate(root?: string): Promise<void>
}

/**
 * Resolve the optional durable cache for one tool execution. Cache failures
 * degrade to a direct crabcc run: the cache is an optimization, never a
 * correctness dependency.
 * @param exec - the executing tool call.
 * @returns the cache, or `undefined` when none is mounted.
 */
function cacheFor(exec: ToolExecution): CrabccCache | undefined {
  return exec.agent?.ctx.get('crabccCache') as CrabccCache | undefined
}

/**
 * Run a tool body through the optional durable cache: hit → return cached;
 * miss → compute, store (best-effort), return.
 * @param exec - the executing tool call.
 * @param key - the deterministic cache key.
 * @param compute - the direct crabcc execution.
 * @returns the tool result, from cache or fresh.
 */
async function throughCache<T>(
  exec: ToolExecution,
  key: CrabccCacheKey,
  compute: () => Promise<T>,
): Promise<T> {
  const cache = cacheFor(exec)
  if (cache !== undefined) {
    try {
      const hit = await cache.get(key)
      if (hit !== undefined) return hit as T
    } catch {
      // A cache read failure degrades to a direct crabcc run.
    }
  }
  const result = await compute()
  if (cache !== undefined) {
    try {
      await cache.set(key, result)
    } catch {
      // A cache write failure must not fail a successful lookup.
    }
  }
  return result
}

/** crabcc tool configuration. */
export interface Config {
  /** Path to crabcc binary. Defaults to `crabcc` in PATH. */
  crabccBin?: string
  /** Default repository root for queries. Defaults to process.cwd(). */
  defaultRoot?: string
  /** Skill provider name. */
  providerName?: string
}

export const Config: Schema<Config> = z.object({
  crabccBin: z.string().default('crabcc'),
  defaultRoot: z.string().default(process.cwd()),
  providerName: z.string().min(1).default('crabcc'),
})

/** Default configuration values. */
const DEFAULT_CONFIG: Config = {
  crabccBin: 'crabcc',
  defaultRoot: process.cwd(),
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

/** `crabcc lookup sym` hit (crabcc 6.x wire format). */
interface CrabccSymbol {
  name: string
  kind: string
  signature?: string
  parent?: string | null
  file: string
  line_start: number
  line_end: number
  visibility?: string | null
}

/** `crabcc lookup refs` hit (crabcc 6.x wire format). */
interface CrabccRef {
  file: string
  line: number
  col: number
  snippet?: string
}

/** `crabcc lookup fuzzy` hit (crabcc 6.x wire format). */
interface CrabccFuzzyHit {
  name: string
  kind: string
  file: string
  line: number
  parent?: string | null
  score: number
}

/** Options for {@link runCrabcc}. */
interface RunOptions {
  root?: string
  signal?: AbortSignal
  /** Parse stdout as text instead of JSON (for `--version`-style probes). */
  text?: boolean
}

/** Execute crabcc and return its stdout. */
export async function runCrabcc(
  bin: string,
  args: string[],
  options: RunOptions = {},
): Promise<unknown> {
  const { root = process.cwd(), signal, text = false } = options
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
      if (text) {
        resolve(stdout)
        return
      }
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch (err) {
        reject(new Error(`Failed to parse crabcc output: ${err instanceof Error ? err.message : String(err)}\nOutput: ${stdout}`))
      }
    })
  })
}

/** Whether the crabcc binary answers `--version` with exit 0. */
export async function isCrabccAvailable(bin: string, root: string): Promise<boolean> {
  try {
    await runCrabcc(bin, ['--version'], { root, text: true })
    return true
  } catch {
    return false
  }
}

/** `code_search` tool: fuzzy symbol lookup with optional reference counts. */
/* jscpd:ignore-start -- the three tools share the cache-through-run wrapper */
const codeSearchTool = defineTool({
  name: 'code_search',
  description:
    'Search for code symbols (functions, types, classes, methods) in the repository using the crabcc symbol index. Fuzzy name matching with optional reference counts. Use this instead of grep when looking for definitions.',
  parameters: {
    query: { type: 'string', required: true, description: 'Symbol name or fuzzy search pattern' },
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

    return throughCache(exec, { root, kind: 'fuzzy', query, limit, includeRefs }, async () => {
      const raw = await runCrabcc(crabccBin, ['lookup', 'fuzzy', query, '--limit', String(limit)], {
        root,
        signal: exec.signal,
      })

      if (!Array.isArray(raw)) {
        return { results: [], query, total: 0 }
      }

      const hits = raw as CrabccFuzzyHit[]
      let enriched = hits.slice(0, limit).map(hit => ({
        name: hit.name,
        kind: hit.kind,
        file: hit.file,
        line: hit.line,
      }))
      if (includeRefs) {
        enriched = await Promise.all(
          enriched.map(async (sym) => {
            try {
              const refs = await runCrabcc(
                crabccBin,
                ['lookup', 'refs', sym.name, '--limit', '0'],
                { root, signal: exec.signal },
              ) as CrabccRef[]
              return { ...sym, refCount: Array.isArray(refs) ? refs.length : 0 }
            } catch {
              return { ...sym, refCount: 0 }
            }
          }),
        )
      }

      return { results: enriched, query, total: enriched.length }
    })
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
        signature: { type: 'string' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args, exec) {
    const { crabccBin = 'crabcc', defaultRoot = process.cwd() } = getConfig()
    const root = args.root ?? defaultRoot
    const symbol = args.symbol

    return throughCache(exec, { root, kind: 'sym', query: symbol, limit: 0, includeRefs: false }, async () => {
      const raw = await runCrabcc(crabccBin, ['lookup', 'sym', symbol], {
        root,
        signal: exec.signal,
      })

      if (!Array.isArray(raw) || raw.length === 0) {
        return { found: false, symbol }
      }

      const sym = (raw as CrabccSymbol[])[0]
      if (!sym) {
        return { found: false, symbol }
      }

      return {
        found: true,
        symbol: sym.name,
        kind: sym.kind,
        file: sym.file,
        line: sym.line_start,
        signature: sym.signature ?? '',
      }
    })
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
    'Find all references/usages of a symbol across the entire repository. Returns each reference location (file, line, column) and the surrounding snippet.',
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
              column: { type: 'integer' },
              snippet: { type: 'string' },
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

    return throughCache(exec, { root, kind: 'refs', query: symbol, limit, includeRefs: false }, async () => {
      const raw = await runCrabcc(crabccBin, ['lookup', 'refs', symbol, '--limit', String(limit)], {
        root,
        signal: exec.signal,
      })

      if (!Array.isArray(raw)) {
        return { symbol, references: [], total: 0 }
      }

      const refs = raw as CrabccRef[]
      return {
        symbol,
        references: refs.slice(0, limit).map(ref => ({
          file: ref.file,
          line: ref.line,
          column: ref.col,
          ...(ref.snippet === undefined ? {} : { snippet: ref.snippet }),
        })),
        total: refs.length,
      }
    })
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

/* jscpd:ignore-end */

const CRABCC_SKILL_CONTENT = `# crabcc Symbol Index Tools

This skill provides access to the **crabcc** symbol index (https://github.com/8b-is/crabcc) — a fast, incremental code indexer with structured queries for AI agents.

## Available Tools

### \`code_search\`
Search for symbols by fuzzy name pattern. Returns definitions with file locations and optional reference counts.

\`\`\`json
{
  "query": "ParseError",
  "includeRefs": true,
  "limit": 20
}
\`\`\`

Use when: exploring a codebase, finding relevant functions/types, discovering APIs.

### \`goto_definition\`
Jump to the exact definition of a symbol. Returns file, line, and signature.

\`\`\`json
{
  "symbol": "ParseError"
}
\`\`\`

Use when: you need to read the implementation of a specific symbol.

### \`find_references\`
Find all usages of a symbol across the codebase. Returns each reference location and the surrounding snippet.

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
    const root = options.cwd ?? this.config.defaultRoot ?? process.cwd()
    if (!(await isCrabccAvailable(this.config.crabccBin ?? 'crabcc', root))) {
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
    const root = this.config.defaultRoot ?? process.cwd()
    if (!(await isCrabccAvailable(this.config.crabccBin ?? 'crabcc', root))) {
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

  // Tools are optional: the skill registry works without a tool runtime, and
  // mounting one later must not require this plugin to restart.
  const tools = ctx.get('tools')
  if (tools !== undefined) {
    tools.register(codeSearchTool)
    tools.register(gotoDefinitionTool)
    tools.register(findReferencesTool)
  }

  const provider = new CrabccSkillProvider(resolvedConfig)
  ctx.skills.registerProvider(() => provider)
}

export { codeSearchTool, gotoDefinitionTool, findReferencesTool }
