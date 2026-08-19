# Spec — Cordis ergonomics: proxy-safe services + sync disposal

Status: spec (pending implementation)
Date: 2026-08-19
Owner: deepsiper-enthea (8b-is/deepsiper-enthea)
Process: learn-harness-engineering — remove a verified failure class at the framework seam

## 1. Problem (brainstorm, evidence from live cycles)

Two Cordis framework frictions, both hit in production code this session:

1. **The traceable-context proxy breaks `this`-identity for service classes.**
   `ctx.<service>` access re-invokes methods with a shadow proxy as `this`, so a
   service class with `#private` fields/methods throws
   `TypeError: Receiver must be an instance of class <X>` — **only when called
   through `ctx`** (the exact path every consumer uses). The `dsh-quant` seam
   shipped with a private helper and failed at runtime; the fix (module-level
   function) is a workaround, not a contract. Every future service author will
   hit the same wall, and the failure is deferred to runtime.
2. **`ctx.effect` disposers are `Promise<void>`; seams want sync disposers.**
   The LSP and quant registries both carry the same line:
   `return () => void dispose()` — discarding a promise is an unhandled-
   rejection / ordering footgun, and it is duplicated in every registry.

## 2. Design

### 2.1 Proxy-safe service contract

- A repo-wide rule, enforced by a new static gate
  `scripts/verify-proxy-safe-services.ts` (AST-based scan of `packages/`):
  **any service class exported/assigned onto `ctx.<name>` must not declare
  `#private` members.** The gate walks the class declarations, checks whether
  the class (or an instance of it) is assigned to a `ctx.<name>` slot
  (service registration), and fails if it uses `#private` syntax. Positive +
  negative fixtures in `scripts/tests/`.
- A prose rule in `packages/AGENTS.md`: "Services registered on `ctx` are
  invoked through the traceable-context proxy — no `#private` fields/methods;
  use module-level helpers or an underscore convention for private state."
- The gate wires into the static gates (`scripts/run-gates.ts` static stage).

### 2.2 Sync disposal seam

- New util package `@deepseek-ai/dsh-effect-sync`
  (`packages/util/effect-sync/`), zero-dependency beyond cordis:
  - `effectSync(ctx, register: (sync: () => void) => void, label: string): () => void` —
    registers an effect whose disposer is a **sync** function. Internally it
    runs the async `ctx.effect` disposer fire-and-forget, but routes the
    rejection to a structured log (no unhandled rejection) and preserves the
    same fiber-scoped lifecycle semantics as `ctx.effect`.
  - `type SyncDisposable = { dispose(): void }` brand helper.
- Migrate `dsh-lsp` and `dsh-quant` registry `registerProvider` to
  `effectSync`, deleting the `() => void dispose()` workaround in both.
- `./invariant` companion with a `No runtime invariant:` reason (pure util;
  behavior test-gated).

## 3. Acceptance (verification)

1. `verify-proxy-safe-services` passes on a clean tree; fails on a negative
   fixture (a service class with `#private` registered on `ctx`) and passes
   on a positive fixture (module-level helper). Fixture tests cover both.
2. `dsh-effect-sync` tests: sync disposer runs the cleanup; rejection is
   logged, never unhandled; fiber-scoped lifecycle preserved (HMR-safety
   test).
3. LSP seam + quant seam tests still pass after migrating to `effectSync`
   (no behavior change).
4. `pnpm lint` + `tsc -b tsconfig.host.json` clean; `verify-package-invariants`
   includes the new package.
5. Repo-wide scan shows zero `#private` in service classes.

## 4. Scope

- In: the `effect-sync` util package, the proxy-safe gate + fixtures, the
  LSP/quant seam migration, `packages/AGENTS.md` rule, Agent Note.
- Out: no vendored-cordis edits (the fixes live at the harness seam, not
  inside the framework), no change to `ctx.effect` semantics for other
  callers.
