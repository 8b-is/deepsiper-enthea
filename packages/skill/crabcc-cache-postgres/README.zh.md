# @deepseek-ai/dsh-crabcc-cache-postgres

[English](README.md) | 中文

[crabcc](https://github.com/8b-is/crabcc) 符号/引用查找的本地 Postgres 持久缓存。挂载本插件会注册 `ctx.crabccCache`；`skill-crabcc` 工具在派生 CLI 之前先查询它，未命中后存储结果，因此重复的符号/定义/引用查询命中总线而不是重新解析 crabcc 索引。条目按 TTL 过期。该缓存是**优化**——总线不可用时 skill-crabcc 降级回直接 CLI 运行，绝不会给出错误答案。

## 配置

```yaml
- id: crabcc-cache-postgres
  name: '@deepseek-ai/dsh-crabcc-cache-postgres'
  config:
    connectionString: postgres://dsh:…@localhost:5432/dsh_bus
    ttlSeconds: 300
```

| Key | 默认值 | 含义 |
|---|---|---|
| `connectionString` | — | Postgres DSN。除非 `createPool` 覆盖提供了连接池，否则必填。与 session-persistence 后端共用同一个本地总线数据库。 |
| `ttlSeconds` | `300` | 条目存活秒数；过期的条目在读取时惰性删除。 |

## 语义

- **键覆盖所有查询输入**：`(root, kind, query, max_results, include_refs)` — 调用方缺省 `limit` 映射为 `0`，保证主键非空。
- **惰性 TTL 过期**：`get` 将 `stored_at` 与截止时间比较；过期条目视为未命中。`invalidate(root?)` 立即删除条目。
- **结果负载是 JSONB** — 存储精确的工具结果并在命中时原样返回，因此无论走哪条路，模型看到的输出语义相同。
- **未命中时写穿**；缓存读或写失败永远不会使工具失败。

## 开发

测试针对 **pg-mem**（内存版 Postgres 模拟器）运行：往返、键分离、TTL 过期、失效、幂等重新引导，以及缺失连接/关闭路径，src 覆盖率 100%。skill-crabcc 的缓存 seam 由 `skill-crabcc/tests/cache-seam.spec.ts`（stub 的 `spawn`）覆盖。

```sh
pnpm test   # vitest: cache mechanics + seam, 100% src coverage
```

## 模型体验

无 — 这是查找缓存；除缓存工具结果本身外，没有内容进入模型请求，而缓存结果与直接 crabcc 运行语义相同。

## 已知限制与待办

- **TTL 限制陈旧度，但不检测重新索引** — `crabcc index` 重建在条目过期前不会被察觉；重建后显式 `invalidate(root)` 可获得即时新鲜度。索引指纹失效已推迟。
- **不是正确性依赖** — 总线不可用或缓慢时静默降级回直接 CLI 运行；目前没有缓存健康遥测。
- **`connectionString` 是生产配置** — 嵌入需要显式 DSN 或 `createPool` 子类。