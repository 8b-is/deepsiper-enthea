# Agent Note: Cordis ergonomics — proxy-safe services + sync disposal

Status: implemented

## Problem

Two Cordis framework frictions, both hit in production code:

1. **The traceable-context proxy breaks `this`-identity.** `ctx.<service>` access
   re-invokes methods with a shadow proxy as `this`, so a service class with
   `#private` members throws `TypeError: Receiver must be an instance of
   <Class>` at runtime — only when called through `ctx` (the path every
   consumer uses). The `dsh-quant` seam shipped with a private helper and
   failed at runtime; the fix (module-level function) was a workaround, not a
   contract.
2. **`ctx.effect` disposers are `Promise<void>`; seams want sync disposers.**
   The LSP and quant registries both carried `() => void dispose()` — an
   unhandled-rejection / ordering footgun, duplicated per registry.

## Decision

1. **Proxy-safe service contract, enforced by a static gate.**
   `scripts/verify-proxy-safe-services.ts` (TS compiler API) scans
   `packages/<group>/<pkg>/src` and flags `#private` members on any class that
   `extends Service` or is assigned to a `ctx.` slot. Wired into the static
   gates (`run-gates.ts` `ci-static` stage) as `verify-proxy-safe-services`.
   Positive/negative fixture tests prove the scan. Prose rule added to
   `packages/AGENTS.md`: services on `ctx` must not use `#private`.
2. **Sync disposal seam.** New `@deepseek-ai/dsh-effect-sync` util:
   `effectSync(ctx, setup, label)` returns a sync, idempotent disposer with
   the same fiber-scoped lifecycle as `ctx.effect`, logging the async reject
   path (`[effect-sync:<label>] effect dispose failed`) instead of leaving it
   unhandled. The `dsh-lsp` and `dsh-quant` seam `registerProvider` methods
   migrated to it, deleting the `() => void dispose()` workaround.

## Verification

- effect-sync 5/5 (setup sync, teardown once, double-dispose no-op, fiber
  disposal, logged reject path); gate fixtures 4/4; LSP + quant seams still
  green after migration (197 total across the touched suites).
- `verify-proxy-safe-services` exits 0 on the repo; wired into `ci-static`.
- Host `tsc -b tsconfig.host.json` clean; `pnpm lint` clean;
  `verify-package-invariants` 239 conform (new package included).

## Alternatives considered

- **Patching vendored Cordis** — rejected: the fixes live at the harness seam,
  not inside the framework, so upstream syncs cannot clobber them and the
  rules apply repo-wide.
- **A runtime guard instead of the AST gate** — rejected: proxy-proxy identity
  can't be detected at service-registration time cheaply; a load-time AST gate
  is deterministic and CI-enforced.

## Deferred work

- `effectSync` rejects are logged, not surfaced (documented limitation);
  callers needing reactive disposal failures use `ctx.effect` directly.
- Other seams may migrate to `effectSync` opportunistically; only LSP and
  quant did in this cycle.
