# Agent Note: Benchmark harness as a core gate + ULTRA-LSP in core

Status: implemented

## Problem

The empirical benchmark sweep (`examples/eval-entheai/driver/benchmark_sweep.py`,
5 AST/logic tasks over the headless dsh runtime against a deterministic inline
stub) was not wired into the harness: it ran via bare `python3` with no
package.json command, its `is_pure_syntax` validator existed as untracked
scratch at the repo root, and its per-trial subprocess timeout was hardcoded
at 30s while the harness boots in ~55s on this machine (every trial timed
out). Separately, the LSP capability seam (`@deepseek-ai/dsh-lsp`,
`lsp-stdio`, `tool-lsp`) was complete but not part of the core composition —
the `lsp` tool was absent from `dsh-base`, so core agents had no
language-server code intelligence.

## Decision

1. **Benchmark harness as a first-class gate.** Moved the validator to
   `examples/eval-entheai/driver/is_pure_syntax.py` as the canonical module;
   the sweep imports it and asserts it matches the AST benchmark answer's
   behavior before grading (single source of truth). Added a stdlib-only
   keyless verifier `verify_sweep.py` (no dsh runtime, no pytest) that runs
   `extract_and_exec` over all five reference answers and grades them.
   Registered `bench:entheai` and `bench:entheai:verify` as uv-first pnpm
   scripts; documented both in `BENCHMARK.md` and the root README. The trial
   timeout is configurable via `SWEEP_TRIAL_TIMEOUT_S` (default 120) per the
   no-hardcoded-tunables convention. Deleted the root scratch and
   `__pycache__`.
2. **ULTRA-LSP into core.** Mounted the LSP seam, the stdio provider
   (TypeScript/JavaScript via pinned `typescript-language-server@5.0.0`
   through `npx`), and the `lsp` tool as rows of the `dsh-base` bundle patch,
   with the three workspace dependencies added to the bundle manifest. The
   tool fails `LSP_UNAVAILABLE` until a provider registers; deployments
   without `npx` override the server list through their profile patch.

## Verification

- `pnpm bench:entheai:verify` passes (5/5 reference answers extract and
  grade; canonical validator OK).
- `pnpm bench:entheai` runs the full sweep against the inline stub: **100%
  pass across all five tasks** (2/2 trials each); report written to
  `benchmark_report.json`.
- `verify-cordis-config` passes (123 config files); base bundle tests 2/2;
  translation pairing recorded.
- Headless core boot with ULTRA-LSP mounted succeeds (exit 0), confirming the
  LSP seam + stdio provider (npx resolved at load) + tool compose cleanly
  into the core bundle.
- `pnpm-lock.yaml` diff is only the three new workspace links.

## Alternatives considered

- **Adding `workspaceSymbols` as a fifth LSP operation** — rejected: the seam
  explicitly scopes itself to the four point queries and records that symbols
  need a different schema; the core-integration change stays on the existing,
  tested contract.
- **Fixing the trial timeout by raising the constant** — rejected in favor of
  `SWEEP_TRIAL_TIMEOUT_S`, matching the no-hardcoded-tunables convention.
- **Leaving LSP out of core and documenting opt-in** — rejected by directive:
  ULTRA-LSP is a core capability now.
