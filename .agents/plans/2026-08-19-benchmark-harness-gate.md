# Spec — Benchmark harness as a first-class foundation gate

Status: spec (pending implementation)
Date: 2026-08-19
Owner: deepsiper-enthea (8b-is/deepsiper-enthea)
Process: learn-harness-engineering — instructions / state / verification / scope / lifecycle

## 1. Problem (brainstorm)

The multi-case AST + logic benchmark sweep (`examples/eval-entheai/driver/benchmark_sweep.py`)
is the repo's empirical verification surface for the headless runtime over the
self-hosted entheai route. It is healthy (baseline 100% / 5 tasks), but it is
not wired into the harness:

- **Invocation is an orphan** — `BENCHMARK.md` says `python3 examples/eval-entheai/driver/benchmark_sweep.py`,
  bare `python3` (workspace rule: Python via `uv`), no package.json script, no gate.
- **Two copies of the same validator** — the AST benchmark (`ast_invariant`)
  carries an inline `is_pure_syntax` and an untracked scratch
  `is_pure_syntax.py` sits at the repo root (harness dirt; "repo as source of
  truth" violation). The scratch file is referenced nowhere.
- **The sweep's pure-Python grading logic is unregressed** — `extract_and_exec`
  and the five grader lambdas have no keyless test; a bad refactor would
  silently change the 100% baseline without a dsh run.

## 2. Design

One canonical, stdlib-only, keyless foundation module plus a uv-first harness
command, with the sweep's pure-Python core regression-tested independently of
the dsh runtime.

- `examples/eval-entheai/driver/is_pure_syntax.py` — canonical `is_pure_syntax(code)`
  validator (moved from the repo-root scratch, docstring kept complete).
- `benchmark_sweep.py` imports the canonical module and asserts its behavior
  matches the AST benchmark's expected answer semantics before running
  (single source of truth at grading time).
- `examples/eval-entheai/driver/verify_sweep.py` — stdlib-only keyless
  verifier (no pytest dependency): imports the sweep module, runs
  `extract_and_exec` over all five reference `answer`s, executes each grader
  lambda, and checks canonical `is_pure_syntax` both ways. Prints one verdict
  line, exits 0 on pass / 1 on fail.
- `package.json`: `"bench:entheai": "uv run --script examples/eval-entheai/driver/benchmark_sweep.py"`
  and `"bench:entheai:verify": "uv run --script examples/eval-entheai/driver/verify_sweep.py"`.
- Delete the repo-root scratch `is_pure_syntax.py` and `__pycache__/`.
- `BENCHMARK.md`: invoke via `pnpm bench:entheai`; document `pnpm bench:entheai:verify`
  as the keyless fast gate.
- `benchmark_sweep.py`: the per-trial subprocess timeout was hardcoded at 30s
  and the headless harness boots in ~55s on this machine (verified live), so
  the trial timeout is now configurable via `SWEEP_TRIAL_TIMEOUT_S`
  (default 120), per the repo's no-hardcoded-tunables convention.

## 3. Acceptance (verification)

1. `pnpm bench:entheai:verify` passes (keyless, no dsh runtime) — all five
   reference answers extract + grade, canonical validator both directions.
2. `pnpm bench:entheai` runs the sweep against the inline stub (port 8899)
   and reports 100% pass across the five tasks (2 trials each).
3. `uv` is the only Python entrypoint (no bare `python3` in changed docs/scripts).
4. No untracked scratch remains at the repo root (git status clean for the
   moved/deleted files).
5. Repo gates unaffected: `pnpm typecheck` clean (no TS touched; package.json
   scripts only), no lockfile change.

## 4. Scope

- In: the five files above, `BENCHMARK.md`, `package.json` scripts.
- Out: no dsh/TS runtime change, no CI workflow change, no benchmark task
  semantics change, no version bump (release follows this spec in a separate
  step).
