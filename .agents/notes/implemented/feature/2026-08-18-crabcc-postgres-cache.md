# Agent Note: Durable Postgres cache for crabcc symbol/reference lookups

Status: implemented

English | [中文](2026-08-18-crabcc-postgres-cache.zh.md)

## Problem

`skill-crabcc` spawns the crabcc CLI for every `code_search` /
`goto_definition` / `find_references` query, re-parsing the index each time.
On a long agent run the same symbols get looked up repeatedly; a durable cache
on the same local Postgres bus (the event-bus sidecar) removes the redundant
spawns without changing what the model sees.

## Decision

**A `CrabccCache` seam in `skill-crabcc`, with a Postgres implementation.**
`skill-crabcc` resolves the optional `ctx.crabccCache` service at tool
execution (`exec.agent.ctx.get`) and runs each tool body through it: a hit
returns the cached result without spawning; a miss runs crabcc and stores the
result write-through. The cache key covers every query input
(`(root, kind, query, max_results, include_refs)`), results are stored as JSONB
and returned byte-identical, TTL expiry is lazy (stale reads miss), and
`invalidate(root?)` drops entries immediately.

**`@deepseek-ai/dsh-crabcc-cache-postgres` implements the cache** against a
`crabcc_cache` table in the same local bus database (reusing the `pg` driver
and the pg-mem test pattern), registered as the `crabccCache` service. A
failed cache read or write never fails a tool: the cache is an optimization,
not a correctness dependency.

**The cache is keyed, not index-aware.** TTL bounds staleness; a `crabcc index`
rebuild is not detected until entries expire or the caller invalidates.

## Alternatives considered

**Inline the cache inside `skill-crabcc`.** Rejected: the cache needs a
Postgres connection/lifecycle and its own package conventions; a separate
provider keeps `skill-crabcc` dependency-free and the cache composable.

**Key the cache on an index fingerprint.** Deferred: crabcc exposes no cheap
index stamp in the harness's reach, and fingerprinting every query defeats the
purpose; explicit `invalidate(root)` covers the re-index path.

**Cache the raw crabcc wire output instead of the tool result.** Rejected: the
tool result is the model-facing artifact and the transform is deterministic, so
caching the final result is simpler and equally correct.

## Consequences

Repeat crabcc lookups hit the local Postgres cache instead of re-spawning the
CLI, cutting per-query latency and index re-parses while keeping the model's
output byte-identical. The cache degrades to direct runs when the bus is down
and stays bounded by TTL; re-indexing requires explicit invalidation (documented
risk). Tests cover the seam (hit/miss/degrade/write-error via a stubbed spawn)
and the Postgres cache (round-trip, key separation, TTL, invalidation,
re-bootstrap) at 100% src coverage for the new package.
