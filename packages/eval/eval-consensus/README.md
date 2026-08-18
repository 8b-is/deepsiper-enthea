# @deepseek-ai/dsh-eval-consensus

Council-of-Elders inference consensus eval. Mounting this plugin registers
`ctx.consensusEval`: run one task through a configured set of model routes and
aggregate their answers with a geometric-mean-style agreement — the inference
analog of KOMPRESS v2's geometric-mean softmax consensus distillation. A lone
outlier contributes ~zero confidence instead of biasing the consensus.

## Config

```yaml
- id: eval-consensus
  name: '@deepseek-ai/dsh-eval-consensus'
  config:
    routes:
      - { id: q1, provider: qwen, model: 'qwen3-8b' }
      - { id: q2, provider: qwen, model: 'qwen3-14b' }
      - { id: d1, provider: deepseek, model: 'deepseek-v4-pro' }
    supportThreshold: 0.6
```

| Key | Default | Meaning |
|---|---|---|
| `routes` | — | The Council: at least one `{ id, provider, model }` route. Empty rejects at load. |
| `supportThreshold` | `0.6` | Jaccard similarity above which two answers count as agreeing. |

## API

`await ctx.consensusEval.run(task, { system?, temperature? })` returns
`{ task, routes: [{ id, provider, model, output, error? }], consensus }`. The
`consensus` is `{ answer, confidence, supporters, unanimous }`: the answer with
the most supporting routes, `confidence` as the geometric mean of the
supporting similarities (an outlier drags it to ~0), and the supporting route
ids. A route that throws is reported with `error` and excluded from the
consensus — one broken Council member never poisons the verdict.

## Model Experience

None at the request level — this is an eval utility that calls the configured
providers directly; the resulting report is what the caller consumes.

## Known Limitations and Deferred Work

- **Text-level agreement, not logits** — the geometric-mean consensus operates
  on completed answers (Jaccard support) because the harness's LLM surface does
  not expose per-token logits; a logit-level geometric-mean softmax (the exact
  KOMPRESS v2 recipe) is deferred until an adapter exposes logprobs.
- **No scoring against a gold answer** — this reports intra-Council consensus,
  not correctness; pair it with a labeled benchmark for accuracy.
- **Sequential per-route cost** — every route is a full model call; for long
  tasks multiply by the Council size.
