# Evaluation

English | [中文](eval.zh.md)

The evaluation subsystem scores model output and model-driven decisions in the
harness. The [`tool-eval` tool](../../docs/plugins/tool-eval.md) runs graders
over candidate answers; `ctx.consensusEval` runs a group of model evaluations
and folds them into a consensus verdict, so a single run surface is available
to services instead of only to the tool layer.

## Consensus evaluation

`ctx.consensusEval` exposes one operation — `run(task, options)` — that calls
the configured model once per evaluation perspective and combines the results
into one `CouncilReport`:

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

The verdict is a geometric-mean-style fold over the individual responses, so
an outlier perspective cannot dominate. The service is owned by
`packages/eval/eval-consensus`; the fold rule and its ternary-correctness
argument are documented there.
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
