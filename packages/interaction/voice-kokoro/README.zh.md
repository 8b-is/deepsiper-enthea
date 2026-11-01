# @deepseek-ai/dsh-voice-kokoro

[English](README.md) | 中文

`ctx.voice` 的 Kokoro 语音 provider，封装 [`kokoro-speak`](https://github.com/8b-is/kokoro-tiny) CLI：`say` 用于 TTS，`stt` 用于语音转文本。CLI 负责模型下载、语音与播放；本 provider 负责进程调用与接缝映射。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `binary` | `kokoro-speak` | CLI 名称或路径。 |
| `voice` | CLI 默认（`af_sky`） | 默认 Kokoro 语音。 |
| `speed` | CLI 默认（`1.0`） | 默认语速（0.5 到 4）。 |
| `language` | `auto` | 默认语言代码（`auto`、`en`、`hu`）。 |

## 模型体验

### Spoken audio

#### What the model sees

没有模型可见文本；`dsh-tool-voice` 拥有 `voice_speak` schema 与结果渲染。

#### Token effect

无；provider 不贡献提示词或 schema token。

#### KV Cache effect

无直接失效；请求前缀变化由 `dsh-tool-voice` 负责。

### Transcribed audio

#### What the model sees

没有模型可见文本；`dsh-tool-voice` 拥有 `voice_transcribe` schema 与截断标记。

#### Token effect

无；转写文本由消费方约束。

#### KV Cache effect

无直接失效；请求前缀由消费方负责。

## 已知限制与后续工作

- **需要 `kokoro-speak` CLI** —— 首次运行会下载 Kokoro 模型与语音；provider 只负责启动它。
- **纯文本 STT** —— 转写读取 CLI 的 stdout；其 JSON 模式尚未解析。
- **没有流式** —— 朗读与转写一次性完成。
