# @deepseek-ai/dsh-quant

English | [中文](README.zh.md)

The **low-bit quantization capability seam** (`ctx.quant`): an abstract service defining WHAT the harness has for BitNet b1.58 ternary weight quantization — group symmetric ternary `quantize`, ternary `gemm`, and backend `capabilities` — over provider backends, without binding the model contract to any device, SIMD instruction set, or kernel.

This package owns the Service Definition role of the quantization capability:

| Package | Role |
|---|---|
| `@deepseek-ai/dsh-quant` (this) | Service Definition: the service, provider registry keyed by branded backend id, per-request selection, request/result vocabulary, the `QuantError` taxonomy |
| `@deepseek-ai/dsh-quant-reference` | Service Provider: a pure-software backend matching entheai `crates/ternary` quantize semantics, with a dense ternary GEMM |
| `@deepseek-ai/dsh-tool-quant` | Consumer (opt-in): the model-facing `quant` tool over `ctx.quant` |

The seam exposes exactly three operations — `quantize`, `gemm`, `capabilities` — and no protocol or device escape hatch, so no instruction-stream, memory-layout, or unreviewed hardware control reaches a backend through `ctx.quant`. Semantics align to the entheai engine's group-based symmetric ternary quantizer, the single source of truth: `scale_g = max(mean(|w| over group), 1e-7)` and code `round(clamp(w / scale_g, −1, +1))` in `{-1, 0, +1}`.

## Service API (`ctx.quant`)

| Member | Semantics |
|---|---|
| `registerProvider(provider)` | Register a backend, atomically reserving its branded id. Any invalid input or conflict publishes nothing and throws `QuantError` (`QUANT_INVALID_PROVIDER` / `QUANT_CONFLICT`). Returns a disposer releasing the reservation. Disposed with the calling fiber. |
| `execute(request, signal?)` | Select the provider by the request's `backend` field (or the single registered default) and run one operation. No match throws `QuantError` `QUANT_UNAVAILABLE`; an unsupported operation on the selected provider throws `QUANT_UNSUPPORTED_OPERATION`. |

Selection is order-independent: with more than one registered provider a request must name its `backend`; a lone provider is the implicit default.

## Vocabulary

`QuantizeRequest` (`weights`, `groupSize`) → `{ kind: 'quantized', codes, scales, groupSize, bitsPerWeight, memoryRatioVsFp16 }`. `GemmRequest` (`activation`, `weights`, `groupSize`) → `{ kind: 'gemm', output }`. `CapabilitiesRequest` → `{ kind: 'capabilities', bitWidths, device, throughputClaims }`. Matrices are dense row-major `{ shape, data }`; `groupSize` must divide the weight column count. `QuantResult` is a CLOSED discriminated union on `kind` — consumers `switch` to exhaustiveness. Throughput figures in `capabilities` are provider **claims**, never verified facts. See `src/types.ts` for the full contracts and `src/index.ts` for the `QuantError` codes.

## Model Experience

Indirectly, through `dsh-tool-quant` (opt-in), which owns the model-facing `quant` schema, prompt, and rendered results while this registry contributes no prompt or schema itself.

#### KV Cache effect

No direct invalidation; `dsh-tool-quant` owns request-prefix changes.

## Known Limitations and Deferred Work

- **Software reference only, no hardware backend yet** — the seam is exercised by the pure-software `dsh-quant-reference` provider. Metal/NEON (`MLX-QUANT`) and CUDA backends are follow-ups; a hardware provider must reproduce the reference provider's quantize output for the same input, and stays opt-in until it passes the audit-checklist gate (8× memory vs FP16, PPL ≤ +0.05, >350 GB/s sustained).
- **Ternary only** — the vocabulary is fixed at 2-bit packed ternary codes; other bit widths (`{0, 1}`, 4-bit, …) are future operations and would extend the closed union.
- **Dense GEMM, not packed-gemm microkernels** — `gemm` is defined over dequantized ternary weights; packed-code microkernels live inside providers and are not part of the seam vocabulary.
