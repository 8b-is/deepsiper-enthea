# quant/ - Low-bit quantization capability family

English | [中文](README.zh.md)

The low-bit (BitNet b1.58 ternary) quantization capability seam: a Service Definition, a reference (software) provider, and an opt-in model-facing `quant` tool. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| `quant/` | Service Definition (provider registry by branded backend id, order-independent selection, vocabulary, `QuantError`) | `ctx.quant` |
| `quant-reference/` | Reference software backend: group ternary quantize matching entheai `crates/ternary` semantics + dense ternary GEMM | (registers a provider on `ctx.quant`) |
| `tool-quant/` | Opt-in model-facing `quant` tool (quantize a weight matrix → codes + scale + memory report) | (registers on `ctx.tools`) |

The Service Definition lives at `quant/quant/`. The seam exposes exactly three operations — `quantize`, `gemm`, `capabilities` — aligned to the entheai engine's group-based symmetric ternary quantizer (`scale_g = max(mean(|w|), 1e-7)`, code `round(clamp(w/scale, −1, +1))`), and no protocol or device escape hatch, so a hardware backend swap (MLX-QUANT Metal / NEON / bare-metal, or CUDA) does not change the model contract. Hardware providers must reproduce the reference provider's quantize output for the same input.

The reference provider is the parity target for future backends and the keyless correctness gate for the seam. The model-facing tool stays opt-in until a hardware backend passes the audit-checklist evidence gate (8× memory vs FP16, PPL ≤ +0.05, >350 GB/s sustained).
