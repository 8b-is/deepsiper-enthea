# Agent Note: `contextTokenBudget` runtime-context governor

Status: implemented

English | [中文](2026-08-18-context-token-budget.zh.md)

## Problem

The harness assembled every ordered runtime context into the snapshot with no
token accounting, so a deployment with many dynamic contributions could push
long-context windows past the model's capacity — or crowd out high-value
context with noise. SOTA harnesses treat the prompt as a budgeted resource:
allocate across inputs, degrade gracefully under pressure, and tell the model
when the snapshot is partial. The registry had priority (order) but no cap.

## Decision

**`system-prompt` gains a `Config.contextTokenBudget` positive-integer cap.**
The assembly carries it as `PromptAssembly.contextTokenBudget`, and
`renderContextSections` applies it: the highest-ordered (earliest) rendered
contributions are kept until the cumulative token estimate would exceed the
budget; the rest are dropped. Token estimates use the exported `estimateTokens`
heuristic (`chars / 4`), a tokenizer-free approximation sized with headroom by
the deployment. When content was dropped, a synthetic `context:truncated`
section is appended naming the omission count — the model and any invariant
companion (e.g. `dsh-host-info`) can see the snapshot is partial.

**The budgeted snapshot stays the model-visible, logged record.** The governor
only changes which contributions reach the snapshot, which is projected as the
durable runtime-context `user/message`; the truncation note and the kept
sections are exactly what the model reads and what the log replays. No new
session event, no change to `session-persistence` or the loop — `agent.ts`
already calls `renderContextSections`/`joinContextSections`, so it inherits the
governor with zero loop changes.

**Validation fails loud at load.** Non-positive or non-integer budgets are
rejected by the config schema before any assembly. Omitted disables budgeting,
so the default behavior is unchanged.

## Alternatives considered

**A tokenizer-accurate budget using the adapter's tokenizer.** Rejected for the
first cut: tokenization is async, provider-specific, and unavailable at
assembly time; the heuristic is documented and the budget is deployment-sized.
A pluggable estimator is a natural follow-up.

**Budget the entire system prompt (sections + tools + context).** Deferred:
sections are deployment-authored (the operator controls their size) and tool
schemas are a separate wire field; the runtime context is the dynamic,
session-varying degradation surface. Section/tool budgeting can layer on later
without changing this mechanism.

**Summarize (compress) dropped contexts instead of dropping them.** Deferred:
compression needs an LLM call and async plumbing at assembly time; the
lossless drop + explicit truncation note is the correct first slice, and
compression can replace the drop behind the same budget decision.

## Consequences

Deployments under long-context pressure can set `contextTokenBudget` and get a
bounded, priority-ordered runtime-context snapshot with an explicit truncation
marker, all logged and replayable. The estimate is heuristic — under-budgeted
deployments may drop more than a tokenizer would say is necessary, which is
documented. Tests pin the keep/truncate/note behavior and the 100% coverage
gate stays green. A pluggable token estimator and whole-prompt budgeting remain
future surfaces.
