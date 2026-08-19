# @deepseek-ai/dsh-quant-reference

[English](README.md) | 中文

`ctx.quant` 的**参考（软件）后端**：一个纯软件 provider，把权重矩阵三值化为带分组尺度的 BitNet b1.58 code（与 entheai 引擎的 `crates/ternary` 语义一致），在反量化权重之上运行稠密三值 GEMM，并报告其能力。它不执行任何 subprocess、文件系统、SIMD 或设备 I/O——只是受 `maxOutputBytes` 约束的纯浮点计算。

Namespace 插件（`name`／`inject`／`Config`／`apply`，无默认导出）。注入 `quant`。

## 功能

- 在 `ctx.quant` 上注册 provider id `reference`，作用域绑定 effect，因此 dispose 会注销它并释放 id 保留。
- `quantize`：逐行把列分成 `groupSize` 一组；每组的 scale 为 `max(mean(|w| 于组内), 1e-7)`，每个 code 为 `round(clamp(w / scale, −1, +1))`，属于 `{-1, 0, +1}`。返回 codes、行主序 scales、`bitsPerWeight: 2` 与 `memoryRatioVsFp16: 8`。
- `gemm`：把权重反量化（`code × scale`）并运行稠密乘积 `activation @ dequantized`；校验形状以及 `groupSize` 是否整除权重列数。
- `capabilities`：报告 `bitWidths: [2]`、设备 `cpu-reference`，且无任何吞吐量声明。

## 配置

| Key | 默认值 | 含义 |
|---|---|---|
| `maxOutputBytes` | `16777216` | `gemm` 输出的最大字节数（`rows × cols × 8`）；超出时以 `QUANT_RESULT_TOO_LARGE` 失败。 |

`maxOutputBytes` 必须是正整数；默认值允许 16 MiB 的稠密输出。

## 模型体验

间接，通过 `dsh-tool-quant`（opt-in）实现——它拥有面向模型的 `quant_ternary` schema 与渲染结果。本 provider 不贡献任何 prompt、schema 或对模型可见的文本，并把这一切交给该工具。

#### KV Cache 影响

无直接失效；请求前缀变更由 `dsh-tool-quant` 负责。

## 已知限制与暂缓事项

- **仅软件参考，暂无 SIMD／内核路径**：量化和 GEMM 以标量浮点循环在反量化权重上运行；由于任何地方都没有断言实测或持续的带宽，吞吐量声明不适用。
- **基于反量化权重的稠密 GEMM**：gemm 会先物化 `code × scale` 重建结果再相乘；打包三值 code 微内核属于后续工作，位于硬件 provider 内部。
- **由调用方负责的形状契约**：seam 类型要求 `data.length === rows × cols`；违反的请求不会在此边界重新校验。
