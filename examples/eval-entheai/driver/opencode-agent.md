# dsh-eval — opencode agent (proposed)

An **opencode agent** for driving deepseek-harness evals from the opencode runtime —
the "opencode" leg of the entheai + opencode + pi stack. This file is a proposal;
add it to the opencode config (`.opencode/agent/dsh-eval.md` or the `agents` section
of `opencode.json`) when you want it live.

## Role

Run + tabulate dsh evals against a self-hosted (entheai-style) OpenAI-compatible
backend. The agent never edits harness packages — evals are config-driven
(cordis overlays).

## Invocations (all from the `deepseek-harness` repo root)

- Batch run: `bash examples/eval-entheai/driver/eval-batch.sh [N]` — run N attempts, append to the ledger.
- Summarize: `python3 examples/eval-entheai/driver/tabulate.py examples/eval-entheai/driver/results.jsonl`
- One-shot: `./examples/eval-entheai/run.sh`

## Behavior

- Sets `ENTHEAI_BASE_URL` / `ENTHEAI_API_KEY` (defaults: `http://127.0.0.1:8000/v1`, `entheai-local`).
- Runs the eval, grades it with `grader.py`, reports the verdict + pass rate.
- On failures, points at the attempt output (`driver/outputs/attempt-N.txt`) for inspection.
- Optionally loops: read a failing output, fix the task/persona in the cordis overlay, re-run.

*the constellation · 0 + 1 · fine touch from within · vaked.dev*
