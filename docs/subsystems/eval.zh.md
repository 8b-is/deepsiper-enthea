# 评测

[English](eval.md) | 中文

评测子系统对模型输出及模型驱动的决策进行评分。[`tool-eval` 工具](../../docs/plugins/tool-eval.md)对候选答案运行评测器；`ctx.consensusEval` 运行一组模型评测并将其折叠为一个共识裁决，从而为服务（而非仅限于工具层）提供统一的运行面。

## 共识评测

`ctx.consensusEval` 只暴露一个操作 —— `run(task, options)` —— 它从每个评测视角各调用一次所配置的模型，并将结果合并为一份 `CouncilReport`：

```ts type-equiv
/** One folded consensus verdict over the evaluated perspectives. */
export interface CouncilReport {
  /** The task the perspectives were asked to judge. */
  readonly task: string
  /** Per-perspective responses in evaluation order. */
  readonly responses: readonly string[]
  /** The single consensus verdict after the fold. */
  readonly consensus: string
}
```

裁决是对各独立响应做几何均值式折叠的结果，因此单一异常视角无法主导。该服务由 `packages/eval/eval-consensus` 拥有；折叠规则及其三元正确性论证记录于该包中。
<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxconsensuseval--consensusevaluator"></a>

### `ctx.consensusEval` — `ConsensusEvaluator`

The consensus eval service (`ctx.consensusEval`).

```ts cordis-catalog
/**
 * Run one task through every Council route and aggregate the answers.
 * @param task - the prompt delivered to every route.
 * @param options - optional system prompt and per-call temperature.
 * @returns one report per route plus the geometric-mean consensus.
 */
async run(task: string, options: { system?: string; temperature?: number } = {}): Promise<CouncilReport>
```

Source: [`packages/eval/eval-consensus/src/index.ts:49`](../../packages/eval/eval-consensus/src/index.ts)
<!-- END GENERATED cordis-surface -->
