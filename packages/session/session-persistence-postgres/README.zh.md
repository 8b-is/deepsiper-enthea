# @deepseek-ai/dsh-session-persistence-postgres

[English](README.md) | 中文

本地 Postgres 持久 session 持久化后端（事件总线 sidecar）。它将每个 session 头与事件映射到**本地** Postgres 数据库的行——即该宿主机上 harness 的持久存储，无远程同步。写路径编排委托给 `PersistenceCoordinator`，因此它继承与 JSONL 和 SQLite 后端完全相同的 per-id 串行化、连续性强制、崩溃尾部修复、写后合并与 `seedCoversPrefix` 收养语义，只是介质换成了 Postgres。每个已提交批次后，它在 `pg_notify` 上发布一个小的指针，让本地消费者（可观测性、embedding 管道、honcho）可以尾随总线。完整设计：`postgres-event-bus-sidecar.md`（workspace）。

## 配置

```yaml
- id: session-persistence-postgres
  name: '@deepseek-ai/dsh-session-persistence-postgres'
  config:
    connectionString: postgres://dsh:…@localhost:5432/dsh_bus
```

| Key | 默认值 | 含义 |
|---|---|---|
| `connectionString` | — | Postgres DSN。除非 `createPool` 覆盖提供了连接池（测试 seam），否则必填。 |
| `notify` | `pg_notify` | 提交后通知器覆盖。默认在 `dsh_session_events` 频道发布批次指针 `{ sid, lo, hi }`。NOTIFY 是**可丢失的加速器**——表是真相来源，因此通知失败永远不会使 append 失败。 |
| `preparedSessionCacheSize` | `DEFAULT_PREPARED_SESSION_CACHE_SIZE` | 为历史恢复复用保留的最大冷准备数。 |
| `writeBatchMaxDelayMs` | `DEFAULT_WRITE_BATCH_MAX_DELAY_MS` | 固定的事件合并窗口。 |

## 语义

- **每次变更一个事务。** `appendBatch` 惰性物化 `dsh_sessions` 行并原子插入每个事件；批中失败（重复 `seq`）会回滚并保持日志不动。`commitRepair` 在一个事务中截断撕裂的尾部并追加合成的 closers。
- **撕裂尾部即 seq 间隙。** Postgres 事务是原子的，因此部分行不可能存在；撕裂尾部契约通过 `scanRows` 保留——将保留前缀限定在最后一个 `turn/end`，并把之后的 seq 间隙视为从未提交、应删除的尾部。
- **修订是存储限定的。** `pg:store:<storeId>:incarnation:<incarnation>:revision:<revision>`，每个数据库在 `dsh_bus_state` 中铸造一次，并在重载间保留。
- **Bigint 列被强转。** 真实 `pg` 以字符串返回 `int8`；行助手强转为安全整数。
- **JSONB 负载。** 事件 `data` 与表面列是 `jsonb`；harness 的无损保证是结构性的（`isDeepEqualJson`），JSONB 保留它。

## 开发

测试针对 **pg-mem**（内存版 Postgres 模拟器）运行：与 JSONL/SQLite 相同的后端无关持久化与协调器契约套件，加上后端机制测试。pg-mem 无法运行 `pg_notify`，因此测试注入记录器；默认通知器针对 mock 连接池做单元测试。

```sh
pnpm test   # vitest: contract suites + mechanics, 100% src coverage
```

## 模型体验

无 — 这是持久存储；没有任何内容进入模型请求。

## 已知限制与待办

- **按月分区推迟** — `dsh_events` 第一段是普通表；保留默认无损无限，分区（用于可运维/裁剪）以 `BUS_SCHEMA_VERSION` 提升的形式落地。
- **尚无全局 `id` 列** — 设计的可观测性扇出标识与 `dsh_event_embeddings`/`dsh_consumer_checkpoints` 表随分区一起推迟。
- **真实 `pg` 路径仅对活服务器演练** — pg-mem 覆盖 SQL 语义；`pg` 驱动的 bigint-as-string 与连接行为由强转处理，但只在真实本地 Postgres 的 e2e（ROYAL-WHALE 接线步骤）中验证。
- **`connectionString` 是生产配置** — 在进程中嵌入总线需要显式 DSN 或 `createPool` 子类。