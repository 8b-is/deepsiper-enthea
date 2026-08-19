# dsh-commands-superpowers

[English](README.md) | 中文

核心 superpowers 斜杠命令，从工作区的 superpowers skill 集改编进 harness 的 `ctx.commands` seam。三个命令：

- `/brainstorm <idea>` — 苏格拉底式想法探索：subagent 揭示假设、权衡与边界情况，最后以最重要的澄清问题与想法的精炼陈述收尾。
- `/sdd <task>` — **subagent 驱动开发，复杂工作的默认流程。** planner subagent 产出具体计划，implementer 在会话工作区执行，reviewer 验证 diff——结果返回全部三个阶段。
- `/worktree create <branch> | list | remove <branch>` — 原生 git worktree 用法：`create` 在 `<repoRoot>/.dsh-worktrees/<branch>` 下启动隔离的任务通道，`list` 显示通道，`remove` 拆除一个。

## 模型体验

`/sdd` 是复杂多步任务的推荐入口：它把规划、实现与审查拆成独立的聚焦 subagent 运行，而不是在一轮里做完，并一并报告计划、实现报告与审查裁决。`/brainstorm` 用于规划前的探索阶段。`/worktree` 给每个任务一个隔离的 git worktree，让并行通道永不冲突工作树。

## 配置

| Key | 默认值 | 含义 |
|-----|--------|------|
| `provider` | `spawn` | 支撑 brainstorm/sdd 阶段的 subagent provider |
| `maxDepth` | — | 可选的委派深度上限；仅在设置时才传给 `subagents.start`（没有 `depthLimit` 能力的 provider 仍可用） |
| `worktreeRoot` | `<repoRoot>/.dsh-worktrees` | worktree 的父目录 |

## 要求

- `brainstorm`/`sdd` 需要带已挂载 provider 的 `ctx.subagents`；否则显式失败。
- `worktree` 需要 `ctx.shell` 与会话 cwd 上的真实 git 仓库；两者都惰性解析，缺失时显式失败。

## 已知限制与待办

- `/sdd` 在一次命令调用中串行运行三个阶段；还没有交互式"审查后重新规划"循环——审查裁决会被报告，后续的 `/sdd` 是手动续接路径。
- `create` 总是使用 `-b <branch>`；尚不支持在已有分支上创建。
- 双语 README 同步已由本次仓库 doc-sync 完成。