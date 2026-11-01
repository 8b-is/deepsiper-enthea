# @deepseek-ai/dsh-quant-gaia

[English](README.md) | 中文

`ctx.quant` 的 **GAIA-MLX-QUANT 通道**，移植自 [8b-is/alexiai](https://github.com/8b-is/alexiai) 的 `rust/gaia-mlx-quant`。默认路径是可移植 TypeScript：分组对称三值量化、对反量化权重执行稠密三值 GEMM，以及在能力报告中声明 GAIA 的五 trit 每字节打包比率。当 `binary` 指向原生 `gaia-quant` CLI 时，请求通过 JSON stdin/stdout 委托给它。

命名空间插件（`name` / `inject` / `Config` / `apply`，无默认导出）。注入 `quant`。

## 功能

- 在 `ctx.quant` 上注册 provider id `gaia`，注册受 effect 作用域管理，销毁时注销并释放 id 预留。
- `quantize`：按行把列分成 `groupSize` 大小的组；每组 scale 为 `max(mean(|w|), 1e-7)`，每个 code 为 `round(clamp(w / scale, −1, +1))`。报告 GAIA 打包的 `bitsPerWeight: 8/5` 与 `memoryRatioVsFp16: 10`。
- `gemm`：反量化权重后执行 `activation @ dequantized`，受 `maxOutputBytes` 约束。
- `capabilities`：报告 `bitWidths: [2]`、设备 `cpu-gaia-pq` 以及五 trit 每字节声明。
- 设置 `binary`：把归一化请求作为 JSON 写入 stdin，并在任何消费方解引用之前，按封闭联合校验 stdout 的 JSON 结果。子进程提前退出时的 `EPIPE` 会被忽略；原生 gemm 结果也受 `maxOutputBytes` 约束。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `maxOutputBytes` | `16777216` | `gemm` 输出的最大字节数（`rows × cols × 8`）；超出时以 `QUANT_RESULT_TOO_LARGE` 失败。 |
| `binary` | 无 | 原生 `gaia-quant` CLI 路径；设置后请求通过 JSON stdin/stdout 协议委托。 |

## 模型体验

### Provider-contributed result

#### What the model sees

No model-visible text; `dsh-tool-quant` owns the `quant_ternary` schema and rendered results.

#### Token effect

None; this provider adds no prompt or schema tokens.

#### KV Cache effect

No direct invalidation; `dsh-tool-quant` owns request-prefix changes.

## 已知限制与后续工作

- **原生通道是外部二进制** —— 将 `binary` 指向一个从 stdin 读取一个请求 JSON、向 stdout 写入一个结果 JSON 的 `gaia-quant` CLI；仓库不附带该二进制，且 `8b-is/alexiai` 的零浮点 Rust 内核尚无进程目标。
- **打包仅报告、不强制** —— `bitsPerWeight` 声明 GAIA 的五 trit 每字节比率，而结果仍携带 code 数组；打包字节输出是未来的 provider 选项。
- **对反量化权重的稠密 GEMM** —— 打包三值微内核仍属于原生通道。
