# 语音能力接缝

[English](voice.md) | 中文

`ctx.voice` 是双操作语音接缝：以品牌化后端 id 为键的 provider 注册表、与顺序无关的选择、用于文本转语音的 `speak` 与用于语音转文本的 `transcribe`，以及 `VoiceError` 错误分类。[服务定义 README](../../packages/interaction/voice/README.md) 拥有契约；本页记录来自 [`packages/interaction/voice/src/types.ts`](../../packages/interaction/voice/src/types.ts) 的服务表面。

Provider 拥有各自的宿主二进制：[`voice-say`](../../packages/interaction/voice-say/README.md) 封装 `say`/`espeak-ng`，[`voice-kokoro`](../../packages/interaction/voice-kokoro/README.md) 为 TTS 与 STT 封装 `kokoro-speak` CLI。面向模型的消费方是 [`tool-voice`](../../packages/interaction/tool-voice/README.md)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxvoice--voiceservice"></a>

### `ctx.voice` — `VoiceService`

The voice capability seam (`ctx.voice`).

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its branded id.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id reservation.
 */
registerProvider(provider: VoiceProvider): () => void

/**
 * Speak through the selected provider.
 * @param request - the speak request.
 * @param signal - optional cancellation.
 * @returns the spoken result.
 */
speak(request: VoiceSpeakRequest, signal?: AbortSignal): Promise<VoiceSpokenResult>

/**
 * Transcribe through the selected provider.
 * @param request - the transcribe request.
 * @param signal - optional cancellation.
 * @returns the transcribed result.
 */
transcribe(request: VoiceTranscribeRequest, signal?: AbortSignal): Promise<VoiceTranscribedResult>
```

Source: [`packages/interaction/voice/src/types.ts:83`](../../packages/interaction/voice/src/types.ts)
<!-- END GENERATED cordis-surface -->
