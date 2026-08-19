# @deepseek-ai/dsh-quant

[English](README.md) | 中文

**低位量化能力缝**（`ctx.quant`）：定义 Harness 对 BitNet b1.58 三值权重量化能力的抽象服务——组对称三值 `quantize`、三值 `gemm` 与后端 `capabilities`——基于 provider 后端，而不把模型契约绑定到任何设备、SIMD 指令集或内核。

本包承担量化能力的 Service Definition 角色：

| Package | 角色 |
|---|---|
| `@deepseek-ai/dsh-quant`（本包） | Service Definition：服务、按品牌 backend id 的 provider 注册表、按请求选择、请求/结果词表、`QuantError` 分类 |
| `@deepseek-ai/dsh-quant-reference` | Service Provider：与 entheai `crates/ternary` 量化语义一致的纯软件后端，含稠密三值 GEMM |
| `@deepseek-ai/dsh-tool-quant` | Consumer（opt-in）：基于 `ctx.quant` 的面向模型 `quant` 工具 |

缝恰好暴露三个操作——`quantize`、`gemm`、`capabilities`——且不暴露协议或设备逃生门，因此任何指令流、内存布局或未经审查的硬件控制都不会通过 `ctx.quant` 到达后端。语义与 entheai 引擎的组对称三值量化器对齐（单一事实来源）：`scale_g = max(mean(|w| 于组内), 1e-7)`，code `round(clamp(w / scale_g, −1, +1))` ∈ `{-1, 0, +1}`。

## Service API（`ctx.quant`）

| 成员 | 语义 |
|---|---|
| `registerProvider(provider)` | 注册后端，原子保留其品牌 id。任何非法输入或冲突都不产生发布并抛出 `QuantError`（`QUANT_INVALID_PROVIDER` / `QUANT_CONFLICT`）。返回释放保留的 disposer；随调用 fiber 一起释放。 |
| `execute(request, signal?)` | 按请求的 `backend` 字段（或唯一注册的默认 provider）选择后端并执行一个操作。无匹配抛出 `QUANT_UNAVAILABLE`；所选 provider 不支持该操作抛出 `QUANT_UNSUPPORTED_OPERATION`。 |

选择与注册顺序无关：注册多个 provider 时请求必须指定 `backend`；唯一 provider 即隐式默认。

## 词表

`QuantizeRequest`（`weights`、`groupSize`）→ `{ kind: 'quantized', codes, scales, groupSize, bitsPerWeight, memoryRatioVsFp16 }`。`GemmRequest`（`activation`、`weights`、`groupSize`）→ `{ kind: 'gemm', output }`。`CapabilitiesRequest` → `{ kind: 'capabilities', bitWidths, device, throughputClaims }`。矩阵为稠密行主序 `{ shape, data }`；`groupSize` 必须整除权重列数。`QuantResult` 是按 `kind` 的 CLOSED 判别并集——消费者 `switch` 到穷尽。`capabilities` 中的吞吐量是 provider 的**声明**，而非已验证事实。完整契约见 `src/types.ts`；`QuantError` 代码见 `src/index.ts`。

## Model Experience

间接，通过 `dsh-tool-quant`（opt-in）实现——它拥有面向模型的 `quant` schema、prompt 与渲染结果；本注册表自身不贡献 prompt 或 schema。

#### KV Cache effect

无直接失效；`dsh-tool-quant` 拥有请求前缀变更。

## Known Limitations and Deferred Work

- **目前仅软件参考，尚无硬件后端** —— 缝由纯软件 `dsh-quant-reference` provider 演练。Metal/NEON（`MLX-QUANT`）与 CUDA 后端为后续工作；硬件 provider 必须对相同输入复现参考 provider 的量化输出，并在通过审计清单门禁（相对 FP16 8× 内存、PPL ≤ +0.05、持续 >350 GB/s）之前保持 opt-in。
- **仅限三值** —— 词表固定为 2 位打包三值 code；其他位宽（`{0, 1}`、4 位等）是未来的操作，将扩展该封闭并集。
- **稠密 GEMM，而非打包 gemm 微内核** —— `gemm` 定义在反量化后的三值权重之上；打包 code 微内核位于 provider 内部，不属于缝词表。
