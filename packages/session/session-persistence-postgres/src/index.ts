/**
 * Local Postgres durable session-persistence backend (the event-bus sidecar).
 * It maps each session header and event to rows in a local Postgres database
 * and delegates write-path orchestration to {@link PersistenceCoordinator}.
 * It has no independent per-session artifact, so its locator returns
 * `undefined`. The design lives in the workspace's
 * `postgres-event-bus-sidecar.md`.
 * @module @deepseek-ai/dsh-session-persistence-postgres
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import {
  DEFAULT_PREPARED_SESSION_CACHE_SIZE, DEFAULT_WRITE_BATCH_MAX_DELAY_MS, MAX_WRITE_BATCH_DELAY_MS,
  SessionPersistence, SessionPersistenceRevision, PersistenceCoordinator,
  type PersistenceBackend, type SessionLocation, type SessionPersistenceSnapshot,
  type SessionInspection, type StoredPrefix, type StoredSuffix,
} from '@deepseek-ai/dsh-session-persistence'
import type { SessionEvent, SessionId, SessionHeader, SessionPreparation, SurfaceEventType } from '@deepseek-ai/dsh-session'
import {
  BUS_NOTIFY_CHANNEL, bootstrapBus, notifyPointer, rowToMeta, scanRows, withClient,
  type EventRow, type NotifyPointer, type SessionRow,
} from './schema.ts'

export { BUS_SCHEMA_VERSION, BUS_NOTIFY_CHANNEL, notifyPointer } from './schema.ts'
export type { NotifyPointer } from './schema.ts'

/**
 * The default post-commit notifier: publish the batch pointer on the bus
 * channel. NOTIFY is a lossable accelerator — the table is the source of
 * truth — so a failed notification never fails the append.
 * @param pool - the pool to publish from.
 * @param channel - the notify channel.
 * @returns an async notifier for one committed batch.
 */
export function createPgNotifier(pool: Pool, channel = BUS_NOTIFY_CHANNEL): (pointer: NotifyPointer) => Promise<void> {
  return async (pointer) => {
    await pool.query('SELECT pg_notify($1::text, $2::text)', [channel, JSON.stringify(pointer)])
  }
}

/** A post-commit notify emitter; injectable so tests can record payloads. */
export type Notifier = (pointer: NotifyPointer) => Promise<void>

/** Plugin configuration. */
export interface Config {
  /**
   * Postgres connection DSN, for example
   * `postgres://dsh:password@localhost:5432/dsh_bus`. Either this or an
   * injected {@link createPool} override must supply a pool. The bus is a
   * per-host local sidecar; no remote sync is configured here.
   */
  connectionString?: string
  /**
   * Optional post-commit notifier override. Tests inject a recorder because
   * `pg_notify` is unavailable in the pg-mem emulator; the default publishes
   * the batch pointer on {@link BUS_NOTIFY_CHANNEL}.
   */
  notify?: Notifier
  /** Maximum cold Session preparations retained for history-to-resume reuse. */
  preparedSessionCacheSize?: number
  /** Fixed live-event coalescing window; not a backend completion deadline. */
  writeBatchMaxDelayMs?: number
}

/**
 * The Postgres persistence backend. Load as a plugin; it registers as
 * `ctx.sessionPersistence` and (via the coordinator) installs the write-path
 * listeners. Its torn-tail marker is the seq to delete from.
 */
export class PostgresSessionPersistence extends SessionPersistence implements PersistenceBackend<number> {
  override readonly supportsRawArtifacts = false

  static inject = ['sessions']

  static Config: z<Config> = z.object({
    connectionString: z.string(),
    notify: z.function(),
    preparedSessionCacheSize: z.number().step(1).min(1).default(DEFAULT_PREPARED_SESSION_CACHE_SIZE),
    writeBatchMaxDelayMs: z.number().step(1).min(1).max(MAX_WRITE_BATCH_DELAY_MS)
      .default(DEFAULT_WRITE_BATCH_MAX_DELAY_MS),
  })

  /**
   * Backend label for the coordinator's dispose diagnostics. Intentionally
   * shadows cordis `Service.name` (set to `'sessionPersistence'` by the base).
   */
  override readonly name = 'session-persistence-postgres'

  private pool!: Pool
  private storeIdentity!: string
  private ready: Promise<void>
  private coordinator: PersistenceCoordinator<number>
  private notify!: Notifier

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    const preparedSessionCacheSize = config.preparedSessionCacheSize
      ?? DEFAULT_PREPARED_SESSION_CACHE_SIZE
    const writeBatchMaxDelayMs = config.writeBatchMaxDelayMs
      ?? DEFAULT_WRITE_BATCH_MAX_DELAY_MS
    this.ready = this.open()
    this.coordinator = new PersistenceCoordinator<number>(this.ctx, this, {
      preparedSessionCacheSize,
      writeBatchMaxDelayMs,
    })
  }

  /**
   * Build the connection pool. Subclasses inject a test pool (e.g. pg-mem);
   * the default requires {@link Config.connectionString}.
   */
  protected createPool(): Pool {
    if (this.config.connectionString === undefined) {
      throw new Error('session-persistence-postgres: connectionString or a createPool override is required')
    }
    return new Pool({ connectionString: this.config.connectionString })
  }

  private async open(): Promise<void> {
    const pool = this.createPool()
    this.pool = pool
    this.notify = this.config.notify ?? createPgNotifier(pool)
    const client = await pool.connect()
    try {
      const state = await bootstrapBus(client, this.config.connectionString ?? '(injected pool)')
      this.storeIdentity = state.storeIdentity
    } finally {
      client.release()
    }
  }

  // --- SessionPersistence service API (delegated to the coordinator) ---

  /* jscpd:ignore-start -- backends share the coordinator delegation boilerplate */
  /** Postgres has one database, not an independent local artifact per session. */
  locate(_meta: SessionHeader): SessionLocation | undefined {
    return undefined
  }

  create(meta: SessionHeader): Promise<void> {
    return this.coordinator.create(meta)
  }

  append(id: SessionId, events: readonly SessionEvent[]): Promise<void> {
    return this.coordinator.append(id, events)
  }

  override prepare(id: SessionId, signal?: AbortSignal): Promise<SessionPreparation> {
    return this.coordinator.prepare(id, signal)
  }

  load(id: SessionId): Promise<SessionInspection> {
    return this.coordinator.load(id)
  }

  inspect(id: SessionId, signal?: AbortSignal): Promise<SessionInspection> {
    return this.coordinator.inspect(id, signal)
  }

  readFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    return this.coordinator.readFrom(id, fromSeq, signal)
  }

  // --- PersistenceBackend hooks (the Postgres storage primitives) ---

  /** Read a stored prefix by id (ids are globally unique — no scope to scan). */
  loadStored(id: SessionId, signal?: AbortSignal): Promise<StoredPrefix<number> | undefined> {
    return this.readPrefix(id, signal)
  }

  /** Read one row's revision without loading its events. */
  async readStoredRevision(id: SessionId, signal?: AbortSignal): Promise<SessionPersistenceRevision | undefined> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const row = await this.rowFor(id)
    return row === undefined ? undefined : this.rowRevision(row)
  }
  /* jscpd:ignore-end */

  /**
   * Seek-capable suffix read: SQL selects `seq >= fromSeq` directly, so the
   * read scales with the suffix, not the log. Torn rows past the preserved
   * region are dropped, never repaired (non-mutating read).
   */
  async loadStoredFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<StoredSuffix | undefined> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    return withClient(this.pool, async (client) => {
      const row = await this.sessionRow(client, id)
      if (row === undefined) return undefined
      const eventRows = await this.eventRows(client, id, fromSeq)
      const { preserved } = scanRows(eventRows, fromSeq)
      return { meta: rowToMeta(row), events: preserved }
    })
  }

  /**
   * Read a session's row + ordered events into a {@link StoredPrefix}. The
   * torn-tail marker is the seq from which a never-committed tail must be
   * deleted (`scanRows` already returns it as `number | undefined`).
   */
  private async readPrefix(id: SessionId, signal?: AbortSignal): Promise<StoredPrefix<number> | undefined> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    return withClient(this.pool, async (client) => {
      await client.query('BEGIN')
      try {
        const row = await this.sessionRow(client, id)
        if (row === undefined) {
          await client.query('COMMIT')
          return undefined
        }
        const eventRows = await this.eventRows(client, id)
        await client.query('COMMIT')
        const { preserved, tornFrom } = scanRows(eventRows)
        return {
          meta: rowToMeta(row),
          events: preserved,
          revision: this.rowRevision(row),
          ...tornFrom !== undefined ? { tornMarker: tornFrom } : {},
        }
      } catch (error: unknown) {
        /* v8 ignore start -- a failed ROLLBACK would only mask the original read failure */
        await client.query('ROLLBACK').catch(() => {})
        throw error
        /* v8 ignore stop */
      }
    })
  }

  /**
   * Durably append a batch in ONE transaction: materialize the sessions row (if
   * lazy) and INSERT every event, or roll back entirely. The transaction is the
   * atomicity + durability boundary, so a mid-batch failure (a unique violation
   * on a duplicated seq) leaves the stored log untouched. After COMMIT, the
   * batch pointer is published on the bus channel (best-effort).
   */
  async appendBatch(meta: SessionHeader, events: readonly SessionEvent[], isMaterialized: boolean): Promise<void> {
    await this.ready
    await withClient(this.pool, async (client) => {
      await client.query('BEGIN')
      try {
        if (!isMaterialized) await this.writeRow(client, meta)
        for (const event of events) await this.insertEvent(client, meta.id, event)
        await client.query(
          'UPDATE dsh_sessions SET revision = revision + 1 WHERE session_id = $1',
          [meta.id],
        )
        await client.query('COMMIT')
      } catch (error: unknown) {
        /* v8 ignore start -- a failed ROLLBACK would only mask the original write failure */
        await client.query('ROLLBACK').catch(() => {})
        throw error
        /* v8 ignore stop */
      }
    })
    try {
      await this.notify(notifyPointer(meta, events))
    } catch {
      // NOTIFY is a lossable accelerator; the committed table is the source of truth.
    }
  }

  /**
   * Make a crash repair durable in ONE transaction: DELETE the torn tail (from
   * `tornMarker`) and INSERT the synthetic `closers`. After COMMIT the stored
   * rows == the balanced log, and the repair's appended closers are published.
   */
  async commitRepair(meta: SessionHeader, tornMarker: number | undefined, closers: readonly SessionEvent[]): Promise<void> {
    await this.ready
    let appended: readonly SessionEvent[] = []
    await withClient(this.pool, async (client) => {
      await client.query('BEGIN')
      try {
        if (tornMarker !== undefined) {
          await client.query('DELETE FROM dsh_events WHERE session_id = $1 AND seq >= $2', [meta.id, tornMarker])
        }
        if (closers.length > 0) {
          for (const event of closers) await this.insertEvent(client, meta.id, event)
          appended = closers
        }
        if (tornMarker !== undefined || closers.length > 0) {
          await client.query(
            'UPDATE dsh_sessions SET revision = revision + 1 WHERE session_id = $1',
            [meta.id],
          )
        }
        await client.query('COMMIT')
      } catch (error: unknown) {
        /* v8 ignore start -- a failed ROLLBACK would only mask the original repair failure */
        await client.query('ROLLBACK').catch(() => {})
        throw error
        /* v8 ignore stop */
      }
    })
    if (appended.length > 0) {
      try {
        await this.notify(notifyPointer(meta, appended))
      } catch {
        // NOTIFY is a lossable accelerator; the committed table is the source of truth.
      }
    }
  }

  /** List all materialized sessions' metadata (every row is a materialized session). */
  async list(signal?: AbortSignal): Promise<SessionHeader[]> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const result = await this.pool.query<SessionRow>('SELECT * FROM dsh_sessions')
    signal?.throwIfAborted()
    return result.rows.map(rowToMeta)
  }

  /** List metadata with a source-qualified monotonic revision per session. */
  async listSnapshots(signal?: AbortSignal): Promise<SessionPersistenceSnapshot[]> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const result = await this.pool.query<SessionRow>('SELECT * FROM dsh_sessions')
    signal?.throwIfAborted()
    return result.rows.map(row => ({
      header: rowToMeta(row),
      revision: this.rowRevision(row),
    }))
  }

  /** End the pool (awaited by the coordinator's dispose, post-drain). */
  async close(): Promise<void> {
    await this.ready
    await this.pool.end()
  }

  // --- row helpers ---

  private rowRevision(row: SessionRow): SessionPersistenceRevision {
    return SessionPersistenceRevision(
      `${this.storeIdentity}:incarnation:${row.incarnation}:revision:${Number(row.revision)}`,
    )
  }

  private async sessionRow(client: PoolClient, id: SessionId): Promise<SessionRow | undefined> {
    const result = await client.query<SessionRow>('SELECT * FROM dsh_sessions WHERE session_id = $1', [id])
    return result.rows[0]
  }

  private async rowFor(id: SessionId): Promise<SessionRow | undefined> {
    const result = await this.pool.query<SessionRow>('SELECT * FROM dsh_sessions WHERE session_id = $1', [id])
    return result.rows[0]
  }

  private async eventRows(client: PoolClient, id: SessionId, fromSeq = 0): Promise<EventRow[]> {
    const result = await client.query<EventRow>(
      `SELECT seq, type, time, data, source_event_seqs, surface_op, ignorable
       FROM dsh_events WHERE session_id = $1${fromSeq > 0 ? ' AND seq >= $2' : ''} ORDER BY seq`,
      fromSeq > 0 ? [id, fromSeq] : [id],
    )
    return result.rows
  }

  /**
   * Insert-or-replace a session's metadata row. The only caller is the first
   * materializing `appendBatch`, so writing the row IS the materialization (its
   * existence is the signal `list` reads). A conflict updates the metadata but
   * keeps the original incarnation.
   */
  private async writeRow(client: PoolClient, meta: SessionHeader): Promise<void> {
    await client.query(
      `INSERT INTO dsh_sessions
        (session_id, format_version, created_at, cwd, parent_session, seed_length, origin, delegation_depth, agent_preset, incarnation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (session_id) DO UPDATE SET
         format_version = EXCLUDED.format_version,
         created_at = EXCLUDED.created_at,
         cwd = EXCLUDED.cwd,
         parent_session = EXCLUDED.parent_session,
         seed_length = EXCLUDED.seed_length,
         origin = EXCLUDED.origin,
         delegation_depth = EXCLUDED.delegation_depth,
         agent_preset = EXCLUDED.agent_preset`,
      [
        meta.id,
        meta.version,
        meta.createdAt,
        meta.cwd ?? null,
        meta.parentSession ?? null,
        meta.seedLength ?? null,
        meta.origin ?? null,
        meta.delegationDepth ?? null,
        meta.agentPreset ?? null,
        randomUUID(),
      ],
    )
  }

  private async insertEvent(client: PoolClient, id: SessionId, event: SessionEvent): Promise<void> {
    const se = event as SessionEvent<SurfaceEventType>
    await client.query(
      `INSERT INTO dsh_events (session_id, seq, type, time, data, source_event_seqs, surface_op, ignorable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        event.seq,
        event.type,
        event.time,
        JSON.stringify(event.data),
        se.sourceEventSeqs ? JSON.stringify(se.sourceEventSeqs) : null,
        se.surfaceOp !== undefined ? JSON.stringify(se.surfaceOp) : null,
        event.ignorable === true ? true : null,
      ],
    )
  }
}

export default PostgresSessionPersistence
