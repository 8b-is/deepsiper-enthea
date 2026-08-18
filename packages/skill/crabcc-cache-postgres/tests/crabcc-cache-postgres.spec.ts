import { newDb } from 'pg-mem'
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import CrabccCachePostgres from '@deepseek-ai/dsh-crabcc-cache-postgres'
import type { CrabccCacheKey } from '@deepseek-ai/dsh-skill-crabcc'

type MemDb = ReturnType<typeof newDb>

function poolOver(db: MemDb): Pool {
  const { Client } = db.adapters.createPg() as { Client: typeof import('pg').Client }
  class MemClient extends Client {}
  const pool = new Pool()
  ;(pool as unknown as { Client: typeof Client }).Client = MemClient
  return pool
}

function memBackendClass(db: MemDb): typeof CrabccCachePostgres {
  return class extends CrabccCachePostgres {
    protected override createPool(): Pool {
      return poolOver(db)
    }
  }
}

async function cache(ttlSeconds = 300): Promise<{ ctx: Context; key: CrabccCacheKey }> {
  const ctx = new Context()
  await ctx.plugin(memBackendClass(newDb()), { ttlSeconds })
  return { ctx, key: { root: '/repo', kind: 'sym', query: 'parse', limit: 0, includeRefs: false } }
}

const RESULT = { found: true, symbol: 'parse', file: 'src/main.rs', line: 3, signature: 'fn parse()' }

describe('CrabccCachePostgres (pg-mem)', () => {
  it('registers the cache service and round-trips a result', async () => {
    const { ctx, key } = await cache()
    const service = ctx.get('crabccCache') as CrabccCachePostgres
    expect(service).toBeInstanceOf(CrabccCachePostgres)
    expect(await service.get(key)).toBeUndefined()
    await service.set(key, RESULT)
    expect(await service.get(key)).toEqual(RESULT)
  })

  it('separates keys by every field', async () => {
    const { ctx } = await cache()
    const service = ctx.get('crabccCache') as CrabccCachePostgres
    const base = { root: '/repo', kind: 'fuzzy' as const, query: 'parse', limit: 0, includeRefs: false }
    await service.set(base, { query: 'parse', results: [], total: 0 })
    for (const variant of [
      { ...base, query: 'other' },
      { ...base, limit: 10 },
      { ...base, includeRefs: true },
      { ...base, root: '/other' },
      { ...base, kind: 'refs' as const },
    ]) {
      expect(await service.get(variant)).toBeUndefined()
    }
  })

  it('lazily expires entries past the TTL', async () => {
    const { ctx, key } = await cache(1)
    const service = ctx.get('crabccCache') as CrabccCachePostgres
    await service.set(key, RESULT)
    expect(await service.get(key)).toEqual(RESULT)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(await service.get(key)).toBeUndefined()
  })

  it('invalidates by root or globally', async () => {
    const { ctx } = await cache()
    const service = ctx.get('crabccCache') as CrabccCachePostgres
    const a = { root: '/a', kind: 'sym' as const, query: 'x', limit: 0, includeRefs: false }
    const b = { root: '/b', kind: 'sym' as const, query: 'x', limit: 0, includeRefs: false }
    await service.set(a, RESULT)
    await service.set(b, RESULT)
    await service.invalidate('/a')
    expect(await service.get(a)).toBeUndefined()
    expect(await service.get(b)).toEqual(RESULT)
    await service.invalidate()
    expect(await service.get(b)).toBeUndefined()
  })

  it('rejects a missing connection string when no pool override exists', async () => {
    const ctx = new Context()
    const service = new CrabccCachePostgres(ctx, {})
    await expect((service as unknown as { ready: Promise<void> }).ready).rejects.toThrow(/connectionString/)
  })

  it('rejects a bogus connection string at open (real Pool path)', async () => {
    const ctx = new Context()
    const service = new CrabccCachePostgres(ctx, { connectionString: 'postgres://127.0.0.1:1/nope' })
    await expect((service as unknown as { ready: Promise<void> }).ready).rejects.toBeTruthy()
  })

  it('re-bootstraps idempotently over an existing table', async () => {
    const db = newDb()
    const first = new Context()
    await first.plugin(memBackendClass(db), {})
    // Wait for the first mount's open()/bootstrap to commit before the second.
    await (first.get('crabccCache') as CrabccCachePostgres)
      .get({ root: '/r', kind: 'refs', query: 'parse', limit: 0, includeRefs: false })
    const second = new Context()
    await second.plugin(memBackendClass(db), {})
    const service = second.get('crabccCache') as CrabccCachePostgres
    await service.set({ root: '/r', kind: 'refs', query: 'parse', limit: 0, includeRefs: false }, RESULT)
    expect(await service.get({ root: '/r', kind: 'refs', query: 'parse', limit: 0, includeRefs: false }))
      .toEqual(RESULT)
  })

  it('closes the pool', async () => {
    const pool = poolOver(newDb())
    const ctx = new Context()
    class FixedBackend extends CrabccCachePostgres {
      protected override createPool(): Pool {
        return pool
      }
    }
    const fiber = await ctx.plugin(FixedBackend, {})
    await fiber.dispose()
    await expect(pool.query('SELECT 1')).rejects.toThrow()
  })
})
