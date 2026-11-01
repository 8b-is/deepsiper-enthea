# @deepseek-ai/dsh-tool-voice

[English](README.md) | 中文

面向模型的 `ctx.voice` 工具：`voice_speak` 与 `voice_transcribe`。接缝负责 provider 选择与宿主二进制；本消费方负责 schema、边界与呈现。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `maxTextChars` | `4000` | `voice_speak` 接受的最大文本长度。 |
| `maxTranscriptChars` | `8000` | `voice_transcribe` 输出的最大长度（含截断标记）。 |

## 模型体验

### `voice_speak` tool schema

#### What the model sees

`voice_speak` 名称、描述与三个参数：`text`（必填）、`voice`、`rate`。生成的 [voice_speak schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-voice) 固定了确切 schema。

#### Token effect

启用时为固定 schema 成本；结果是一句话，绝不包含输入文本。

#### KV Cache effect

未变化的 schema 与系统提示词保持前缀可缓存；参数不改变组装后的工具定义。

### `voice_transcribe` tool schema

#### What the model sees

`voice_transcribe` 名称、描述、`path`（必填）与 `language`。同一 [工具目录小节](../../../docs/tool-catalog.md#deepseek-aidsh-tool-voice) 记录了它。

#### Token effect

固定 schema 成本；转写文本受 `maxTranscriptChars` 约束，被截断时标记 `[truncated]`。

#### KV Cache effect

不影响组装后的 schema；只有结果文本追加到下一个请求。

## 已知限制与后续工作

- **二进制由 provider 拥有** —— 消费方不合成音频；选中的 provider 没有相应能力时明确失败。
- **按文件路径转写** —— `voice_transcribe` 读取 provider 可打开的文件路径；字节负载输入是未来的接缝变体。
- **没有播放控制** —— 没有暂停、队列或闪避表面。
