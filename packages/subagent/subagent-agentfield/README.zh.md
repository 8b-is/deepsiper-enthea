# @deepseek-ai/dsh-subagent-agentfield

[English](README.md) | 中文

AgentField `swe_af` 一次性 subagent provider。每次接受的运行都通过其 async-execute REST API 将任务派发给 AgentField 控制面的 `swe_af.solve_issue` reasoner，轮询直到结算，并把最终结果作为子级输出返回。注册 `agentfield` subagent provider（远程，无启动期能力）。

## 配置

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

| Key | 默认值 | 含义 |
|---|---|---|
| `controlPlaneUrl` | `http://100.105.72.88:8085` | AgentField 控制面基础 URL。 |
| `target` | `swe_af.solve_issue` | `node.reasoner` 点分形式的目标 reasoner（发现用的 `:` 会被规范化）。 |
| `model` | — | 可选的模型覆盖，随输入 kwargs 传递。 |
| `pollIntervalMs` | `2000` | 轮询节奏。 |
| `timeoutMs` | `300_000` | 硬性轮询截止时间。 |

## 语义

- **异步派发 + 轮询**：向 `/api/v1/execute/async/<target>` POST `{ input: { issue: { title, body }, model?, repo_path? } }`，然后轮询 `/api/v1/executions/<id>` 直到 `succeeded`/`failed`/超时。`body` 是任务文本；`repo_path` 是父会话的 cwd（当它存在时）。
- **远程一次性运行**：`SubagentRun.localAgent` 为 `undefined`；`dispose` 停止轮询器。失败的执行映射为 `stopReason: 'error'`，携带控制面的错误详情；取消映射为 `aborted`。

## 模型体验

无 — 模型通过标准 subagent 工具委派；子级输出是 swe_af 的结果文本。

## 已知限制与待办

- **无流式输出** — swe_af 返回最终结果；没有增量子级输出，因此长时间的求解只在完成时呈现。
- **需要可达的控制面与有额度的模型** — 派发无需凭据即可工作，但没有有额度的模型覆盖时执行会失败（例如 OpenRouter 402）。
- **无续接** — 仅一次性；不支持可续接的子级。
- **仅轮询式取消** — dispose 停止轮询，但不会取消控制面上的远程执行。