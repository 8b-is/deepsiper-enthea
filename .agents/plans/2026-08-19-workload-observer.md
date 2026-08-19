# Spec — `workload-observer`: baseline-relative, advisory cache-phase observer

Status: spec (pending implementation)
Date: 2026-08-19
Owner: deepsiper-enthea (8b-is/deepsiper-enthea)
Design: agreed with operator (Peter) — two-stage arm-then-watch, settled-history lookback, decomposed notification

## 1. Problem (brainstorm)

Long-running agent sessions reuse a stable request prefix (tool schemas,
persona, preset rows) — the KV-cache-friendly region. When the workload
shifts (new task phase, new tool family, repo region change) or the
environment degrades (network/backend), that reuse silently drops. There is
no observer that measures the baseline, detects the drop, and tells the user
*what kind* of change it was.

## 2. Design (agreed)

A **read-only, advisory** observer. It never mutates cache, request, or
prefix state — only reads settled history and emits notifications into a
queue.

### 2.1 Warm-up baseline

- After a warm-up window of `warmUpTurns` (default 10) user↔assistant (or
  user↔orchestrator) turns, compute the baseline of the **prefix-reuse ratio**
  (share of request tokens that hit the cached prefix). Expected steady-state
  ≈ 95%.
- The baseline is a rolling median + spread over the window, **not a hard
  number** — the trigger is baseline-relative (`median − k·σ`, default k=2),
  so a quiet machine doesn't arm on noise and a noisy one still arms on a real
  phase change. The 5–10% figure from the operator is the default `k` mapping,
  not the rule.

### 2.2 Two-stage arm-then-watch

- **Always-on guard (cheap):** compare each settled turn's reuse ratio to the
  baseline. A drop past the threshold **arms** the observer (state: `armed`).
- **Observe stage (heavier):** while armed, collect the settled window
  (n−3 look-back — the current, next, and last turns are never analyzed),
  building the decomposed signal profile over `observeTurns` (default 5).
- De-arms when the ratio returns inside the band.

### 2.3 Signal decomposition (the "what kind" of serious change)

On a serious change, classify **why**:

| Signal | Meaning | Serious when |
|---|---|---|
| prefix-reuse ratio | workload stability | drops past band **with** tokens/s stable → **workload phase shift** |
| tokens/s | throughput health | drops → generation/backend degraded |
| latency variance | environment | spikes with reuse ratio stable → **network/environment disturbance** |

A hit-rate drop with stable latency = real phase change; stable hit rate with
latency variance spike = environmental. The notification carries the
decomposed cause, never just "something dropped."

### 2.4 Queue + notify

- Observer enqueues `phase-shift` / `environment-degraded` events into a
  queue (fire-and-forget; never blocks the loop).
- A consumer decides whether to notify the user (threshold, dedupe, throttle).
- **No writes anywhere** on the cache/request path. The observer cannot cause
  a regression — worst case it emits a wrong notification.

## 3. Proposed shape (implementation sketch)

- `@deepseek-ai/dsh-workload-observer` — Service Definition (`ctx.workload`):
  `armRatio`, `warmUpTurns`, `observeTurns`, `kSigma` config; subscribes to
  the session event stream; holds the n−3 settled window; emits
  `workload/phase-shift` + `workload/environment-degraded` events; exposes a
  `baseline()` read. Queue/notify consumer is a separate opt-in row.
- Keyless verification: replay a synthetic turn stream (stable prefix →
  simulated phase shift → simulated latency spike) and assert the observer
  arms, de-arms, and classifies the cause correctly.

## 4. Acceptance

1. Warm-up: no arming before `warmUpTurns`; baseline = rolling median + spread.
2. Baseline-relative trigger: arms only past `median − k·σ`; de-arms inside.
3. Settled look-back: current/next/last turns never analyzed.
4. Classification: phase-shift vs environment-degraded correct on the
   synthetic replay (keyless).
5. Events emitted to the queue; consumer throttles/dedupes; no cache writes.
6. Host tsc + lint + invariants clean; package tests cover all of the above.

## 5. Scope

- In: the observer package (seam + event surface), keyless replay test,
  Agent Note.
- Out: mounting in `dsh-base` defaults (the consumer is opt-in until the
  replay evidence passes and the operator's threshold numbers are confirmed),
  any cache eviction logic (this observer is advisory only by design).
