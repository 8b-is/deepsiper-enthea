# @deepseek-ai/dsh-crabcc-cache-postgres

Local Postgres durable cache for [crabcc](https://github.com/8b-is/crabcc)
symbol/reference lookups. Mounting this plugin registers `ctx.crabccCache`;
the `skill-crabcc` tools consult it before spawning the CLI and store results
after a miss, so repeat symbol/definition/reference queries hit the bus instead
of re-parsing the crabcc index. Entries expire by TTL. The cache is an
**optimization** — a down bus degrades skill-crabcc back to direct CLI runs,
never to wrong answers.

## Config

```yaml
- id: crabcc-cache-postgres
  name: '@deepseek-ai/dsh-crabcc-cache-postgres'
  config:
    connectionString: postgres://dsh:…@localhost:5432/dsh_bus
    ttlSeconds: 300
```

| Key | Default | Meaning |
|---|---|---|
| `connectionString` | — | Postgres DSN. Required unless a `createPool` override supplies a pool. Lives in the same local bus database as the session-persistence backend. |
| `ttlSeconds` | `300` | Entry lifetime in seconds; stale entries are lazily deleted on read. |

## Semantics

- **Keyed by every query input**: `(root, kind, query, max_results, include_refs)`
  — a caller's absent `limit` maps to `0` so the primary key stays non-null.
- **Lazy TTL expiry**: `get` compares `stored_at` against a cutoff; a stale
  entry is treated as a miss. `invalidate(root?)` drops entries immediately.
- **Result payloads are JSONB** — the exact tool result is stored and returned
  verbatim on a hit, so the model sees byte-identical output either way.
- **Write-through on miss**; a failed cache read or write never fails the tool.

## Development

Tests run against **pg-mem** (an in-memory Postgres emulator): round-trip,
key separation, TTL expiry, invalidation, idempotent re-bootstrap, and the
missing-connection/close paths, at 100% src coverage. The skill-crabcc cache
seam is covered by `skill-crabcc/tests/cache-seam.spec.ts` (stubbed `spawn`).

```sh
pnpm test   # vitest: cache mechanics + seam, 100% src coverage
```

## Model Experience

None — this is a lookup cache; nothing here reaches a model request beyond the
cached tool result, which is byte-identical to a direct crabcc run.

## Known Limitations and Deferred Work

- **TTL bounds staleness, it does not detect re-indexing** — a `crabcc index`
  rebuild is not noticed until entries expire; explicit `invalidate(root)`
  after a re-index gives immediate freshness. Index-fingerprint invalidation
  is deferred.
- **Not a correctness dependency** — a down or slow bus silently degrades to
  direct CLI runs; there is no cache-health telemetry yet.
- **`connectionString` is the production config** — embedding requires an
  explicit DSN or a `createPool` subclass.
