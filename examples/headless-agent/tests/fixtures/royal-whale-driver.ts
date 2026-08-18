#!/usr/bin/env node
/**
 * ROYAL-WHALE driver: exercises the real Postgres sidecar — the
 * session-persistence backend AND the crabcc durable cache — through one
 * headless composition. Assertions run through the mounted services (which
 * read/write the live Postgres bus), so no direct driver DB dependency.
 */

import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import { codeSearchTool, runCrabcc } from '@deepseek-ai/dsh-skill-crabcc'
import type { CrabccCache, CrabccCacheKey } from '@deepseek-ai/dsh-skill-crabcc'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deepStrictEqual } from 'node:assert'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('royal-whale driver requires a config path')

const FIXTURE_MAIN = `fn fizzbuzz(n: i64) -> String {
    if n % 15 == 0 { return "FizzBuzz".to_string(); }
    n.to_string()
}

fn main() {
    println!("{}", fizzbuzz(15));
}
`

function fail(message: string): never {
  console.error(`ROYAL-WHALE FAIL: ${message}`)
  process.exit(1)
}

function assert(condition: unknown, message: string): void {
  if (!condition) fail(message)
}

/** A fake tool execution whose agent ctx exposes the mounted cache service. */
function execWith(ctx: { get(name: string): unknown }): Parameters<typeof codeSearchTool.execute>[1] {
  return { signal: new AbortController().signal, agent: { ctx } } as Parameters<typeof codeSearchTool.execute>[1]
}

const ctx = await boot('royal-whale', resolveConfigPath(configPath, undefined))
try {
  // --- 1. Session persistence lands in the real Postgres bus (load reads PG) ---
  const persistence = ctx.sessionPersistence
  assert(
    persistence.constructor.name === 'PostgresSessionPersistence',
    `expected the postgres persistence backend, got ${persistence.constructor.name}`,
  )
  const id = SessionId(`royal-whale-${Date.now()}`)
  await persistence.create({ version: SESSION_FORMAT_VERSION, id, createdAt: Date.now() })
  await persistence.append(id, [
    { type: 'turn/start', seq: 0, time: Date.now(), data: { turn: 1 } },
    { type: 'turn/end', seq: 1, time: Date.now() + 1, data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  const loaded = await persistence.load(id)
  assert(loaded.events.length === 2, 'session load did not return the two committed events')

  // --- 2. crabcc lookup round-trips through the durable cache (hit survives re-index loss) ---
  const cache = ctx.get('crabccCache') as CrabccCache
  assert(cache !== undefined, 'crabccCache service is not mounted')
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'royal-whale-crabcc-'))
  await mkdir(join(fixtureRoot, 'src'), { recursive: true })
  await writeFile(join(fixtureRoot, 'src', 'main.rs'), FIXTURE_MAIN)
  await runCrabcc('crabcc', ['--root', fixtureRoot, 'index'], { root: fixtureRoot })

  const key: CrabccCacheKey = { root: fixtureRoot, kind: 'fuzzy', query: 'fizzbuzz', limit: 10, includeRefs: false }
  const first = await codeSearchTool.execute({ query: 'fizzbuzz', root: fixtureRoot, limit: 10 }, execWith(ctx))
  assert(
    await cache.get(key) !== undefined,
    'the first lookup should have written the result into the durable cache',
  )

  // Delete the indexed repo: a re-spawn would now fail, so a successful second
  // call PROVES it was served from the Postgres cache.
  await rm(fixtureRoot, { recursive: true, force: true })
  const second = await codeSearchTool.execute({ query: 'fizzbuzz', root: fixtureRoot, limit: 10 }, execWith(ctx))
  assert(second !== undefined, 'the second lookup returned no result')
  try {
    deepStrictEqual(second, first)
  } catch {
    fail('the second lookup must return the same result from the durable cache')
  }

  console.log('ROYAL-WHALE OK: postgres session persistence + crabcc durable cache wired against the live bus')
} finally {
  await ctx.fiber.dispose()
}
