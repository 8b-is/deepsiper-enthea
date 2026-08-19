# @deepseek-ai/dsh-quant-reference

English | [中文](README.zh.md)

The **reference (software) backend** for `ctx.quant`: a pure-software provider that ternarizes weight matrices to BitNet b1.58 codes with per-group scales (matching the entheai engine's `crates/ternary` semantics), runs a dense ternary GEMM over dequantized weights, and reports its capabilities. It performs no subprocess, filesystem, SIMD, or device I/O — plain floating-point compute bounded by `maxOutputBytes`.

Namespace plugin (`name` / `inject` / `Config` / `apply`, no default export). Injects `quant`.

## What it does

- Registers the provider id `reference` on `ctx.quant`, effect-scoped so disposal unregisters it and releases the id reservation.
- `quantize`: per row, splits columns into groups of `groupSize`; each group's scale is `max(mean(|w| over group), 1e-7)` and each code is `round(clamp(w / scale, −1, +1))` in `{-1, 0, +1}`. Returns codes, row-major scales, `bitsPerWeight: 2`, and `memoryRatioVsFp16: 8`.
- `gemm`: dequantizes the weights (`code × scale`) and runs the dense product `activation @ dequantized`; validates shapes and that `groupSize` divides the weight column count.
- `capabilities`: reports `bitWidths: [2]`, device `cpu-reference`, and no throughput claims.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `maxOutputBytes` | `16777216` | Largest `gemm` output in bytes (`rows × cols × 8`); a larger output fails with `QUANT_RESULT_TOO_LARGE`. |

`maxOutputBytes` must be a positive integer; the default admits a 16 MiB dense output.

## Model Experience

Indirectly, through `dsh-tool-quant` (opt-in), which owns the model-facing `quant_ternary` schema and rendered results. This provider contributes no prompt, schema, or model-visible text and defers to the tool.

#### KV Cache effect

No direct invalidation; `dsh-tool-quant` owns request-prefix changes.

## Known Limitations and Deferred Work

- **Software-only reference, no SIMD/kernel path yet** — quantization and GEMM run as scalar floating-point loops over dequantized weights; throughput claims are not applicable because no measured or sustained bandwidth is asserted anywhere.
- **Dense GEMM over dequantized weights** — the gemm materializes `code × scale` reconstructions before multiplying; packed ternary-code microkernels are follow-ups that live inside hardware providers.
- **Caller-owned shape contract** — the seam types require `data.length === rows × cols`; a violating request is not re-validated at this boundary.
