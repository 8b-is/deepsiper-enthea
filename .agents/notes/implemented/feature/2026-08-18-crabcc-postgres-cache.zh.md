# Agent Note：crabcc 符号/引用查询的 Postgres 持久化缓存

状态：已实现

[English](2026-08-18-crabcc-postgres-cache.md) | 中文

## 问题

`skill-crabcc` 对每次 `code_search` / `goto_definition` / `find_references`
查询都会启动 crabcc CLI，每次重新解析索引。在长时间的 agent 运行中，同一符号会被
反复查询；在同一本地 Postgres 总线（事件总线 sidecar）上的持久化缓存可以消除这些
多余启动，同时不改变模型看到的内容。

## 决策

**在 `skill-crabcc` 中加入 `CrabccCache` 缝，并提供 Postgres 实现。**
`skill-crabcc` 在工具执行时（`exec.agent.ctx.get`）解析可选的 `ctx.crabccCache`
服务，并让每个工具体走缓存：命中则直接返回缓存结果而不启动；未命中则运行 crabcc
并写穿存储。缓存键覆盖每个查询输入（`(root, kind, query, max_results, include_refs)`），
结果以 JSONB 存储并按字节一致返回，TTL 过期是惰性的（过期读视为未命中），
`invalidate(root?)` 立即删除条目。

**`@deepseek-ai/dsh-crabcc-cache-postgres` 实现该缓存**，使用同一本地总线数据库中的
`crabcc_cache` 表（复用 `pg` 驱动与 pg-mem 测试模式），注册为 `crabccCache` 服务。
缓存读写失败永远不会让工具失败：缓存是优化，不是正确性依赖。

**缓存按键而非按索引感知。** TTL 约束陈旧；`crabcc index` 重建不会在条目过期前被
检测，除非调用方显式失效。

## 备选方案

**把缓存内联进 `skill-crabcc`。** 已否决：缓存需要 Postgres 连接/生命周期与自己的包
约定；独立 provider 让 `skill-crabcc` 保持零依赖，缓存可组合。

**以索引指纹为缓存键。** 暂缓：crabcc 在 harness 可达范围内没有廉价的索引戳，且每次
查询做指纹会适得其反；显式 `invalidate(root)` 覆盖重新索引路径。

**缓存原始 crabcc wire 输出而非工具结果。** 已否决：工具结果才是模型面对的产物，且
变换是确定性的，因此缓存最终结果更简单且同样正确。

## 后果

重复的 crabcc 查询命中本地 Postgres 缓存而不是重新启动 CLI，降低每次查询延迟与索引
重解析，同时保持模型输出按字节一致。总线宕机时缓存降级为直接运行，并受 TTL 约束；
重新索引需要显式失效（文档化的风险）。测试覆盖缝（通过 stub 的 spawn 覆盖
hit/miss/degrade/write-error）与 Postgres 缓存（round-trip、键分离、TTL、失效、
重引导），新包 src 覆盖 100%。
