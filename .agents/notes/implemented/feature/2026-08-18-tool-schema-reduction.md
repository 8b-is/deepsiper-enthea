# Agent Note: Tool-schema reduction governor + KOMPRESS-v2 consensus eval

Status: implemented

English | [中文](2026-08-18-tool-schema-reduction.zh.md)

## Problem

Tool schemas dominate the system prompt: in the pinned ACP snapshot they were
21.4KB of the ~30KB assembled input — the prose prompt was 3.5KB. The single
biggest contributors were verbose tool descriptions (`workflow` 2.5KB, `bash`
1.8KB), per-property parameter prose, and whole tools mounted per-agent that a
turn rarely needed. Separately, KOMPRESS v2's geometric-mean consensus
distillation had no inference-side counterpart in the harness.

## Decision

**A tool-schema governor in `system-prompt`**, the sibling of the existing
`contextTokenBudget`:

- `compactToolSchemas` (default `true`) strips JSON-Schema wire noise
  (`examples`, `default`, `additionalProperties`) recursively from assembled
  tool schemas — deterministic, and no model-facing name/description/guidance
  is lost.
- `toolSchemaBytes` (optional) caps the serialized schema payload; when over,
  the longest tool description, then the longest parameter-property
  description, is truncated (with `…`, never below a floor) until the cap
  fits. The trimmed schemas are exactly what the model receives and what the
  durable header logs (model-visible ⟺ logged holds).

**Lean per-agent tool restriction** — `@deepseek-ai/dsh-lean-tools` denies the
heavy orchestration tools (`ralph`, `subagent_fork`, `workflow`) per agent at
`agent/created` via `agent.ctx.tools.restrict()`; mounted in the base bundle,
so every profile's tool surface shrinks. The base bundle also gates session
persistence: Postgres bus only when `DSH_PG_URL` is set, JSONL otherwise —
keeping the keyless snapshot suite deterministic (no live-bus collisions, no
live-varying host-info context).

**KOMPRESS-v2 consensus eval** — `@deepseek-ai/dsh-eval-consensus` runs one
task across a configured Council of model routes and aggregates via a
geometric-mean-style agreement (Jaccard support + geometric-mean confidence),
the inference analog of the paper's training-time consensus. A failed route is
reported and excluded, never poisoning the verdict.

## Alternatives considered

**Hard-cap every tool description in source.** Rejected: `workflow`'s and
`bash`'s descriptions carry real behavior contracts (hooks, escalation policy);
a byte cap trims them only under budget pressure instead of degrading them
unconditionally.

**Ship host-info/crabcc in the base bundle default.** Rejected: host-info's
runtime context varies per run (available memory) and breaks deterministic
replay, and the crabcc tools add schema weight — both are opt-in overlays.

## Consequences

The default profile drops ~7KB of tool schemas via restriction and trims the
remaining noise; `text-turn` went from 21.4KB to ~19.7KB of schemas with the
lean set available per profile. Snapshots were re-recorded keyless
(`test:snapshot:refresh`). Deployments can tighten further with
`toolSchemaBytes`. The eval-consensus lane gives the harness a Council-style
inference aggregator wired to any configured providers; a logits-level
geometric-mean (the exact KOMPRESS v2 recipe) is deferred until an adapter
exposes logprobs.
