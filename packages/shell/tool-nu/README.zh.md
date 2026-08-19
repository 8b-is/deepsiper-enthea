# dsh-tool-nu

[English](README.md) | 中文

面向模型的 nushell Consumer，实现 `ctx.shell` 能力 seam。支持前台与 `run_in_background` 执行、通过共享 `shell-env` 注册表管理的 `DSH_*` 环境、逐调用 sandbox 策略解析与同轮次升级面（通过 `ctx.approval` 的 `sandbox_permissions` + `justification`），以及 bash/pwsh 的 marker 截断渲染故事。

## 模型体验

工具通过 `ctx.shell` 运行 `nu --no-config-file -c <command>`。使用 `$env.NAME` 读取环境变量；使用 nushell 管道（`|`）与内置命令（`ls`、`open`、`get`）。非零退出报告为 `[exit code: N]`，不会报错。被杀死的过程以 `[killed by signal: <signal>]` 结束。较长输出截断至尾部，并报告完整输出的落盘路径。在受限执行器下，被阻止的文件操作是 `[sandbox: file access denied under <mode> mode]` 拒绝——当更宽的模式能让命令成功时，请用 `sandbox_permissions` 精确升级该命令一次。

## 配置

| Key | 默认值 | 含义 |
|-----|--------|------|
| `enableRunInBackground` | `true` | 暴露 `run_in_background`（禁用时相关调用也会被拒绝） |

## 已知限制与待办

- 后台任务需要挂载 `@deepseek-ai/dsh-jobs` + `@deepseek-ai/dsh-tool-jobs`；否则 `run_in_background` 会显式失败。
- sandbox 升级说明刻意与 nushell 平台无关（不像 pwsh 工具那样带有 Windows 特定约束条款）。
- 双语 README 同步已由本次仓库 doc-sync 完成。