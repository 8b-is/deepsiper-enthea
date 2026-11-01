# Agent Note: Clear the fork's pre-existing e2e gate drift

Status: implemented

English | [中文](2026-11-01-fork-e2e-gate-drift.zh.md)

## Problem

The fork's `pnpm run test` was red before this change: `tool-quant` was absent from the tool-schema manifest, `ctx.quant` had no Cordis catalog page, the `skill-crabcc` invariant spawned an absent optional CLI without an error listener (an uncaught `spawn crabcc ENOENT` plus a five-second hang), the Oxlint executable contract assumed explicit paths bypass `.gitignore`, a grader timeout was classified as a signal kill, and the user-patch watch test waited only 10 seconds for chokidar delivery that a concurrent suite can delay. A known-red suite hides the next regression and blocks the documented pre-push check.

## Decision

Wire `tool-quant` into `scripts/gen-tool-catalog.ts` (mount `Quant`, `QuantReference`, `ToolQuant`) and regenerate `docs/tool-catalog.md`.

Map `ctx.quant` to a new `docs/subsystems/quant.md` pair, register it in `website/docs.ts`, index it in both subsystem READMEs, and classify `QuantProvider`, `QuantRequest`, and `QuantResult` through `TYPE_LINK_EXEMPTIONS` because the service README owns them.

Treat the `crabcc` CLI as an optional external tool: attach the invariant's `error` listener before the stdio listeners, resolve without a failure finding on `ENOENT`, keep a non-zero exit a failure, and self-skip the real-CLI e2e suite when `isCrabccAvailable` is false.

Check `timedOut` before `exitCode === null` in `tool-eval` so a timed-out grader reports the timeout contract.

Stop ignoring the transient Oxlint contract probes in `.gitignore`: Oxlint 1.78 filters explicitly passed paths through `.gitignore`, so the ignored probe names never reached the linter.

Widen only the default-compose user-patch watch wait to 30 seconds and its test timeout to 45 seconds; watcher readiness is already awaited, so the remaining variable is delivery latency under concurrent load.

Document the hf-mac Osaurus seam in `docs/backends/osarous.md` and link it from both README language sides.

## Alternatives considered

**Leave the gates red and document them.** Rejected: a known-red suite cannot separate the next regression from the backlog, and the pre-push recipe runs the same gates.

**Require `crabcc` instead of guarding it.** Rejected: the skill already degrades without the binary, so an invariant finding would make a harness check depend on an optional developer tool.

**Rename the Oxlint probes instead of unignoring them.** Rejected: the same `.gitignore` would keep hiding future probe artifacts, and the tests already remove them in `finally`.

**Raise the user-patch watch timeout globally.** Rejected: the 10-second default is adequate for every other wait in the file; only the watch-delivery case showed concurrency sensitivity.

## Consequences

`pnpm run test` is green (`13930 passed, 124 skipped, 0 failed, 0 uncaught`), and every regenerated artifact ships in this change.

The remaining documentation gates stay red for separate follow-ups: dead README anchors, `packages/README.md` over its word ceiling, the `CouncilReport` type-equiv block describing an older shape, and missing Chinese package READMEs.

If Oxlint later stops applying `.gitignore` to explicit paths, the unignored probes are harmless; the ignores should not return without re-checking the contract tests.

Related: [the quant seam](../feature/2026-08-19-quant-seam-core.md).
