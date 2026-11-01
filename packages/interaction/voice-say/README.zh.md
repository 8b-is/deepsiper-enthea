# @deepseek-ai/dsh-voice-say

[English](README.md) | 中文

`ctx.voice` 的本地文本转语音 provider：macOS 使用 `say`，Linux 使用 `espeak-ng`，或任何把文本作为最后一个参数的命令。宿主二进制是唯一的语音权威。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `binary` | `say` / `espeak-ng` | TTS 二进制；没有默认值的平台必须设置。 |
| `voice` | 无 | 默认语音名。 |
| `rate` | 无 | 默认每分钟词数。 |

## 模型体验

### Spoken audio

#### What the model sees

没有模型可见文本；`dsh-tool-voice` 拥有 `voice_speak` schema 与结果渲染。

#### Token effect

无；provider 不贡献提示词或 schema token。

#### KV Cache effect

无直接失效；请求前缀变化由 `dsh-tool-voice` 负责。

## 已知限制与后续工作

- **需要宿主 TTS 二进制** —— 缺失的二进制会让调用以名称失败。
- **仅朗读** —— 本 provider 没有转写能力。
- **没有播放控制** —— 进程运行至完成。
