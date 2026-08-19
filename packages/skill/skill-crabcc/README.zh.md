# @deepseek-ai/dsh-skill-crabcc

[English](README.md) | 中文

将 [crabcc](https://github.com/8b-is/crabcc) 代码索引 CLI 集成为 harness 的三个 agent 工具加一个内置 skill：

| 工具 | crabcc 命令 | 用途 |
|------|------------|------|
| `code_search` | `lookup fuzzy` | 带可选引用计数的模糊符号查找 |
| `goto_definition` | `lookup sym` | 定位符号定义（文件、行、签名） |
| `find_references` | `lookup refs` | 符号的全部使用处，含行/列与片段 |

内置 `crabcc` skill 教会模型何时以及如何使用这三个工具进行代码导航。

## 安装

```bash
pnpm add @deepseek-ai/dsh-skill-crabcc
```

要求 `crabcc` 二进制（6.x）位于 `PATH` 且仓库已建立索引（`crabcc index`）。插件声明 `inject = ['skills']`，并在工具运行时存在时注册其三个工具。

## 配置

```ts
export interface Config {
  crabccBin?: string    // default: 'crabcc'
  defaultRoot?: string  // default: process.cwd()
  providerName?: string // default: 'crabcc'
}
```

每个工具也接受逐调用的 `root` 覆盖；查询默认使用 `defaultRoot`。

## 持久结果缓存

挂载 [`@deepseek-ai/dsh-crabcc-cache-postgres`](../crabcc-cache-postgres/README.md) 会注册 `ctx.crabccCache`；此后工具从持久缓存提供重复查找，而不是再次派生 crabcc。缓存键覆盖所有查询输入，结果与直接运行语义相同；缓存不可用或缺失时静默降级回直接 CLI 执行。TTL 过期限制陈旧度；`crabcc index` 重建后调用 `invalidate(root)` 可获得即时新鲜度。

## API

- `apply(ctx, config)` — 注册工具与 `crabcc` skill provider。
- `runCrabcc(bin, args, options)` — 派生 crabcc 并 JSON 解析 stdout（`options.text` 为 `--version` 式探测返回原始文本）。
- `isCrabccAvailable(bin, root)` — 可用性探测。

## 模型体验

### 工具 Schema

#### 模型看到什么

模型看到 [`code_search`、`goto_definition`、`find_references`](../../../docs/tool-catalog.md#deepseek-aidsh-skill-crabcc) 的生成 schema。`code_search` 接受 `query`、`limit`、`includeRefs` 与 `root`；另外两个接受符号名加可选的 `limit`/`root`。结果是 crabcc 线上字段（`line_start` 映射为 `line`，`col` 映射为 `column`，CLI 提供时包含片段）。

#### Token 影响

工具可见的每个请求都有固定 schema 开销。结果大小随 `limit` 增长；`code_search` 还随 `includeRefs` 增长（每次命中多一次 `lookup refs` 调用）。

#### KV 缓存影响

工具定义与其可见性不变时前缀稳定。插件生命周期或作用域限制可能使这些 schema 的缓存复用失效。

### Skill 内容

#### 模型看到什么

内置 `crabcc` skill 贡献本包所有的稳定文案：三个工具、JSON 调用示例与工作流提示（"先用 `code_search` 广撒网，用 `goto_definition` 深入定位，用 `find_references` 评估影响"）。仅当 crabcc 二进制应答 `--version` 时才提供该内容。

#### Token 影响

skill 加载时为固定开销；未检索 skill 时为零。

#### KV 缓存影响

不会使其失效：skill 文本是附加到请求的稳定字面量；provider 缓存可用性与淘汰机制在包契约之外。

## 已知限制与待办

- **必须安装 crabcc 二进制** — 当 `crabcc` 不在 `PATH` 上时，`list()`/`get()` 不返回任何候选（skill 静默消失），三个工具以 spawn 错误失败。维护者约束是宿主机安装 crabcc 6.x 并建立索引仓库；演练这些工具的 CI 通道必须先安装 crabcc。
- **索引新鲜度** — 查找反映截至最近一次 `crabcc index` 的索引状态；之后的编辑在重新索引前不可见。
- **模糊匹配语义** — `code_search` 是模糊匹配，不是正则或精确子串；精确名称查询应使用 `goto_definition`。`includeRefs` 每次命中多花一次 `lookup refs` 调用，默认关闭。
- **宿主机执行** — 工具以操作员权限派生 crabcc 子进程；本包不提供 sandbox 层。