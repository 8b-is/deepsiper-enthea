# @deepseek-ai/dsh-tool-voice

English | [中文](README.zh.md)

Model-facing voice tools over `ctx.voice`: `voice_speak` and `voice_transcribe`. The seam owns provider selection and the host binary; this consumer owns the schemas, bounds, and presentation.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `maxTextChars` | `4000` | Maximum accepted `voice_speak` text. |
| `maxTranscriptChars` | `8000` | Maximum emitted `voice_transcribe` text, including the truncation marker. |

## Model Experience

### `voice_speak` tool schema

#### What the model sees

The `voice_speak` name, its description, and three parameters: `text` (required), `voice`, and `rate`. The generated [voice_speak schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-voice) pins the exact schema.

#### Token effect

Fixed schema cost while enabled; the result is one short sentence, never the input text.

#### KV Cache effect

An unchanged schema and system prompt keep the prefix cacheable; arguments do not alter the assembled tool definition.

### `voice_transcribe` tool schema

#### What the model sees

The `voice_transcribe` name, its description, `path` (required), and `language`. The same [tool catalog section](../../../docs/tool-catalog.md#deepseek-aidsh-tool-voice) records it.

#### Token effect

Fixed schema cost; the transcript is bounded by `maxTranscriptChars` and marked `[truncated]` when cut.

#### KV Cache effect

No effect on the assembled schema; only the result text appends to the next request.

## Known Limitations and Deferred Work

- **Provider-owned binaries** — the consumer never synthesizes audio; it fails loud when the selected provider has no capability.
- **File-path transcription** — `voice_transcribe` reads a path the provider can open; byte-payload input is a future seam variant.
- **No playback control** — there is no pause, queue, or ducking surface.
