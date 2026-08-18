# Agent Note: Host hardware runtime context from the Neon sysinfo addon

Status: implemented

English | [中文](2026-08-18-neon-host-info-system-context.zh.md)

## Problem

The harness gave models no direct read on the host's CPU, OS, and memory, so
platform-constrained reasoning (build targets, resource ceilings, architecture
quirks) had to be asked of the user or guessed. A Neon addon
(`native/hardware-info`, sysinfo behind a Rust boundary) already exposes a
synchronous snapshot; it had no consumer. Models needed that fact in their
request context, gated to hosts where the addon actually works.

## Decision

**A new context package contributes the snapshot as one ordered runtime-context
section.** `@deepseek-ai/dsh-host-info` registers a `host:info` context at order
`5` (after the persona, before tool guidance) whose text re-evaluates
`hardwareInfo()` at each assembly. The rendered block is pinned model-facing
prose — absent fields are dropped, frequency at `0` is omitted, byte counts are
one-decimal GiB / whole MiB / raw — and renders `''` on unsupported hosts, so
the same composition stays mounted fleet-wide and degrades to nothing.

**Model-visible-to-logged is satisfied by the existing runtime-context snapshot,
not a new event.** The loop projects `joinContextSections` into a durable
`user/message` whenever the joined text changes, carrying each named
contribution in the source's `sections`. The `./invariant` companion validates
every such snapshot: at most one `host:info` section and it matches the pinned
format. No `SessionEventMap` change, so the persistence catalog is untouched.

**The addon wrapper became a TS project.** `native/hardware-info` now compiles
`src/index.ts` to `lib/` (types included) beside the cargo-built
`lib/index.node`, matching the `native/landlock-run/packages/entry` precedent —
the key reason is that the consumer package needs a project reference to it, and
its runtime imports (addon types, `createRequire` guarded load) are now
type-checked like any other package. Loading stays lazy and fail-closed: a
missing or unsupported binary degrades to `probe() === 'unsupported'`.

## Alternatives considered

**Register the context from inside the native addon package.** Rejected: `native/*`
is not a `packages/*/*` cordis plugin, and the harness plugin conventions
(peer/dev cordis, tsdown bundle, invariant companion) belong to a real package.

**Expose a `dsh` CLI `sysinfo` command instead of prompt context.** Rejected
after the operator chose the system-prompt route: host facts are useful during
reasoning, not only as a diagnostic.

**Log a dedicated session event per request.** Rejected: the assembled runtime
snapshot is already the durable, model-visible record; a second event would
duplicate it and churn `KNOWN_SESSION_EVENT_TYPES`.

## Consequences

A deployment mounting `@deepseek-ai/dsh-host-info` gives the model one small,
stable prefix block naming system, CPU, and memory, refreshed per request so
available memory stays current; hosts without the addon binary contribute
nothing and the invariant finds nothing to check. The addon dependency is
workspace-private until a native release sequence publishes it. Workspace
registration is now documented (`pnpm-workspace.yaml` is authoritative;
`packages/*/*` is globbed, `native/*` is not) in `AGENTS.md` and the adding-a-package
cookbook, so future native addons do not repeat the silent-membership trap.
