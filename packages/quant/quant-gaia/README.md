# @deepseek-ai/dsh-quant-gaia

English | [中文](README.zh.md)

The **GAIA-MLX-QUANT lane** for `ctx.quant`, ported from [8b-is/alexiai](https://github.com/8b-is/alexiai) `rust/gaia-mlx-quant`. The default path is portable TypeScript: group symmetric ternary quantize, a dense ternary GEMM over dequantized weights, and capabilities reporting GAIA's five-trits-per-byte packing claim. When `binary` names a native `gaia-quant` CLI, requests are delegated to it over JSON stdin/stdout.

Namespace plugin (`name` / `inject` / `Config` / `apply`, no default export). Injects `quant`.

## What it does

- Registers the provider id `gaia` on `ctx.quant`, effect-scoped so disposal unregisters it and releases the id reservation.
- `quantize`: per row, splits columns into groups of `groupSize`; each group's scale is `max(mean(|w| over group), 1e-7)` and each code is `round(clamp(w / scale, −1, +1))`. Reports `bitsPerWeight: 8/5` and `memoryRatioVsFp16: 10` for the GAIA packing.
- `gemm`: dequantizes the weights and runs `activation @ dequantized`, bounded by `maxOutputBytes`.
- `capabilities`: reports `bitWidths: [2]`, device `cpu-gaia-pq`, and the five-trits-per-byte claim.
- `binary` set: sends the normalized request as JSON on stdin and validates the JSON result from stdout against the closed union before any consumer dereferences it. `EPIPE` from a child that exits early is ignored; `maxOutputBytes` is enforced on a native gemm result.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `maxOutputBytes` | `16777216` | Largest `gemm` output in bytes (`rows × cols × 8`); a larger output fails with `QUANT_RESULT_TOO_LARGE`. |
| `binary` | none | Native `gaia-quant` CLI path; when set, requests are delegated over the JSON stdin/stdout protocol. |

## Model Experience

### Provider-contributed result

#### What the model sees

No model-visible text; `dsh-tool-quant` owns the `quant_ternary` schema and rendered results.

#### Token effect

None; this provider adds no prompt or schema tokens.

#### KV Cache effect

No direct invalidation; `dsh-tool-quant` owns request-prefix changes.

## Known Limitations and Deferred Work

- **Native lane is an external binary** — set `binary` to a `gaia-quant` CLI that reads one request JSON from stdin and writes one result JSON to stdout; the repository ships no such binary, and the zero-float Rust kernel in `8b-is/alexiai` has no process target yet.
- **Packing is reported, not enforced** — `bitsPerWeight` states GAIA's five-trits-per-byte ratio, while the result still carries code arrays; packed-byte output is a future provider option.
- **Dense GEMM over dequantized weights** — packed ternary microkernels remain a native-lane concern.
