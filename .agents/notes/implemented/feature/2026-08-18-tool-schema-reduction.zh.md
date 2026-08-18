# Agent Note：工具 schema 缩减调节器 + KOMPRESS v2 共识评测

状态：已实现

[English](2026-08-18-tool-schema-reduction.md) | 中文

## 问题

工具 schema 主导系统提示词：在固定的 ACP 快照中，它们占约 30KB 组装输入中的 21.4KB——
散文提示词只有 3.5KB。最大来源是冗长的工具描述（`workflow` 2.5KB、`bash` 1.8KB）、
参数级散文，以及每个 agent 挂载的、一轮很少用到的整组工具。另外，KOMPRESS v2 的
几何平均共识蒸馏在 harness 侧没有对应的推理端实现。

## 决策

**`system-prompt` 中的工具 schema 调节器**——`contextTokenBudget` 的兄弟：

- `compactToolSchemas`（默认 `true`）递归剥离组装工具 schema 中的 JSON-Schema 线噪声
  （`examples`、`default`、`additionalProperties`）——确定性，且不丢失任何面向模型的
  名称/描述/指导。
- `toolSchemaBytes`（可选）限制序列化 schema 负载；超限时，先截断最长的工具描述、再
  截断最长的参数属性描述（以 `…` 结尾，不低于下限）直至适配。裁剪后的 schema 正是
  模型收到、持久化 header 记录的内容（模型可见即日志记录成立）。

**精简的按 agent 工具限制**——`@deepseek-ai/dsh-lean-tools` 在 `agent/created` 时通过
`agent.ctx.tools.restrict()` 为每个 agent 拒绝重型编排工具（`ralph`、`subagent_fork`、
`workflow`）；挂载进基础 bundle，使每个 profile 的工具面缩小。基础 bundle 还把会话持久化
改为门控：设置 `DSH_PG_URL` 时用 Postgres 总线，否则用 JSONL——保证无钥快照套件可确定
复现（无在线总线冲突、无实时变化的主机上下文）。

**KOMPRESS-v2 共识评测**——`@deepseek-ai/dsh-eval-consensus` 把同一任务跑过配置的
Council 模型路由，并用几何平均式一致（Jaccard 支持 + 几何平均置信度）聚合，即论文
训练期共识的推理端类比。失败的路由被报告并排除，绝不毒化结论。

## 备选方案

**在源码里硬性限制每个工具描述。** 已否决：`workflow` 与 `bash` 的描述承载真实行为
契约（hooks、升级策略）；字节上限只在预算压力下裁剪，而非无条件降级。

**在基础 bundle 默认里带上 host-info/crabcc。** 已否决：host-info 的运行时上下文每次
运行都会变化（可用内存），破坏确定性回放；crabcc 工具又增加 schema 重量——二者都应作为
可选覆盖。

## 后果

默认 profile 通过限制去掉约 7KB 工具 schema，并裁剪其余噪声；`text-turn` 从 21.4KB
降到约 19.7KB schema，每个 profile 可用精简集。快照已无钥重录（`test:snapshot:refresh`）。
部署可用 `toolSchemaBytes` 进一步收紧。共识评测 lane 为 harness 提供了 Council 式推理
聚合器，可接入任意配置的 provider；logits 级几何平均（KOMPRESS v2 的精确配方）在适配器
暴露 logprobs 前暂缓。
