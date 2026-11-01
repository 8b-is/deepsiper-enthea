# Agent Note: Await the fallback HMR fiber before watching user patches

Status: implemented

[English](2026-11-01-await-fallback-hmr-before-user-patch-watch.md) | 中文

## Problem

`dsh --profile web` 绑定端口后崩溃，报 `dsh: user patch-layer watching requires the Cordis HMR service`。web bundle 禁用了共享的 `hmr` 行，因此 `runProfile` 会挂载一个仅配置的 HMR 实例作为回退。`ctx.loader.create` 在条目创建时解析其 id，而不是在其 fiber 激活时；而 `watchUserPatches` 同步读取 `ctx.get('hmr')`。在这条路径上服务可能仍然缺失，于是启动器在树已经启动之后抛出。

## Decision

创建回退的 timer 与 HMR 条目之后，`runProfile` 等待 `ctx.loader.await()`，让 fiber 在 `watchUserPatches` 运行前完成。该等待位于既有的“无 HMR 服务”分支内，因此自行挂载 HMR 的组合不会付出任何代价。

## Alternatives considered

**为 web 启用共享 `hmr` 行。** 否决：web bundle 禁用它是因为其模块重载生命周期未经测试，而回退路径刻意以无模块根的方式挂载 HMR。

**HMR 不可用时跳过监听。** 否决：实时 profile 补丁层是文档化契约；静默跳过会破坏每个长生命周期表面的热重载。

**轮询 `ctx.get('hmr')` 直到出现。** 否决：这会把失败的 fiber 藏在超时之后，并为一个 loader 本就能完成的状态增加启动延迟。

## Consequences

`dsh --profile web` 在组合端口上启动并提供服务；该等待覆盖 timer 条目与 HMR 条目。

激活失败的回退 HMR fiber 现在会暴露自身的 loader 错误，而不是误导性的“requires HMR”消息。

实时 profile 热重载 e2e 仍是行为测试；它覆盖同一个无 HMR 的组合。
