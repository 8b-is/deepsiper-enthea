/**
 * Local Postgres durable cache for crabcc symbol/reference lookups. Mounting
 * this plugin registers `ctx.crabccCache`; the skill-crabcc tools consult it
 * before spawning the CLI and store results after a miss. Entries expire by
 * TTL (lazy deletion on read). The cache is an optimization — a down bus
 * degrades skill-crabcc back to direct CLI runs.
 * @module @deepseek-ai/dsh-crabcc-cache-postgres
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Pool } from 'pg'
import type { CrabccCache, CrabccCacheKey } from '@deepseek-ai/dsh-skill-crabcc'
import { bootstrapCache, cacheKeyBindings, withCacheClient } from './schema.ts'

export { CACHE_SCHEMA_VERSION } from './schema.ts'

/** Plugin configuration. */
export interface Config {
  /**
   * Postgres connection DSN. Required unless a {@link createPool} override
   * supplies a pool. The cache lives in the same local bus database as the
   * session-persistence backend.
   */
  connectionString?: string
  /** Entry lifetime in seconds; stale entries are lazily deleted on read. */
  ttlSeconds?: number
}

/** The cache service registered as `ctx.crabccCache`. */
export class CrabccCachePostgres extends Service implements CrabccCache {
  static Config: z<Config> = z.object({
    connectionString: z.string(),
    ttlSeconds: z.natural().min(1).default(300),
  })

  /** Backend label for the plugin's dispose diagnostics. */
  override readonly name = 'crabcc-cache-postgres'

  private pool!: Pool
  private ready: Promise<void>
  private readonly ttlSeconds: number

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'crabccCache')
    this.ttlSeconds = config.ttlSeconds ?? 300
    this.ready = this.open()
    // A service that owns a pool closes it with the fiber; the bus is local
    // and single-process, so dispose must not leak the connection.
    ctx.effect(() => () => this.close(), 'crabcc-cache-postgres.close()')
  }

  /** Build the connection pool; tests subclass to inject pg-mem. */
  protected createPool(): Pool {
    if (this.config.connectionString === undefined) {
      throw new Error('crabcc-cache-postgres: connectionString or a createPool override is required')
    }
    return new Pool({ connectionString: this.config.connectionString })
  }

  private async open(): Promise<void> {
    const pool = this.createPool()
    this.pool = pool
    const client = await pool.connect()
    try {
      await bootstrapCache(client)
    } finally {
      client.release()
    }
  }

  /** Return the cached tool result for a key, deleting stale entries lazily. */
  async get(key: CrabccCacheKey): Promise<unknown> {
    await this.ready
    const cutoff = new Date(Date.now() - this.ttlSeconds * 1000).toISOString()
    return withCacheClient(this.pool, async (client) => {
      const [root, kind, query, maxResults, includeRefs] = cacheKeyBindings(key)
      const row = await client.query<{ result: unknown }>(
        `SELECT result FROM crabcc_cache
         WHERE root = $1 AND kind = $2 AND query = $3 AND max_results = $4 AND include_refs = $5
           AND stored_at > $6`,
        [root, kind, query, maxResults, includeRefs, cutoff],
      )
      if (row.rows[0] === undefined) return undefined
      await client.query(
        `UPDATE crabcc_cache SET hit_count = hit_count + 1
         WHERE root = $1 AND kind = $2 AND query = $3 AND max_results = $4 AND include_refs = $5`,
        [root, kind, query, maxResults, includeRefs],
      )
      return row.rows[0].result
    })
  }

  /** Store a tool result under a key, replacing any earlier entry. */
  async set(key: CrabccCacheKey, result: unknown): Promise<void> {
    await this.ready
    await withCacheClient(this.pool, async (client) => {
      const [root, kind, query, maxResults, includeRefs] = cacheKeyBindings(key)
      await client.query(
        `INSERT INTO crabcc_cache (root, kind, query, max_results, include_refs, result, stored_at, hit_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         ON CONFLICT (root, kind, query, max_results, include_refs)
         DO UPDATE SET result = EXCLUDED.result, stored_at = EXCLUDED.stored_at`,
        [root, kind, query, maxResults, includeRefs, JSON.stringify(result), new Date().toISOString()],
      )
    })
  }

  /** Drop cached entries, optionally scoped to one root. */
  async invalidate(root?: string): Promise<void> {
    await this.ready
    await withCacheClient(this.pool, async (client) => {
      if (root === undefined) {
        await client.query('DELETE FROM crabcc_cache')
      } else {
        await client.query('DELETE FROM crabcc_cache WHERE root = $1', [root])
      }
    })
  }

  /** End the pool. */
  async close(): Promise<void> {
    await this.ready
    await this.pool.end()
  }
}

export default CrabccCachePostgres
