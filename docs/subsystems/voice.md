# Voice capability seam

English | [中文](voice.zh.md)

`ctx.voice` is the two-operation voice seam: a provider registry keyed by a branded backend id, order-independent selection, `speak` for text-to-speech and `transcribe` for speech-to-text, and the `VoiceError` taxonomy. The [service definition README](../../packages/interaction/voice/README.md) owns the contract; this page records the service surface from [`packages/interaction/voice/src/types.ts`](../../packages/interaction/voice/src/types.ts).

Providers own their host binaries: [`voice-say`](../../packages/interaction/voice-say/README.md) wraps `say`/`espeak-ng`, and [`voice-kokoro`](../../packages/interaction/voice-kokoro/README.md) wraps the `kokoro-speak` CLI for TTS and STT. The model-facing consumer is [`tool-voice`](../../packages/interaction/tool-voice/README.md).

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
