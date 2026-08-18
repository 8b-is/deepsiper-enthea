import { newDb } from 'pg-mem'
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, type SessionEvent, type SurfaceEventType } from '@deepseek-ai/dsh-session'
import PostgresSessionPersistence, { createPgNotifier } from '@deepseek-ai/dsh-session-persistence-postgres'
import {
  BUS_NOTIFY_CHANNEL,
  bootstrapBus,
  notifyPointer,
  rowToEvent,
  rowToMeta,
  scanRows,
  type EventRow,
  type NotifyPointer,
} from '../src/schema.ts'
import { runPersistenceContract, meta, oneTurnLog } from '../../session-persistence/tests/contract.ts'
import { runCoordinatorContract, type CoordinatorFixture } from '../../session-persistence/tests/coordinator-contract.ts'

/** The in-memory database handle returned by {@link newDb}. */
type MemDb = ReturnType<typeof newDb>

/** The concrete backend type behind the abstract `ctx.sessionPersistence`. */
type Backend = PostgresSessionPersistence

/** Build a fresh pg-mem pool whose client factory is the in-memory Postgres emulator. */
function memPool(): Pool {
  return poolOver(newDb())
}

/** Build a pg-mem pool bound to ONE shared in-memory database. */
function poolOver(db: MemDb): Pool {
  const { Client } = db.adapters.createPg() as { Client: typeof import('pg').Client }
  class MemClient extends Client {}
  const pool = new Pool()
  ;(pool as unknown as { Client: typeof Client }).Client = MemClient
  return pool
}

/** A backend class whose pool is built over a shared pg-mem database per mount. */
function memBackendClass(db: MemDb): typeof PostgresSessionPersistence {
  return class extends PostgresSessionPersistence {
    protected override createPool(): Pool {
      return poolOver(db)
    }
  }
}

/** Narrow the abstract service to the concrete backend for hook-level calls. */
function backendOf(ctx: Context): Backend {
  return ctx.sessionPersistence as unknown as Backend
}

/** A fresh context with the session store and a pg-mem-backed backend. */
async function backend(notify?: (pointer: NotifyPointer) => Promise<void>, db: MemDb = newDb()) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const fiber = await ctx.plugin(memBackendClass(db), notify === undefined ? {} : { notify })
  return { ctx, fiber, pool: poolOver(db) }
}

// The same backend-agnostic semantics contracts as JSONL/SQLite, run over pg-mem.
runPersistenceContract('postgres', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const fiber = await ctx.plugin(memBackendClass(newDb()), { notify: async () => {} })
  return {
    persistence: ctx.sessionPersistence,
    dispose: async () => { await fiber.dispose() },
  }
})

// Shared-storage coordination contract: each mount opens a FRESH pool over ONE
// shared pg-mem database (a backend dispose ends only its own pool), and
// corruptTail injects a seq-gap row past the committed region (Postgres
// transactions are atomic, so a gap is the only physically possible torn tail).
runCoordinatorContract('postgres', async (): Promise<CoordinatorFixture> => {
  const db = newDb()
  const admin = poolOver(db)
  return {
    mount: async ctx => ctx.plugin(memBackendClass(db), { notify: async () => {} }),
    corruptTail: async (id) => {
      const next = (await admin.query<{ n: number }>(
        'SELECT COALESCE(MAX(seq), -1) + 1 AS n FROM dsh_events WHERE session_id = $1',
        [id],
      )).rows[0]!.n
      await admin.query(
        'INSERT INTO dsh_events (session_id, seq, type, time, data) VALUES ($1, $2, $3, $4, $5)',
        [id, next + 1, 'assistant/chunk', 99, JSON.stringify({})],
      )
    },
    cleanup: async () => { await admin.end().catch(() => {}) },
  }
})

/** Build EventRows from SessionEvents for the scanRows unit tests. */
function rows(events: SessionEvent[]): EventRow[] {
  return events.map((event) => {
    const se = event as SessionEvent<SurfaceEventType>
    return {
      seq: event.seq, type: event.type, time: event.time, data: event.data,
      source_event_seqs: se.sourceEventSeqs !== undefined ? se.sourceEventSeqs : null,
      surface_op: se.surfaceOp !== undefined ? se.surfaceOp : null,
      ignorable: event.ignorable === true ? true : null,
    }
  })
}

describe('scanRows', () => {
  it('preserves the full log when it ends exactly on a turn/end', () => {
    const { preserved, tornFrom } = scanRows(rows(oneTurnLog()))
    expect(preserved).toEqual(oneTurnLog())
    expect(tornFrom).toBeUndefined()
  })

  it('preserves an interrupted open turn after the last committed turn/end', () => {
    const withOpenTurn: SessionEvent[] = [
      ...oneTurnLog(),
      { type: 'turn/start', seq: 6, time: 7, data: { turn: 2 } },
      { type: 'step/start', seq: 7, time: 8, data: { turn: 2, step: 1 } },
    ]
    const { preserved, tornFrom } = scanRows(rows(withOpenTurn))
    expect(preserved.map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(tornFrom).toBeUndefined()
  })

  it('flags a torn tail at a seq gap after the last turn/end', () => {
    const gapped = rows([...oneTurnLog(), { type: 'turn/start', seq: 7, time: 8, data: { turn: 2 } }])
    const { preserved, tornFrom } = scanRows(gapped)
    expect(preserved.map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5])
    expect(tornFrom).toBe(6)
  })

  it('rejects a seq gap inside the committed region', () => {
    const gapped = rows([
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 2, time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
    ])
    expect(() => scanRows(gapped)).toThrow(/seq gap in committed region/)
  })

  it('scans a suffix read from a base seq', () => {
    const log = oneTurnLog()
    const { preserved } = scanRows(rows(log.slice(4)), 4)
    expect(preserved.map(event => event.seq)).toEqual([4, 5])
  })
})

describe('rowToMeta', () => {
  it('reconstructs a full header, coercing bigint-as-string columns', () => {
    expect(rowToMeta({
      session_id: 's1',
      format_version: '0',
      created_at: '1000',
      cwd: '/w',
      parent_session: 'p1',
      seed_length: '2',
      origin: 'subagent',
      delegation_depth: '1',
      agent_preset: 'headless',
      incarnation: 'inc',
      revision: '3',
    })).toEqual({
      ...meta('s1', '/w'),
      parentSession: SessionId('p1'),
      seedLength: 2,
      origin: 'subagent',
      delegationDepth: 1,
      agentPreset: 'headless',
    })
    expect(rowToMeta({
      session_id: 's1',
      format_version: 0,
      created_at: 1000,
      cwd: null,
      parent_session: null,
      seed_length: null,
      origin: null,
      delegation_depth: null,
      agent_preset: null,
      incarnation: 'inc',
      revision: 0,
    })).toEqual(meta('s1'))
  })

  it('rejects an invalid createdAt', () => {
    expect(() => rowToMeta({
      session_id: 's1', format_version: 0, created_at: 'not-a-number', cwd: null,
      parent_session: null, seed_length: null, origin: null, delegation_depth: null,
      agent_preset: null, incarnation: 'inc', revision: 0,
    })).toThrow(/createdAt must be a safe integer/)
  })
})

describe('rowToEvent', () => {
  it('reconstructs an event with surface fields and the ignorable marker', () => {
    const event = rowToEvent({
      seq: '1', type: 'user/message', time: '2', data: { content: [] },
      source_event_seqs: [0], surface_op: { type: 'append' }, ignorable: true,
    })
    expect(event.seq).toBe(1)
    expect(event.time).toBe(2)
    expect((event as SessionEvent<SurfaceEventType>).sourceEventSeqs).toEqual([0])
    expect((event as SessionEvent<SurfaceEventType>).surfaceOp).toEqual({ type: 'append' })
    expect(event.ignorable).toBe(true)
  })

  it('omits absent surface fields and rejects a bad seq/time', () => {
    const event = rowToEvent({ seq: 0, type: 'turn/start', time: 1, data: { turn: 1 }, source_event_seqs: null, surface_op: null, ignorable: null })
    expect((event as SessionEvent<SurfaceEventType>).sourceEventSeqs).toBeUndefined()
    expect((event as SessionEvent<SurfaceEventType>).surfaceOp).toBeUndefined()
    expect(event.ignorable).toBeUndefined()
    expect(() => rowToEvent({ seq: 'x', type: 'turn/start', time: 1, data: {}, source_event_seqs: null, surface_op: null, ignorable: null }))
      .toThrow(/seq must be a safe integer/)
  })
})

describe('notifyPointer', () => {
  it('builds the committed-batch range from the event seqs', () => {
    const log = oneTurnLog()
    expect(notifyPointer(meta('s1'), log)).toEqual({ sid: 's1', lo: 0, hi: 6 })
    expect(notifyPointer(meta('s1'), [])).toEqual({ sid: 's1', lo: 0, hi: 0 })
  })
})

describe('createPgNotifier', () => {
  it('publishes the pointer JSON on the bus channel', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = []
    const fakePool = { query: async (text: string, values: unknown[]) => { calls.push({ text, values }) } }
    const notifier = createPgNotifier(fakePool as unknown as Pool)
    const pointer: NotifyPointer = { sid: 's1', lo: 0, hi: 6 }
    await notifier(pointer)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.values[0]).toBe(BUS_NOTIFY_CHANNEL)
    expect(calls[0]!.values[1]).toBe(JSON.stringify(pointer))
  })
})

describe('bootstrapBus', () => {
  async function bootedClient(pool: Pool) {
    const client = await pool.connect()
    await bootstrapBus(client, 'test')
    return client
  }

  it('rejects a schema version this build does not read', async () => {
    const pool = memPool()
    const client = await bootedClient(pool)
    await client.query('UPDATE dsh_bus_state SET schema_version = 99 WHERE singleton')
    await expect(bootstrapBus(client, 'test')).rejects.toThrow(/schema version 99/)
    client.release()
  })

  it('rejects a bus with an empty store identity', async () => {
    const pool = memPool()
    const client = await bootedClient(pool)
    await client.query("UPDATE dsh_bus_state SET store_id = '' WHERE singleton")
    await expect(bootstrapBus(client, 'test')).rejects.toThrow(/no valid store identity/)
    client.release()
  })
})

describe('PostgresSessionPersistence hooks (pg-mem)', () => {
  it('materializes lazily, appends events atomically, bumps revision, and notifies the batch', async () => {
    const recorded: NotifyPointer[] = []
    const { ctx } = await backend(async (pointer) => { recorded.push(pointer) })
    const persistence = backendOf(ctx)
    const m = meta('lazy')
    await persistence.create(m)
    await persistence.append(m.id, oneTurnLog())

    const stored = await persistence.loadStored(SessionId('lazy'))
    expect(stored?.meta.id).toBe('lazy')
    expect(stored?.events.map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5])
    expect(stored?.tornMarker).toBeUndefined()
    expect(recorded).toEqual([{ sid: 'lazy', lo: 0, hi: 6 }])
    const revision = await persistence.readStoredRevision(SessionId('lazy'))
    expect(revision?.startsWith('pg:store:')).toBe(true)
  })

  it('rejects a duplicate seq atomically, leaving the log untouched', async () => {
    const { ctx } = await backend()
    const persistence = backendOf(ctx)
    const m = meta('dup')
    await persistence.appendBatch(m, oneTurnLog(), false)
    await expect(persistence.appendBatch(m, [{ ...oneTurnLog()[0]! }], true)).rejects.toThrow()
    const stored = await persistence.loadStored(m.id)
    expect(stored?.events).toHaveLength(6)
  })

  it('reads a seek suffix from a seq watermark', async () => {
    const { ctx } = await backend()
    const persistence = backendOf(ctx)
    const m = meta('seek')
    await persistence.appendBatch(m, oneTurnLog(), false)
    const suffix = await persistence.loadStoredFrom(m.id, 4)
    expect(suffix?.events.map(event => event.seq)).toEqual([4, 5])
  })

  it('repairs a torn tail and appends closers, bumping the revision once', async () => {
    const { ctx, pool } = await backend()
    const persistence = backendOf(ctx)
    const m = meta('repair')
    await persistence.appendBatch(m, oneTurnLog(), false)
    // Inject a seq-gap torn row past the committed region (same shared db).
    const next = (await persistence.loadStored(m.id))!.events.length
    await pool.query(
      'INSERT INTO dsh_events (session_id, seq, type, time, data) VALUES ($1, $2, $3, $4, $5)',
      [m.id, next + 1, 'assistant/chunk', 99, JSON.stringify({})],
    )
    const before = await persistence.loadStored(m.id)
    expect(before?.tornMarker).toBe(next)

    const closers = [
      { type: 'step/end', seq: next, time: 7, data: { turn: 2, step: 1 } },
      { type: 'turn/end', seq: next + 1, time: 8, data: { turn: 2, reason: { kind: 'interrupted' } } },
    ] as unknown as SessionEvent[]
    await persistence.commitRepair(m, next, closers)
    const after = await persistence.loadStored(m.id)
    expect(after?.tornMarker).toBeUndefined()
    expect(after?.events.map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('lists materialized sessions and snapshots', async () => {
    const { ctx } = await backend()
    const persistence = backendOf(ctx)
    await persistence.appendBatch(meta('a'), oneTurnLog(), false)
    await persistence.appendBatch(meta('b'), [oneTurnLog()[0]!], false)
    const signal = new AbortController().signal
    const headers = await persistence.list(signal)
    expect(headers.map(header => header.id)).toEqual(['a', 'b'])
    const snapshots = await persistence.listSnapshots(signal)
    expect(snapshots.map(snapshot => snapshot.header.id)).toEqual(['a', 'b'])
    expect(snapshots[0]!.revision.startsWith('pg:store:')).toBe(true)
  })

  it('returns undefined for an absent session on both read hooks', async () => {
    const { ctx } = await backend()
    const persistence = backendOf(ctx)
    expect(await persistence.loadStored(SessionId('absent'))).toBeUndefined()
    expect(await persistence.loadStoredFrom(SessionId('absent'), 0)).toBeUndefined()
    expect(await persistence.readStoredRevision(SessionId('absent'))).toBeUndefined()
  })

  it('prepares a persisted session through the coordinator', async () => {
    const { ctx } = await backend()
    const persistence = backendOf(ctx)
    const m = meta('prep')
    await persistence.create(m)
    await persistence.append(m.id, oneTurnLog())
    const preparation = await persistence.prepare(m.id)
    try {
      const seqs = preparation.session.events.map(event => event.seq)
      expect(seqs.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5])
      expect(preparation.session.events.at(-1)?.type).toBe('session/end-seed')
    } finally {
      preparation[Symbol.dispose]()
    }
  })

  it('swallows a failing notifier during append and commitRepair (lossable)', async () => {
    const { ctx } = await backend(async () => { throw new Error('notify down') })
    const persistence = backendOf(ctx)
    const m = meta('swallow')
    await persistence.appendBatch(m, oneTurnLog(), false)
    const closers = [
      { type: 'turn/end', seq: 6, time: 7, data: { turn: 2, reason: { kind: 'interrupted' } } },
    ] as unknown as SessionEvent[]
    await expect(persistence.commitRepair(m, undefined, closers)).resolves.toBeUndefined()
    // A no-op repair (neither a torn marker nor closers) is tolerated without a revision bump.
    await expect(persistence.commitRepair(m, undefined, [])).resolves.toBeUndefined()
  })

  it('rejects a bogus connection string at open (real Pool path)', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const service = new PostgresSessionPersistence(ctx, { connectionString: 'postgres://127.0.0.1:1/nope' })
    await expect((service as unknown as { ready: Promise<void> }).ready).rejects.toBeTruthy()
  })

  it('succeeds without an injected notifier when pg_notify is unsupported (lossable)', async () => {
    const { ctx } = await backend()
    const persistence = backendOf(ctx)
    await persistence.appendBatch(meta('n'), oneTurnLog(), false)
    const stored = await persistence.loadStored(SessionId('n'))
    expect(stored?.events).toHaveLength(6)
  })

  it('rejects a missing connection string when no pool override exists', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const service = new PostgresSessionPersistence(ctx, {})
    await expect((service as unknown as { ready: Promise<void> }).ready).rejects.toThrow(/connectionString/)
  })

  it('closes the pool', async () => {
    const pool = memPool()
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    class FixedBackend extends PostgresSessionPersistence {
      protected override createPool(): Pool {
        return pool
      }
    }
    const fiber = await ctx.plugin(FixedBackend, { notify: async () => {} })
    await fiber.dispose()
    await expect(pool.query('SELECT 1')).rejects.toThrow()
  })
})
