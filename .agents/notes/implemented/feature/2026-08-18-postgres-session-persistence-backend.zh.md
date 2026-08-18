# Agent Note：本地 Postgres 持久化会话后端

状态：已实现

[English](2026-08-18-postgres-session-persistence-backend.md) | 中文

## 问题

harness 的会话日志是每次模型可见交互的无损、可重放记录，但它只写入进程本地的文件或
SQLite。操作者希望有一个**本地 Postgres 持久化存储**——一个把日志外部化到同主机上可
查询、可 NOTIFY 的数据库的事件总线 sidecar，且**无远程同步**。它必须保留协调器已经提供
的完全相同的持久化语义（连续性、崩溃尾部修复、惰性物化、修订号），使任何编排逻辑都不
必改动。

## 决策

**`@deepseek-ai/dsh-session-persistence-postgres` 与 SQLite 后端一样实现
`PersistenceBackend<number>`**，将写路径编排委托给共享的 `PersistenceCoordinator`。
`dsh_events` 中每个 `SessionEvent` 一行，`(session_id, seq)` 为主键——harness 的 `seq`
就是排序键；`dsh_sessions` 保存带 `incarnation`/`revision` 变更 token 的 header；
`dsh_bus_state` 在每个数据库上铸造一次存储身份。`appendBatch` 与 `commitRepair` 是
单事务（惰性物化 + 插入，或整体回滚；截断 + closers）。崩溃尾部是 seq 间隙——Postgres
事务是原子的，因此文件后端那种"部分行"不可能出现，`scanRows` 以最后一个 `turn/end`
为界保留前缀。

**提交后 NOTIFY 是可丢失的加速器。** 每个已提交批次在 `dsh_session_events` 通道上发布
`{ sid, lo, hi }`；消费者对照表回查。通知失败永远不会导致 append 失败（可注入的
notifier 是测试缝——pg-mem 无法运行 `pg_notify`）。

**默认保留策略是无损无限**（它是主要持久化存储；裁剪会破坏 `model-visible ⟺ logged`
的重构），按月分区与显式可选裁剪暂缓，置于 schema 升级之后。

## 备选方案

**把本地 JSONL/SQLite 镜像到总线上。** 已否决：操作者要求无远程同步，且总线就是主要
存储，因此镜像只会增加一份没有消费者的重复持久化契约。

**只复用 SQLite 并加上 pgvector。** 已否决：事件总线需要 Postgres 作为持久化介质
（LISTEN/NOTIFY + 可查询事件），而不是嵌入式文件。

**为 crabcc 符号/引用结果单开缓存包。** 暂缓到后续：会话日志与 crabcc 的符号/引用缓存
是不同产物，将作为同一本地总线上的不同 Postgres 表落地。

## 后果

主机现在可以把总线挂为 `ctx.sessionPersistence`，获得与协调器语义完全一致的 Postgres
持久化；组装后的快照写入持久的 `dsh_events` 行，NOTIFY 唤醒本地消费者。测试在 pg-mem
上运行与 JSONL/SQLite 相同的后端无关持久化 + 协调器契约套件（src 覆盖 100%），钉死
逐字节的语义对等。真实 `pg` 驱动路径（bigint 返回字符串、连接行为）由类型转换处理，
但只在带真实本地 Postgres 的 e2e 中完整验证——即 ROYAL-WHALE 接线步骤。
