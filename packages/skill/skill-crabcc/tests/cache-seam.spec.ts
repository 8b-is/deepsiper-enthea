import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import * as SkillCrabcc from '../src/index.ts'
import type { CrabccCache } from '../src/index.ts'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'node:child_process'

const mockSpawn = vi.mocked(spawn)

/** A fake crabcc child process that emits the given stdout then closes. */
function fakeChild(stdout: string, code = 0): EventEmitter {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  setTimeout(() => {
    child.stdout.emit('data', stdout)
    child.stderr.emit('data', '')
    child.emit('close', code)
  }, 0)
  return child
}

/** A minimal tool execution carrying an optional cache-backed agent ctx. */
function fakeExec(cache?: CrabccCache): ToolExecution {
  return {
    callId: 'c1',
    name: 'code_search',
    arguments: {},
    signal: new AbortController().signal,
    agent: {
      ctx: { get: (name: string): unknown => (name === 'crabccCache' ? cache : undefined) },
    },
  } as unknown as ToolExecution
}

const FAKE_SYMS = [{ name: 'parse', kind: 'function', file: 'src/main.rs', line: 3 }]

/** A stub cache exposing its spies so tests can assert on the seam. */
function stubCache(hit?: unknown): { cache: CrabccCache; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async () => hit)
  const set = vi.fn(async () => {})
  return {
    get,
    set,
    cache: { get, set, invalidate: vi.fn(async () => {}) },
  }
}

/** Execute a crabcc tool with a stub cache, treating its schema-typed result as unknown. */
async function runTool(tool: unknown, args: unknown, cache?: CrabccCache): Promise<unknown> {
  const withExecute = tool as { execute: (a: never, e: ToolExecution) => Promise<unknown> }
  return withExecute.execute(args as never, fakeExec(cache))
}

describe('skill-crabcc durable cache seam', () => {
  beforeEach(() => mockSpawn.mockReset())

  it('serves a cache hit without spawning crabcc', async () => {
    const cached = { results: [{ name: 'parse' }], query: 'parse', total: 1 }
    const { cache, get } = stubCache(cached)
    const result = await runTool(SkillCrabcc.codeSearchTool, { query: 'parse' }, cache)
    expect(result).toEqual(cached)
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledWith({
      root: process.cwd(),
      kind: 'fuzzy',
      query: 'parse',
      limit: 20,
      includeRefs: false,
    })
  })

  it('runs crabcc on a miss and stores the result', async () => {
    const { cache, set } = stubCache(undefined)
    mockSpawn.mockReturnValue(fakeChild(JSON.stringify(FAKE_SYMS)) as never)
    const result = await runTool(SkillCrabcc.codeSearchTool, { query: 'parse' }, cache)
    expect(result).toEqual({
      results: [{ name: 'parse', kind: 'function', file: 'src/main.rs', line: 3 }],
      query: 'parse',
      total: 1,
    })
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('degrades to a direct run when the cache fails or is absent', async () => {
    const failing = stubCache(undefined)
    failing.get.mockRejectedValue(new Error('bus down'))
    mockSpawn.mockReturnValue(fakeChild(JSON.stringify(FAKE_SYMS)) as never)
    const viaFailing = await runTool(SkillCrabcc.gotoDefinitionTool, { symbol: 'parse' }, failing.cache)
    expect((viaFailing as { found: boolean }).found).toBe(true)

    mockSpawn.mockReset()
    mockSpawn.mockReturnValue(fakeChild(JSON.stringify(FAKE_SYMS)) as never)
    const viaNone = await runTool(SkillCrabcc.findReferencesTool, { symbol: 'parse' })
    expect((viaNone as { references: unknown[] }).references).toHaveLength(1)
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('never fails a successful lookup on a cache write error', async () => {
    const writeFails = stubCache(undefined)
    writeFails.set.mockRejectedValue(new Error('bus down'))
    mockSpawn.mockReturnValue(fakeChild(JSON.stringify(FAKE_SYMS)) as never)
    const result = await runTool(SkillCrabcc.codeSearchTool, { query: 'parse' }, writeFails.cache)
    expect((result as { total: number }).total).toBe(1)
  })
})
