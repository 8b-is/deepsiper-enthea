/**
 * Schema + helpers for the Postgres crabcc durable cache: one `crabcc_cache`
 * row per deterministic lookup key, JSONB result payload, TTL-based lazy
 * expiry. Reuses the same local Postgres bus as the session-persistence
 * backend; the DDL bootstrap is gated on existence for pg-mem parity.
 *
 * @module dsh-crabcc-cache-postgres/schema
 */

import type { Pool, PoolClient } from 'pg'
import type { CrabccCacheKey } from '@deepseek-ai/dsh-skill-crabcc'

/** The cache schema version. Bumped on a breaking table-layout change. */
export const CACHE_SCHEMA_VERSION = 1

/** One `crabcc_cache` row. */
export interface CrabccCacheRow {
  root: string
  kind: 'fuzzy' | 'sym' | 'refs'
  query: string
  max_results: number
  include_refs: boolean
  result: unknown
  stored_at: string
  hit_count: number | string
}

/** All PK columns are NOT NULL: a caller's absent limit maps to 0. */
export function cacheKeyBindings(key: CrabccCacheKey): [string, string, string, number, boolean] {
  return [key.root, key.kind, key.query, key.limit, key.includeRefs]
}

/**
 * Bootstrap the cache table idempotently, gated on a probe query rather than
 * `information_schema`: real Postgres tolerates re-running `CREATE TABLE IF
 * NOT EXISTS`, but the pg-mem emulator cannot re-parse it against an existing
 * table. The probe runs BEFORE the transaction — a failed statement inside a
 * Postgres transaction aborts it, so the missing-table probe must not poison
 * the DDL transaction.
 * @param client - a dedicated connection.
 */
export async function bootstrapCache(client: PoolClient): Promise<void> {
  let exists = true
  try {
    await client.query('SELECT 1 FROM crabcc_cache LIMIT 0')
  } catch {
    // The relation does not exist yet (or is unreadable) — run the DDL.
    exists = false
  }
  await client.query('BEGIN')
  try {
    if (!exists) {
      await client.query(`
      CREATE TABLE IF NOT EXISTS crabcc_cache (
        root         text NOT NULL,
        kind         text NOT NULL,
        query        text NOT NULL,
        max_results  integer NOT NULL,
        include_refs boolean NOT NULL,
        result       jsonb NOT NULL,
        stored_at    timestamptz NOT NULL,
        hit_count    bigint NOT NULL,
        PRIMARY KEY (root, kind, query, max_results, include_refs)
      );
      CREATE INDEX IF NOT EXISTS crabcc_cache_root_idx ON crabcc_cache (root);
    `)
    }
    await client.query('COMMIT')
  } catch (error: unknown) {
    /* v8 ignore start -- a failed ROLLBACK would only mask the original bootstrap failure */
    await client.query('ROLLBACK').catch(() => {})
    throw error
    /* v8 ignore stop */
  }
}

/** Acquire one dedicated client and release it on completion. */
export async function withCacheClient<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await run(client)
  } finally {
    client.release()
  }
}
