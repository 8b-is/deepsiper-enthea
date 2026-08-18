# eval-entheai

An MVP eval proving the DeepSeek Harness against a **self-hosted,
OpenAI-compatible backend** ("entheai") through the `llm-pi-ai` hand-declared
route, driven as an **agent eval** by the headless profile, scored by an
**external grader** (no eval framework). The eval is deterministic: one task,
one turn, one benchmark.

The pieces:

- [`entheai.cordis.yml`](entheai.cordis.yml) — a `dsh --patch` overlay for
  `--profile headless`. It patches the `llm-pi-ai` row (already mounted
  dormant by the `dsh-base` bundle) with a hand-declared `entheai` provider
  route (`api: openai-completions`, `baseURL` from `ENTHEAI_BASE_URL`,
  `apiKeyEnv: ENTHEAI_API_KEY`, model `entheai-ultra`), points the
  `agent-default-model` row at that route, and pins an output-only persona.
- [`task.md`](task.md) — the benchmark: write `fizzbuzz(n)`, output only the
  function source.
- [`grader.py`](grader.py) — pure-stdlib grader: extracts `def fizzbuzz`,
  `exec`s it, runs `fizzbuzz(1)`–`fizzbuzz(15)` plus `30`, `45`, `100`, prints
  one verdict line, exits 0 on pass / 1 on fail.
- [`run.sh`](run.sh) — one-shot runner (exports defaults, runs dsh, grades,
  echoes the verdict and exit code).

## Requirements

- The harness checkout installed once: `pnpm install` at the repo root.
- A running OpenAI-compatible server; `ENTHEAI_BASE_URL` defaults to
  `http://127.0.0.1:8000/v1`, `ENTHEAI_API_KEY` defaults to `entheai-local`
  (any non-blank key passes the harness; set the real one for a server that
  validates it).
- `python3` for the grader.

## Run it

All commands run from the repo root (pnpm workspace scripts resolve there;
that is why the paths carry the `examples/eval-entheai/` prefix). First check
the composed tree — this needs no backend and no task:

```sh
pnpm dsh --profile headless --patch examples/eval-entheai/entheai.cordis.yml --dump-config
```

Then the real run, saving the agent's output:

```sh
ENTHEAI_BASE_URL=${ENTHEAI_BASE_URL:-http://127.0.0.1:8000/v1} \
ENTHEAI_API_KEY=${ENTHEAI_API_KEY:-entheai-local} \
pnpm dsh --profile headless \
  --patch examples/eval-entheai/entheai.cordis.yml \
  "$(cat examples/eval-entheai/task.md)" \
  | tee examples/eval-entheai/last-output.txt
```

Grade it (file arg or stdin):

```sh
python3 examples/eval-entheai/grader.py examples/eval-entheai/last-output.txt
# or: python3 examples/eval-entheai/grader.py < examples/eval-entheai/last-output.txt
```

One-shot with defaults, verdict and exit code echoed:

```sh
./examples/eval-entheai/run.sh
```

A passing run prints:

```
== dsh --profile headless over entheai (http://127.0.0.1:8000/v1)
== grading the final assistant text (saved to last-output.txt)
PASS: fizzbuzz matches expectations for 18 cases (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 30, 45, 100)
grader exit code: 0
```

## How it works

`dsh --profile headless` composes the `dsh-base` + `dsh-headless` bundles
over an empty root; the overlay patches rows by id, replacing each row's
whole config:

- `llm-pi-ai` supplies the `entheai` provider route. The route key is the
  provider name, so `agent-default-model` selects it; the key resolves per
  request through `ENTHEAI_API_KEY` and fails loud when unset.
- `agent-default-model` is what the headless runner reads
  (`agentDefaultModel.currentSelection()`), so the created agent — task turn,
  title, retries — uses the self-hosted backend only.
- `system-prompt` pins an output-only persona; the `{{model}}` placeholder
  fills from the selection.
- `tools` pins `mode: native` so an exported `DSH_TOOLS_MODE` cannot reshape
  the request mid-eval. No tool mode removes the tool list entirely; the
  persona directs a direct answer, and the grader only reads the final
  assistant text.

The headless runner prints the final assistant message to stdout and exits 0
on a completed turn — that text is the grader's input, so the model's claim
never scores itself.

## Extend with the eval_case tool

To score the agent's output inside the harness instead of grading outside it,
mount the eval tool as an additional overlay: a patch entry targets an
existing row by id, so a NEW row appends via the `insert` list (no id):

```yaml
- insert:
    - id: tool-eval
      name: '@deepseek-ai/dsh-tool-eval'
      config:
        benchmarks:
          fizzbuzz:
            grader: examples/eval-entheai/grader.py
            exec: python3
            cases: 18
```

Pass the overlay alongside the entheai one (`--patch
examples/eval-entheai/entheai.cordis.yml --patch
examples/eval-entheai/tool-eval.patch.yml`). The agent can then call
`eval_case(benchmark: "fizzbuzz", output: …)` and read the verdict
`{ benchmark, pass, exitCode, detail }` directly. The grader still runs
un-sandboxed (it `exec`s the extracted source), so grade only output you
intend to run.


## Keyless E2E with the stub server

[`stub-server.py`](stub-server.py) is a deterministic, pure-stdlib
OpenAI-compatible chat-completions stub for keyless end-to-end runs: it serves
a canned `fizzbuzz` answer over SSE on `http://127.0.0.1:8000/v1`, so the
grader PASSes. Override the answer with `STUB_ANSWER` or
`STUB_ANSWER_FILE` (a file path). Start it in one terminal, then run
`./examples/eval-entheai/run.sh` in another:

```sh
python3 examples/eval-entheai/stub-server.py   # terminal 1
ENTHEAI_BASE_URL=http://127.0.0.1:8000/v1 ./examples/eval-entheai/run.sh  # terminal 2
```

The stub answers every request with the same canned text — it exercises the
harness pipeline (headless profile, pi-ai route, SSE parsing, grading), not
the model.
## Notes

- `${ENTHEAI_BASE_URL:-…}` is shell syntax. The YAML loader evaluates `!!js`
  expressions, not `${VAR}` interpolation, so the overlay uses
  `!!js "process.env.ENTHEAI_BASE_URL ?? 'http://127.0.0.1:8000/v1'"` — the
  exact default in loader spelling; `run.sh` exports the same default in
  shell spelling.
- The grader `exec`s the extracted source un-sandboxed. That is fine for a
  local MVP against a trusted model; do not run it on untrusted output.
- `grader.py` exits 0 on pass, 1 on fail, 2 on usage error.
