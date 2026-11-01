# Agent Note: Clear the fork's pre-existing e2e gate drift

Status: implemented

[English](2026-11-01-fork-e2e-gate-drift.md) | 中文

## Problem

在本变更之前，该 fork 的 `pnpm run test` 就是红的：`tool-quant` 不在工具模式清单中，`ctx.quant` 没有 Cordis 目录页，`skill-crabcc` 的 invariant 在没有错误监听器的情况下启动了一个缺失的可选 CLI（未捕获的 `spawn crabcc ENOENT` 加五秒挂起），Oxlint 可执行契约假设显式路径会绕过 `.gitignore`，grader 超时被归类为信号杀死，而用户补丁 watch 测试只等 10 秒 chokidar 投递，并发测试套件可以拖慢它。已知为红的套件会掩盖下一次回归，并阻塞文档化的推送前检查。

## Decision

将 `tool-quant` 接入 `scripts/gen-tool-catalog.ts`（挂载 `Quant`、`QuantReference`、`ToolQuant`），并重新生成 `docs/tool-catalog.md`。

把 `ctx.quant` 映射到新的 `docs/subsystems/quant.md` 双语对，在 `website/docs.ts` 注册，在两份子系统 README 中建立索引，并通过 `TYPE_LINK_EXEMPTIONS` 归类 `QuantProvider`、`QuantRequest` 与 `QuantResult`，因为服务 README 拥有它们。

把 `crabcc` CLI 视为可选外部工具：在 stdio 监听器之前挂上 invariant 的 `error` 监听器，在 `ENOENT` 时解析且不产生失败发现，非零退出仍是失败，并在 `isCrabccAvailable` 为 false 时自跳过真实 CLI 的 e2e 套件。

在 `tool-eval` 中先检查 `timedOut` 再检查 `exitCode === null`，使超时的 grader 报告超时契约。

不再在 `.gitignore` 中忽略临时 Oxlint 契约探针：Oxlint 1.78 会让显式传入的路径也经过 `.gitignore` 过滤，因此被忽略的探针名从未到达 linter。

只把 default-compose 用户补丁 watch 的等待放宽到 30 秒、其测试超时放宽到 45 秒；watcher 就绪已经被等待，剩下的变量是并发负载下的投递延迟。

在 `docs/backends/osarous.md` 记录 hf-mac 的 Osaurus 接缝，并从 README 的两个语言侧链接它。

## Alternatives considered

**保留红灯并记录它们。** 否决：已知为红的套件无法把下一次回归与积压分开，而且推送前流程运行同样的门禁。

**要求安装 `crabcc` 而不是做防护。** 否决：该 skill 在没有该二进制时本就会降级，因此 invariant 发现会让 harness 检查依赖一个可选开发者工具。

**重命名 Oxlint 探针而不是取消忽略。** 否决：同一个 `.gitignore` 会继续隐藏未来的探针产物，而这些测试已经在 `finally` 中删除它们。

**全局提高用户补丁 watch 超时。** 否决：10 秒默认值对该文件中的其他等待都足够；只有 watch 投递场景表现出并发敏感性。

## Consequences

`pnpm run test` 重新变绿（`13930 passed, 124 skipped, 0 failed, 0 uncaught`），每个重新生成的产物都在本变更中一起交付。

其余文档门禁仍为红，留作单独跟进：失效的 README 锚点、超出词数上限的 `packages/README.md`、描述旧形状的 `CouncilReport` type-equiv 块，以及缺失的中文包 README。

如果 Oxlint 之后不再对显式路径应用 `.gitignore`，这些未忽略的探针也无害；在没有重新检查契约测试之前，不应恢复这些忽略项。

Related: [the quant seam](../feature/2026-08-19-quant-seam-core.md).
