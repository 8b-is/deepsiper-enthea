/**
 * Schema + load-time helpers for the Postgres session-persistence backend
 * (the local event-bus sidecar): the DDL (a store-identity row, `dsh_sessions`
 * metadata, and a 1:1 `dsh_events` row per `SessionEvent`), the bootstrap
 * step, the notification payload builder, and the last-`turn/end` cut that
 * gives the Postgres backend the SAME crash-tail-on-load semantics as the
 * JSONL and SQLite backends.
 *
 * @module dsh-session-persistence-postgres/schema
 */

import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { SessionEvent, SessionId, SessionHeader, SurfaceOp } from '@deepseek-ai/dsh-session'

/**
 * The bus schema version. Bumped only on a breaking change to the table
 * layout; orthogonal to a session's own `version` (which versions the EVENT
 * vocabulary, stored per session in the `dsh_sessions` row).
 */
export const BUS_SCHEMA_VERSION = 1

/** Postgres `pg_notify` channel carrying committed-batch pointers. */
export const BUS_NOTIFY_CHANNEL = 'dsh_session_events'

/** One committed batch's pointer payload: the session and the seq range. */
export interface NotifyPointer {
  sid: string
  /** First seq of the committed batch. */
  lo: number
  /** One past the last seq of the committed batch. */
  hi: number
}

/**
 * Build the pointer payload published on {@link BUS_NOTIFY_CHANNEL} after a
 * committed batch. NOTIFY payloads are lossable and capped at 8 KB, so the
 * payload carries only the range; consumers reconcile against the table.
 * @param meta - the session the batch belongs to.
 * @param events - the committed contiguous batch, in seq order.
 * @returns the pointer payload.
 */
export function notifyPointer(meta: SessionHeader, events: readonly SessionEvent[]): NotifyPointer {
  const lo = events[0]?.seq ?? 0
  return { sid: meta.id, lo, hi: lo + events.length }
}

/** A row of the `dsh_sessions` table (bigint columns arrive as string on real pg). */
export interface SessionRow {
  session_id: string
  format_version: number | string
  created_at: number | string
  cwd: string | null
  parent_session: string | null
  seed_length: number | string | null
  origin: 'subagent' | null
  delegation_depth: number | string | null
  agent_preset: string | null
  incarnation: string
  revision: number | string
}

/** An `dsh_events` row: one `SessionEvent` mapped 1:1 (`data` is JSONB). */
export interface EventRow {
  seq: number | string
  type: string
  time: number | string
  data: unknown
  /** Parsed `number[]` — the event's sourceEventSeqs, or null. */
  source_event_seqs: unknown
  /** Parsed `SurfaceOp` — how the event entered the surface, or null. */
  surface_op: unknown
  /** `true` iff the event carries the envelope's `ignorable: true` marker. */
  ignorable: boolean | null
}

/** Coerce a bigint column (string on real pg, number under pg-mem) to a number. */
function toNumber(value: number | string | null, column: string): number | null {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`stored ${column} must be a safe integer, got ${String(value)}`)
  }
  return parsed
}

/**
 * Reconstruct the {@link SessionHeader} from a `dsh_sessions` row.
 * @param row - the `dsh_sessions` table row.
 * @returns the header, `NULL` columns mapped to omitted optional fields.
 */
export function rowToMeta(row: SessionRow): SessionHeader {
  const createdAt = toNumber(row.created_at, 'createdAt')
  /* v8 ignore next 2 -- created_at is a NOT NULL column; null means a broken store */
  if (createdAt === null || createdAt < 0) {
    throw new Error('stored session createdAt must be a non-negative safe integer')
  }
  return {
    version: toNumber(row.format_version, 'formatVersion') as number,
    id: row.session_id as SessionId,
    createdAt,
    ...row.cwd !== null ? { cwd: row.cwd } : {},
    ...row.parent_session !== null ? { parentSession: row.parent_session as SessionId } : {},
    ...toNumber(row.seed_length, 'seedLength') !== null
      ? { seedLength: toNumber(row.seed_length, 'seedLength') as number }
      : {},
    ...row.origin !== null ? { origin: row.origin } : {},
    ...toNumber(row.delegation_depth, 'delegationDepth') !== null
      ? { delegationDepth: toNumber(row.delegation_depth, 'delegationDepth') as number }
      : {},
    ...row.agent_preset !== null ? { agentPreset: row.agent_preset } : {},
  }
}

/**
 * Reconstruct a {@link SessionEvent} from an `dsh_events` row. `data` and the
 * surface columns are JSONB — pg returns them already parsed, so no JSON
 * parsing is needed and corruption is impossible at the DB level (unlike a
 * file backend).
 * @param row - the `dsh_events` table row.
 * @returns the reconstructed event.
 */
export function rowToEvent(row: EventRow): SessionEvent {
  const seq = toNumber(row.seq, 'seq')
  const time = toNumber(row.time, 'time')
  /* v8 ignore next 2 -- seq/time are NOT NULL columns; null means a broken store */
  if (seq === null || time === null) {
    throw new Error('stored event seq/time must be non-null safe integers')
  }
  const surfaceFields = {
    ...row.source_event_seqs !== null ? { sourceEventSeqs: row.source_event_seqs as number[] } : {},
    ...row.surface_op !== null ? { surfaceOp: row.surface_op as SurfaceOp } : {},
  }
  const ignorableField = row.ignorable === true ? { ignorable: true as const } : {}
  return {
    type: row.type as SessionEvent['type'],
    seq,
    time,
    data: row.data as SessionEvent['data'],
    ...surfaceFields,
    ...ignorableField,
  } as SessionEvent
}

/**
 * Find the preserved prefix of ordered event rows. Fully written rows in an
 * interrupted final turn remain in the prefix. A seq gap after the last
 * `turn/end` marks a tolerated torn tail; the same gap in the committed
 * region rejects. Postgres transactions are atomic, so a gap is impossible
 * from a committed write — this is the defensive parity with the file backend
 * that the coordinator's repair contract expects.
 *
 * @param rows - one session's event rows, ordered by seq ascending.
 * @param base - the seq the first row is expected to carry; `0` for a whole
 *   log, the requested `fromSeq` for a suffix read.
 * @returns the preserved event prefix, plus `tornFrom` — the seq the physical
 *   delete starts at — when a torn tail exists.
 */
export function scanRows(rows: readonly EventRow[], base = 0): { preserved: SessionEvent[]; tornFrom?: number } {
  const events = rows.map(rowToEvent)
  // The last index that is a valid `turn/end` — holes through a closed turn
  // are always committed corruption.
  let lastTurnEnd = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.type === 'turn/end') { lastTurnEnd = i; break }
  }

  const preserved: SessionEvent[] = []
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    /* v8 ignore next 2 -- events is dense (mapped from rows), so indexing never misses */
    if (event === undefined) break
    if (event.seq !== base + i) {
      if (i <= lastTurnEnd) {
        throw new Error(`corrupt session log: seq gap in committed region (expected ${base + i}, got ${event.seq})`)
      }
      break // gap after the last turn/end — torn tail, stop
    }
    preserved.push(event)
  }

  return preserved.length < events.length ? { preserved, tornFrom: base + preserved.length } : { preserved }
}

/**
 * Bootstrap the bus schema idempotently under one transaction and validate
 * ownership, mirroring the SQLite open step. An empty database is initialized
 * at {@link BUS_SCHEMA_VERSION}; every other version rejects rather than being
 * migrated in place.
 * @param client - a dedicated connection holding the bootstrap transaction.
 * @param label - human-readable connection identity for diagnostics.
 * @returns the store identity and the store-qualified revision prefix.
 */
export async function bootstrapBus(client: PoolClient, label: string): Promise<{ storeId: string; storeIdentity: string }> {
  await client.query('BEGIN')
  try {
    // Gate the DDL behind an existence check: real Postgres tolerates
    // re-running CREATE TABLE IF NOT EXISTS, but the pg-mem test emulator
    // cannot re-parse it against an existing table, and every backend mount
    // (resume/HMR/adoption) re-bootstraps over shared storage.
    const present = await client.query<{ n: number }>(
      `SELECT count(*) AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'dsh_bus_state'`,
    )
    /* v8 ignore next 3 -- a COUNT(*) aggregate always yields one row; the fallback is defensive */
    const exists = present.rows[0]?.n ?? 0
    if (exists === 0) {
      await client.query(`
      CREATE TABLE IF NOT EXISTS dsh_bus_state (
        singleton      boolean PRIMARY KEY,
        schema_version integer NOT NULL,
        store_id       text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dsh_sessions (
        session_id      text PRIMARY KEY,
        format_version  integer NOT NULL,
        created_at      bigint NOT NULL,
        cwd             text,
        parent_session  text,
        seed_length     bigint,
        origin          text,
        delegation_depth bigint,
        agent_preset    text,
        incarnation     text NOT NULL,
        revision        bigint NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS dsh_events (
        session_id        text NOT NULL REFERENCES dsh_sessions(session_id) ON DELETE CASCADE,
        seq               bigint NOT NULL,
        type              text NOT NULL,
        time              bigint NOT NULL,
        data              jsonb NOT NULL,
        source_event_seqs jsonb,
        surface_op        jsonb,
        ignorable         boolean,
        PRIMARY KEY (session_id, seq),
        CONSTRAINT dsh_events_surface_consistency CHECK (
          (source_event_seqs IS NULL AND surface_op IS NULL) OR (surface_op IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS dsh_events_session_time_idx ON dsh_events (session_id, time);
    `)
    }
    await client.query(
      `INSERT INTO dsh_bus_state (singleton, schema_version, store_id)
       VALUES (true, $1, $2)
       ON CONFLICT (singleton) DO NOTHING`,
      [BUS_SCHEMA_VERSION, randomUUID()],
    )
    const state = await client.query<{ schema_version: number; store_id: string }>(
      'SELECT schema_version, store_id FROM dsh_bus_state WHERE singleton',
    )
    const row = state.rows[0]
    /* v8 ignore next 3 -- the ON CONFLICT insert always produces the singleton row; absent means a broken store */
    if (row === undefined) throw new Error(`session bus at "${label}" has no state row`)
    const version = toNumber(row.schema_version, 'schemaVersion')
    if (version !== BUS_SCHEMA_VERSION) {
      throw new Error(
        `session bus at "${label}" has schema version ${version}, incompatible with this build (${BUS_SCHEMA_VERSION})`,
      )
    }
    if (row.store_id.length === 0) throw new Error(`session bus at "${label}" has no valid store identity`)
    await client.query('COMMIT')
    return { storeId: row.store_id, storeIdentity: `pg:store:${row.store_id}` }
  } catch (error: unknown) {
    /* v8 ignore next 2 -- a failed ROLLBACK would only mask the original schema failure */
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

/** Acquire one dedicated client from the pool and release it on completion. */
export async function withClient<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await run(client)
  } finally {
    client.release()
  }
}
