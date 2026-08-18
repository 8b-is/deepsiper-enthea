# @deepseek-ai/dsh-tool-eval

Agent-in-the-loop eval consumer: registers the `eval_case` tool, which scores
a candidate output against a deployment-configured benchmark grader in a
subprocess (through the `dsh-shell` capability seam) and returns the verdict.
The grader is the sole scoring authority; this plugin executes it, bounds its
output, and maps its exit status. A deployment with no benchmarks fails loud
at load.

## Configuration

```ts
export interface Config {
  benchmarks: Record<string, {
    grader: string   // grader path; relative paths resolve against the harness cwd
    exec?: string    // interpreter, default python3
    cases?: number   // advisory case count, shown to the model
  }>
}
```

Example (the eval-entheai leaf):

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

## Model Experience

### eval_case tool schema

#### What the model sees

The model sees the generated [`eval_case` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-eval): `benchmark` (the configured benchmark ids) and `output` (the candidate output, fed to the grader on stdin). The description names the available benchmarks and warns that the grader may execute the candidate as code. The result is the fixed shape `{ benchmark, pass, exitCode, detail }`, with `detail` the bounded grader stdout (or stderr on crash) verdict.

#### Token effect

Fixed schema cost on every request where the tool is visible. The `detail` field is capped at 8192 characters (a security invariant, not a tunable).

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged; benchmark config changes invalidate reuse from the schema's benchmark list.

### Graded outcome

#### What the model sees

The tool result carries the grader's verdict detail verbatim (bounded), so a failed output can be revised and re-graded in the same conversation.

#### Token effect

Result size scales with the grader's own verdict output, capped at 8192 characters.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **The grader runs un-sandboxed** — `eval_case` executes the configured
  grader with the candidate output on stdin under the operator's privileges;
  grade only output you intend to run.
- **No benchmark framework** — one grader process per call, exit status as the
  verdict; multi-case harnesses, result stores, and pass-rate aggregation are
  out of scope (the eval-entheai driver tabulates a JSONL ledger instead).
- **Relative grader paths resolve against the harness process cwd** — for the
  shipped eval leaves that is the repo root (dsh runs from there); a grader
  launched from another cwd must use an absolute path.
