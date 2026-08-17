# Tool Evaluation (`tool-eval`)

The `tool-eval` plugin provides the `eval_case` tool and automated rubric checking for measuring agent task efficacy and tool call accuracy.

## Capabilities

- **Strict Schema Verification:** Validates tool invocations against JSON Schema specifications.
- **Trajectory Scoring:** Measures step count, token consumption, and goal convergence.
- **Deterministic Replay:** Replays cached sessions to verify regression stability.

## Configuration

Add `tool-eval` to your `cordis.yml` profile:

```yaml
plugins:
  "@deepseek-ai/dsh-tool-eval":
    strictMode: true
    benchmarkDir: "./benchmarks"
    timeoutMs: 30000
```
