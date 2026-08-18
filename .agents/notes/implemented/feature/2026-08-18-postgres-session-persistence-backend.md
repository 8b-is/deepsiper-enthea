# Agent Note: Local Postgres durable session-persistence backend

Status: implemented

English | [中文](2026-08-18-postgres-session-persistence-backend.zh.md)

## Problem

The harness's session log is the lossless, replayable record of every
model-visible interaction, but it is written only to per-process local files or
SQLite. The operator wanted a **local Postgres durable store** — an event-bus
sidecar that externalizes the log into a queryable, NOTIFY-able database on the
same host, with no remote sync. It had to preserve the exact persistence
semantics the coordinator already provides (contiguity, crash-tail repair,
lazy materialization, revisions) so no orchestration logic changes.

## Decision

**`@deepseek-ai/dsh-session-persistence-postgres` implements
`PersistenceBackend<number>` exactly like the SQLite backend**, delegating
write-path orchestration to the shared `PersistenceCoordinator`. One
`dsh_events` row per `SessionEvent` with `(session_id, seq)` as the PK — the
harness `seq` IS the ordering key; `dsh_sessions` holds the header with an
`incarnation`/`revision` change token; `dsh_bus_state` mints a store identity
once per database. `appendBatch` and `commitRepair` are single transactions
(materialize + insert or roll back; truncate + closers). Torn tails are seq
gaps — Postgres transactions are atomic, so the partial-row case of a file
backend cannot occur, and `scanRows` bounds the preserved prefix at the last
`turn/end`.

**Post-commit NOTIFY is a lossable accelerator.** Each committed batch publishes
`{ sid, lo, hi }` on channel `dsh_session_events`; consumers reconcile against
the table. A failed notification never fails an append (an injectable notifier
is the test seam — pg-mem cannot run `pg_notify`).

**Retention is lossless-infinite by default** (it is the primary durable store;
pruning would break `model-visible ⟺ logged` reconstruction), with month-range
partitioning and explicit opt-in pruning deferred behind a schema bump.

## Alternatives considered

**Mirror a local JSONL/SQLite onto the bus.** Dropped: the operator requires
no remote sync and the bus is the primary store, so a mirror adds a second
durability contract with no consumer.

**Reuse SQLite and add pgvector only.** Rejected: the event bus needs Postgres
as the durable medium (LISTEN/NOTIFY + queryable events), not an embedded file.

**A separate cache package for crabcc symbol/ref results.** Deferred to a
follow-up: the session log and crabcc's symbol/reference cache are different
artifacts and land as separate Postgres tables behind the same local bus.

## Consequences

A host can now mount the bus as `ctx.sessionPersistence` and get Postgres
durability with identical coordinator semantics; the assembled snapshot is
logged in the durable `dsh_events` rows and NOTIFY wakes local consumers. Tests
run the same backend-agnostic persistence + coordinator contract suites as
JSONL/SQLite over pg-mem (100% src coverage), pinning byte-for-byte semantic
parity. The real `pg` driver path (bigint-as-string, connection behavior) is
handled by coercion but only fully verified in an e2e with a live local
Postgres — the ROYAL-WHALE wiring step.
