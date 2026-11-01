# @deepseek-ai/dsh-tool-voice

[English](README.md) | 中文

面向模型的 `voice_speak` 工具：通过宿主机的文本转语音二进制朗读有界文本。该工具拥有 schema、进程调用、有界结果与 UI 呈现；它本身不合成音频。

## 配置

```ts
export interface Config {
  binary?: string          // default: `say` on macOS, `espeak-ng` on Linux
  voice?: string           // default voice name for every call
  rate?: number            // default words per minute
  maxTextChars?: number    // maximum accepted text length; default 4000
}
```

任何把文本作为最后一个参数的命令都可以使用；`say` 与 `espeak` 还会收到各自的原生语音与速率参数。没有默认二进制的平台必须显式设置 `binary`。

## 模型体验

### `voice_speak` 工具 schema

#### 模型看到什么

`voice_speak` 名称、描述以及三个参数：`text`（必填）、`voice` 与 `rate`。不添加提示词散文。生成的 [voice_speak schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-voice) 固定了确切 schema。

#### Token 影响

schema 是每个请求的固定成本。`text` 是唯一无界字段，并受 `maxTextChars` 限制。

#### KV 缓存影响

未变化的工具 schema 与系统提示词保持前缀可缓存；不同的 `voice` 或 `rate` 只改变工具调用参数，不改变组装后的工具定义。

### 结果

#### 模型看到什么

一个文本块，报告二进制、朗读字符数，以及使用时的语音。

#### Token 影响

结果在构造上是有界的：一句话，绝不包含输入文本。

#### KV 缓存影响

结果追加到下一个请求，并保留更早的可复用前缀。

### UI 呈现

#### 模型看到什么

标题为 `Speak <n> characters` 的通用卡片，纯由参数推导。

#### Token 影响

不产生模型 token；呈现仅限 UI。

#### KV 缓存影响

无影响；卡片不属于请求。

## 已知限制与后续工作

- **需要宿主机 TTS 二进制** —— harness 不捆绑音频合成；缺失的二进制会让调用以名称失败。
- **没有语音转文本** —— 本包只负责朗读；聆听需要独立能力。
- **没有播放控制** —— 进程运行至完成；没有暂停、队列或闪避表面。
