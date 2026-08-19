# @deepseek-ai/dsh-session-persistence-postgres

English | [中文](README.zh.md)

Local Postgres durable session-persistence backend (the event-bus sidecar). It
maps each session header and event to rows in a **local** Postgres database —
the harness's durable store for that host, with no remote sync. It delegates
write-path orchestration to `PersistenceCoordinator`, so it inherits per-id
serialization, contiguity enforcement, crash-tail repair, write-behind, and
`seedCoversPrefix` adoption exactly like the JSONL and SQLite backends, only
with Postgres as the medium. After each committed batch it publishes a small
pointer on `pg_notify` so local consumers (observability, embedding pipelines,
honcho) can tail the bus. Full design: `postgres-event-bus-sidecar.md` (workspace).

## Config

```yaml
- id: session-persistence-postgres
  name: '@deepseek-ai/dsh-session-persistence-postgres'
  config:
    connectionString: postgres://dsh:…@localhost:5432/dsh_bus
```

| Key | Default | Meaning |
|---|---|---|
| `connectionString` | — | Postgres DSN. Required unless a `createPool` override supplies a pool (the test seam). |
| `notify` | `pg_notify` | Post-commit notifier override. The default publishes the batch pointer `{ sid, lo, hi }` on channel `dsh_session_events`. NOTIFY is a **lossable accelerator** — the table is the source of truth, so a failed notification never fails an append. |
| `preparedSessionCacheSize` | `DEFAULT_PREPARED_SESSION_CACHE_SIZE` | Maximum cold preparations retained for history-to-resume reuse. |
| `writeBatchMaxDelayMs` | `DEFAULT_WRITE_BATCH_MAX_DELAY_MS` | Fixed live-event coalescing window. |

## Semantics

- **One transaction per mutation.** `appendBatch` materializes the `dsh_sessions`
  row lazily and inserts every event atomically; a mid-batch failure (a
  duplicate `seq`) rolls back and leaves the log untouched. `commitRepair`
  truncates a torn tail and appends the synthetic closers in one transaction.
- **Torn tails are seq gaps.** Postgres transactions are atomic, so a partial
  row is impossible; the torn-tail contract is preserved through `scanRows`,
  which bounds the preserved prefix at the last `turn/end` and treats a later
  seq gap as a never-committed tail to delete.
- **Revisions are store-qualified.** `pg:store:<storeId>:incarnation:<incarnation>:revision:<revision>`,
  minted once per database in `dsh_bus_state` and preserved across reloads.
- **Bigint columns are coerced.** Real `pg` returns `int8` as strings; the row
  helpers coerce to safe integers.
- **JSONB payloads.** Event `data` and the surface columns are `jsonb`; the
  harness's lossless guarantee is structural (`isDeepEqualJson`), which JSONB
  preserves.

## Development

Tests run against **pg-mem** (an in-memory Postgres emulator): the same
backend-agnostic persistence and coordinator contract suites as JSONL/SQLite,
plus backend-mechanics tests. pg-mem cannot run `pg_notify`, so tests inject a
recorder; the default notifier is unit-tested against a mock pool.

```sh
pnpm test   # vitest: contract suites + mechanics, 100% src coverage
```

## Model Experience

None — this is durable storage; nothing here reaches a model request.

## Known Limitations and Deferred Work

- **Month-range partitioning deferred** — `dsh_events` is a plain table for the
  first slice; retention stays lossless-infinite by default and partitioning
  (for operability/pruning) lands as a `BUS_SCHEMA_VERSION` bump.
- **No global `id` column yet** — the design's observability fan-out identity
  and `dsh_event_embeddings`/`dsh_consumer_checkpoints` tables are deferred
  with partitioning.
- **Real `pg` path exercised only against a live server** — pg-mem covers the
  SQL semantics; the `pg` driver's bigint-as-string and connection behaviors
  are handled by coercion but only verified in an e2e with a real local Postgres
  (the ROYAL-WHALE wiring step).
- **`connectionString` is the production config** — embedding the bus in a
  process requires an explicit DSN or a `createPool` subclass.
