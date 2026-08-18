# Agent Note：`contextTokenBudget` 运行时上下文调节器

状态：已实现

[English](2026-08-18-context-token-budget.md) | 中文

## 问题

harness 组装每个有序运行时上下文到快照时没有任何 token 核算，因此带有大量动态贡献的
部署可能把长上下文窗口推过模型容量——或用噪声挤掉高价值上下文。SOTA harness 将提示词
视为有预算的资源：在各输入间分配、压力下优雅降级，并告知模型快照是局部的。注册表有
优先级（order）但无上限。

## 决策

**`system-prompt` 新增正整数上限 `Config.contextTokenBudget`。** 组装结果把它携带为
`PromptAssembly.contextTokenBudget`，`renderContextSections` 应用它：保留 order 最高的
（最早的）渲染贡献，直到累计 token 估算将超过预算；其余丢弃。token 估算使用导出的
`estimateTokens` 启发式（`字符数 / 4`），一种无 tokenizer 的近似，由部署留足余量。
发生丢弃时，追加一条合成的 `context:truncated` 段说明省略数量——模型与任何 invariant
伴随模块（例如 `dsh-host-info`）都能看到快照是局部的。

**预算后的快照仍是模型可见、被记录的唯一记录。** 调节器只改变哪些贡献进入快照，而快照
作为持久的运行时上下文 `user/message` 被投影；截断说明与被保留的段正是模型读到、日志
重放的内容。无需新会话事件，无需改动 `session-persistence` 或 loop——`agent.ts` 本来
就调用 `renderContextSections`/`joinContextSections`，因此零 loop 改动即继承调节器。

**校验在加载时明确失败。** 非正数或非整数预算在任意组装前被配置 schema 拒绝。省略即
禁用预算，默认行为不变。

## 备选方案

**用适配器 tokenizer 做精确预算。** 第一步已否决：tokenize 是异步、供应商相关，且
组装时不可用；启发式已文档化，预算由部署按规模设置。可插拔估算器是自然的后续。

**对完整系统提示词（段 + 工具 + 上下文）做预算。** 暂缓：段由部署编写（操作者控制其
体量），工具 schema 是独立 wire 字段；运行时上下文才是动态、随会话变化的降级面。
段/工具预算之后可在不改动本机制的前提下叠加。

**用摘要压缩丢弃的上下文而非丢弃。** 暂缓：压缩需要 LLM 调用与组装时的异步管道；
无损丢弃 + 显式截断说明是正确第一步，压缩可在同一预算决策后替换丢弃。

## 后果

处于长上下文压力下的部署可设置 `contextTokenBudget`，获得有界、按优先级排序的运行时
上下文快照与显式截断标记，且全部可记录、可重放。估算具有启发式性质——预算偏紧的部署
可能比 tokenizer 判定所需丢得更多，这一点已文档化。测试固定 keep/truncate/note 行为，
100% 覆盖率门保持绿色。可插拔 token 估算器与整提示词预算仍是未来表面。
