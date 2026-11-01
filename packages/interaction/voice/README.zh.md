# @deepseek-ai/dsh-voice

[English](README.md) | 中文

`ctx.voice` 的**语音能力接缝**：覆盖两个操作的 provider 注册表——朗读文本与转写音频——具有与顺序无关的选择、品牌化后端 id 与 `VoiceError` 错误分类。provider 独占预留其 id；无效或冲突的注册不会发布任何状态。

## 服务 API（`ctx.voice`）

- `registerProvider(provider)` —— 校验、预留 id，并返回 disposer。provider 必须声明至少一种能力并实现对应方法。
- `speak(request)` —— 选择请求的 `backend`，否则选择唯一已注册 provider，然后执行 `speak`。
- `transcribe(request)` —— 同样的选择，然后用 `audio.path` 执行 `transcribe`。

## 词汇

- 请求：`VoiceSpeakRequest`（`operation: 'speak'`、`text`、`voice?`、`rate?`、`language?`）与 `VoiceTranscribeRequest`（`operation: 'transcribe'`、`audio.path`、`language?`）。
- 结果：`VoiceSpokenResult`（`kind: 'spoken'`、`provider`、`characters`）与 `VoiceTranscribedResult`（`kind: 'transcribed'`、`provider`、`text`）。
- 错误：`VOICE_INVALID_PROVIDER`、`VOICE_CONFLICT`、`VOICE_UNAVAILABLE`、`VOICE_UNSUPPORTED_OPERATION`。

## 模型体验

### Spoken result

#### What the model sees

`dsh-tool-voice` 拥有 `voice_speak` schema 与结果渲染；本接缝不贡献提示词或 schema。

#### Token effect

无直接影响；消费方工具约束其结果。

#### KV Cache effect

无直接失效；请求前缀变化由 `dsh-tool-voice` 负责。

### Transcribed result

#### What the model sees

`dsh-tool-voice` 拥有 `voice_transcribe` schema 与截断标记。

#### Token effect

无直接影响；消费方约束转写文本。

#### KV Cache effect

无直接失效；请求前缀由消费方负责。

## 已知限制与后续工作

- **二进制由 provider 拥有** —— 接缝从不合成音频；每个 provider 记录其宿主依赖。
- **按文件路径转写** —— 目前 `audio.path` 是唯一输入形式；字节负载需要接缝修订。
- **没有流式** —— 结果一次性完成；部分朗读与实时字幕是未来操作。
