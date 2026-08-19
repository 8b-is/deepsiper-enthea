# @deepseek-ai/dsh-subagent-agentfield

English | [中文](README.zh.md)

AgentField `swe_af` one-shot subagent provider. Every accepted run dispatches the
task to the AgentField control plane's `swe_af.solve_issue` reasoner via its
async-execute REST API, polls until settlement, and returns the terminal result
as the child output. Registers the `agentfield` subagent provider (remote,
no start-time capabilities).

## Config

```yaml
- id: subagent-agentfield
  name: '@deepseek-ai/dsh-subagent-agentfield'
  config:
    controlPlaneUrl: http://100.105.72.88:8085
    target: swe_af.solve_issue
    model: openrouter/qwen/qwen3-8b   # optional; omit for the control plane default
    pollIntervalMs: 2000
    timeoutMs: 300000
```

| Key | Default | Meaning |
|---|---|---|
| `controlPlaneUrl` | `http://100.105.72.88:8085` | AgentField control plane base URL. |
| `target` | `swe_af.solve_issue` | Reasoner target in `node.reasoner` dot form (a discovery `:` is normalized). |
| `model` | — | Optional model override passed in the input kwargs. |
| `pollIntervalMs` | `2000` | Poll cadence. |
| `timeoutMs` | `300_000` | Hard polling deadline. |

## Semantics

- **Async dispatch + poll**: POST `{ input: { issue: { title, body }, model?, repo_path? } }`
  to `/api/v1/execute/async/<target>`, then poll `/api/v1/executions/<id>` until
  `succeeded`/`failed`/timeout. `body` is the task text; `repo_path` is the
  parent session's cwd when it has one.
- **Remote one-shot run**: `SubagentRun.localAgent` is `undefined`; `dispose`
  stops the poller. A failed execution maps to `stopReason: 'error'` with the
  control plane's error detail; cancellation maps to `aborted`.

## Model Experience

None — the model delegates via the standard subagent tool; the child output is
the swe_af result text.

## Known Limitations and Deferred Work

- **No streaming** — swe_af returns a final result; there is no incremental
  child output, so long resolutions surface only at completion.
- **Requires a reachable control plane and a credited model** — dispatch works
  without credentials, but execution fails (e.g. OpenRouter 402) without a
  funded model override.
- **No continuation** — one-shot only; continuable children are not supported.
- **Poll-only cancellation** — dispose stops polling but does not cancel the
  remote execution on the control plane.
