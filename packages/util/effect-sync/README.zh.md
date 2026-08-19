# @deepseek-ai/dsh-effect-sync

[English](README.md) | 中文

Cordis `ctx.effect` 之上的同步 disposer 缝。注册表（provider 注册、服务生命周期）暴露同步 dispose API，但 `ctx.effect` 返回异步 disposer——历史上的变通是 `() => void dispose()`，丢弃 promise。`effectSync` 为调用方提供同步、幂等的 disposer，生命周期与 fiber 一致，并把异步 reject 路径路由到结构化日志而不是未处理的 rejection。

## API

```ts
effectSync(
  ctx: Context,
  setup: (registerTeardown: (teardown: () => void) => void) => void,
  label: string,
): () => void
```

- `setup` 在调用时同步执行；用 `registerTeardown(cleanup)` 交回 teardown。
- 返回的 disposer 恰好运行一次 teardown——在首次显式 `dispose()` 或 fiber 释放时（以先到者为准）——且幂等。
- 显式 dispose 时释放异步 `ctx.effect` disposer；reject 以 `[effect-sync:<label>] effect dispose failed` 记录，绝不留下未处理的 rejection。

## Model Experience

无；纯工具，无面向模型表面。

#### Token effect

无。

#### KV Cache effect

无。

## Known Limitations and Deferred Work

- **异步 reject 路径只记录、不返回给调用方** —— `effectSync` 无法把异步释放失败传播给同步调用者；失败只能通过结构化日志行可见。需要响应释放失败的调用方应直接使用 `ctx.effect`。
