# dsh-nu-sandbox

[English](README.md) | 中文

nushell 执行器 seam 的消费 sandbox 实现。扩展 `LocalNuExecutor`，将精确解析后的 nushell argv（`<nuPath> --no-config-file -c <command>`）包进 `ctx.sandbox`，因此 sandbox runner 约束的是 `nu-local` 解析出的同一个确定性 Nix store 路径二进制。

## 模型体验

每条命令都在调用会话的策略约束下运行。被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]` ——这是策略拒绝，而不是命令缺陷。runner 失败（sandbox 自身无法启动）在前台调用上表现为 `SANDBOX_UNAVAILABLE`，在后台进程上表现为 `runnerFailed` 事实。`result.sandbox` 报告实际应用的模式、强制方式与拒绝事实。

## 配置

与 `nu-local` 相同（原样继承）。sandbox 默认模式与工作区根位于 `ctx.sandboxPolicy`，不在此处。

## 已知限制与待办

- `start()` 继承 `nu-local` 的解析预热约束。
- 真实 provider 集成（Landlock/Seatbelt）沿用 bash 通道的 e2e 模式，尚未为本包编写。
- 双语 README 同步已由本次仓库 doc-sync 完成。