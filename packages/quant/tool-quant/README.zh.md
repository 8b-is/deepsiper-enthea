# @deepseek-ai/dsh-tool-quant

[English](README.md) | 中文

面向模型的 **`quant_ternary` 工具**，基于 `ctx.quant`（opt-in）：把权重矩阵量化为 BitNet b1.58 三值 code `{-1, 0, +1}`（带分组尺度），并报告相对 FP16 的内存比。该工具拥有模型 schema、执行、摘要值、渲染与 UI 呈现；它不导入任何 provider，且只返回紧凑摘要——完整的 codes/scales 矩阵绝不会进入返回值。

Namespace 插件（`name`／`inject`／`Config`／`apply`，无默认导出）。注入 `tools`、`quant` 与 `systemPrompt`。

## 工具

`quant_ternary` 接受 `weights`（非空矩形数字矩阵，行主序）与 `group_size`（正整数，默认 `128`；必须整除权重列数）。其规范结果是 `{ bits_per_weight, memory_ratio_vs_fp16, quantized_shape: { rows, cols }, groups }`，其中 `groups` 是分组尺度个数（`rows × cols / group_size`）。codes 与 scales 由所选 provider 计算，并在生成摘要后即被丢弃，因此每条结果的 token 保持固定且很小。

后端可能不可用。未注册任何 quant provider 时，调用以结构化 `QUANT_UNAVAILABLE` 错误响亮失败；无效的 `group_size`（不整除或非正数）以 `QUANT_UNSUPPORTED_OPERATION` 呈现；参差不齐或空权重矩阵在到达 seam 之前响亮失败。

## 配置

该工具不暴露任何配置键；`group_size` 是每次调用的模型参数。

## 模型体验

### quant_ternary 工具 schema

#### 模型看到的内容

模型会看到生成的 `quant_ternary` schema：`weights`（数组的数组，数字，必填）与 `group_size`（整数，默认 `128`）。输出 schema 声明 `bits_per_weight`、`memory_ratio_vs_fp16`、`quantized_shape` 与 `groups`——不包含任何 codes 或 scales 字段。

#### Token 影响

启用期间，每次请求承担固定 schema 成本；每次成功结果都是固定大小的摘要，因此结果 token 不随矩阵大小增长。

#### KV Cache 影响

只要可见工具定义与顺序不变，前缀就保持稳定；注册生命周期或 scope 限制可能使从第一个变化的 schema token 起的复用失效。

### 结果

#### 模型看到的内容

一行渲染文本加上可选的首行 code 预览：

```text
Quantized W[<rows>x<cols>] to ternary: 2 bits/param, ~8× vs FP16, <groups> scale groups. First row codes: [1, -1, 0, 0].
```

预览（至多四个 code）由原始参数推导，因此保持可重放；完整结果仍以 provider 为准。

#### Token 影响

以固定摘要行为上限，外加至多四个 code 的预览。

#### KV Cache 影响

工具结果追加在已缓存请求前缀之后，不会直接使其失效。

### UI 呈现

#### 模型看到的内容

无。客户端渲染通用卡片——`{ card: 'generic', kind: 'other', title: 'Quantize W[<rows>x<cols>] to ternary' }`——其从参数派生的标题携带矩阵形状。

#### Token 影响

直接 token 影响为零，因为渲染只发生在客户端。

#### KV Cache 影响

无；UI 呈现位于模型请求之外。

## 已知限制与暂缓事项

- **仅软件参考后端**：结果反映标量 `cpu-reference` provider；目前既无 SIMD／内核路径，也无吞吐量声明，因此该工具不承诺任何延迟上限。
- **`group_size` 必须整除列数**：不整除时响亮失败（`QUANT_UNSUPPORTED_OPERATION`），而不会被取整；该工具不会重映射模型的选择。
- **权重必须为矩形且非空**：参差不齐或空矩阵在到达 seam 之前响亮失败。
