# @deepseek-ai/dsh-tool-quant

English | [中文](README.zh.md)

The model-facing **`quant_ternary` tool** over `ctx.quant` (opt-in): quantize a weight matrix to BitNet b1.58 ternary codes `{-1, 0, +1}` with per-group scales and report the memory ratio versus FP16. The tool owns the model schema, execution, summary value, rendering, and UI presentation; it imports no provider and returns only a compact summary — the full codes/scales matrices never enter the returned value.

Namespace plugin (`name` / `inject` / `Config` / `apply`, no default export). Injects `tools`, `quant`, and `systemPrompt`.

## The tool

`quant_ternary` accepts `weights` (a non-empty rectangular matrix of numbers, row-major) and `group_size` (positive integer, default `128`; must divide the weight column count). Its canonical result is `{ bits_per_weight, memory_ratio_vs_fp16, quantized_shape: { rows, cols }, groups }`, where `groups` is the number of scale groups (`rows × cols / group_size`). Codes and scales are computed by the selected provider and dropped once the summary is produced, so per-result tokens stay fixed and small.

Backends may be unavailable. When no quant provider is registered the call fails loud as a structured `QUANT_UNAVAILABLE` error; an invalid `group_size` (non-divisor or non-positive) surfaces as `QUANT_UNSUPPORTED_OPERATION`, and ragged or empty weight matrices fail loud before reaching the seam.

## Configuration

The tool exposes no configuration keys; `group_size` is a per-call model argument.

## Model Experience

### quant_ternary tool schema

#### What the model sees

The model sees the generated `quant_ternary` schema: `weights` (array of arrays of numbers, required) and `group_size` (integer, default `128`). The output schema advertises `bits_per_weight`, `memory_ratio_vs_fp16`, `quantized_shape`, and `groups` — no codes or scales fields.

#### Token effect

Fixed schema cost on every request while enabled; each successful result is a fixed-size summary, so result tokens do not grow with the matrix size.

#### KV Cache effect

Prefix-stable while the visible tool definition and order are unchanged; registration lifecycle or scoped restrictions may invalidate reuse from the first changed schema token.

### Results

#### What the model sees

One rendered line plus an optional first-row code preview:

```text
Quantized W[<rows>x<cols>] to ternary: 2 bits/param, ~8× vs FP16, <groups> scale groups. First row codes: [1, -1, 0, 0].
```

The preview (at most four codes) is derived from the raw arguments, so it stays replayable; the provider remains authoritative for the full result.

#### Token effect

Capped at the fixed summary line plus at most a four-code preview.

#### KV Cache effect

Tool results append after the cached request prefix and do not directly invalidate it.

### UI presentation

#### What the model sees

Nothing. The client renders a generic card — `{ card: 'generic', kind: 'other', title: 'Quantize W[<rows>x<cols>] to ternary' }` — whose args-derived title carries the matrix shape.

#### Token effect

Zero direct token effect because rendering is client-side only.

#### KV Cache effect

None; UI presentation is outside the model request.

## Known Limitations and Deferred Work

- **Software reference backend only** — results reflect the scalar `cpu-reference` provider; no SIMD/kernel path and no throughput claims exist yet, so the tool promises no latency bound.
- **`group_size` must divide the column count** — a non-divisor fails loud (`QUANT_UNSUPPORTED_OPERATION`) rather than being rounded; the tool does not remap the model's choice.
- **Weights must be rectangular and non-empty** — ragged or empty matrices fail loud before reaching the seam.
