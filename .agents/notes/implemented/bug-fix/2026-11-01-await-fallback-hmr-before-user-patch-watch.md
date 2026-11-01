# Agent Note: Await the fallback HMR fiber before watching user patches

Status: implemented

English | [中文](2026-11-01-await-fallback-hmr-before-user-patch-watch.zh.md)

## Problem

`dsh --profile web` bound its port and then crashed with `dsh: user patch-layer watching requires the Cordis HMR service`. The web bundle disables the shared `hmr` row, so `runProfile` mounts a config-only HMR instance as a fallback. `ctx.loader.create` resolves the entry id when the entry is created, not when its fiber activates, and `watchUserPatches` reads `ctx.get('hmr')` synchronously. On this path the service could still be absent, so the launcher threw after the tree had already booted.

## Decision

After creating the fallback timer and HMR entries, `runProfile` awaits `ctx.loader.await()` so the fibers settle before `watchUserPatches` runs. The wait sits inside the existing "no HMR service" branch, so a composition that mounts HMR itself pays nothing.

## Alternatives considered

**Enable the shared `hmr` row for web.** Rejected: the web bundle disables it because its module-reload lifecycle is untested, and the fallback deliberately mounts HMR with no module roots.

**Skip watching when HMR is unavailable.** Rejected: the live profile patch layer is a documented contract; a silent skip would break hot reload on every long-lived surface.

**Poll `ctx.get('hmr')` until it appears.** Rejected: it hides a failed fiber behind a timeout and adds startup latency for a state the loader can already settle.

## Consequences

`dsh --profile web` boots and serves on the composed port; the wait covers both the timer entry and the HMR entry.

A fallback HMR fiber that fails to activate now surfaces as its own loader error instead of the misleading "requires HMR" message.

The live-profile hot-reload e2e remains the behavioral test; it exercises the same no-HMR composition.
