# quant/ - 低位量化能力族

English | [中文](README.zh.md)

低位（BitNet b1.58 三值）量化能力缝：Service Definition、参考（软件）provider 与可选（opt-in）的面向模型 `quant` 工具。全部为 **product** 包。

| Package | 角色 | ctx key |
|---|---|---|
| `quant/` | Service Definition（按品牌 backend id 的 provider 注册表、与顺序无关的选择、词表、`QuantError`） | `ctx.quant` |
| `quant-reference/` | 参考软件后端：与 entheai `crates/ternary` 语义一致的组三值量化 + 稠密三值 GEMM | （在 `ctx.quant` 上注册 provider） |
| `tool-quant/` | 可选的面向模型 `quant` 工具（把权重矩阵量化为 codes + scale + 内存报告） | （在 `ctx.tools` 上注册） |

Service Definition 位于 `quant/quant/`。缝恰好暴露三个操作——`quantize`、`gemm`、`capabilities`——并与 entheai 引擎的组对称三值量化器对齐（`scale_g = max(mean(|w|), 1e-7)`，code `round(clamp(w/scale, −1, +1))`），不暴露协议或设备逃生门，因此硬件后端切换（MLX-QUANT Metal / NEON / bare-metal，或 CUDA）不会改变模型契约。硬件 provider 必须对相同输入复现参考 provider 的量化输出。

参考 provider 是未来后端的 parity 目标，也是该缝的 keyless 正确性门禁。面向模型工具在硬件后端通过审计清单证据门禁（相对 FP16 8× 内存、PPL ≤ +0.05、持续 >350 GB/s）之前保持 opt-in。
