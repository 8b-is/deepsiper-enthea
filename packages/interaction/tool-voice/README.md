# @deepseek-ai/dsh-tool-voice

English | [中文](README.zh.md)

Model-facing `voice_speak` tool: speaks bounded text through the host text-to-speech binary. The tool owns the schema, the process call, the bounded result, and the UI presentation; it never synthesizes audio itself.

## Configuration

```ts
export interface Config {
  binary?: string          // default: `say` on macOS, `espeak-ng` on Linux
  voice?: string           // default voice name for every call
  rate?: number            // default words per minute
  maxTextChars?: number    // maximum accepted text length; default 4000
}
```

Any command that accepts the text as its last argument works; `say` and `espeak` also receive their native voice and rate flags. A platform with no default binary must set `binary` explicitly.

## Model Experience

### `voice_speak` tool schema

#### What the model sees

The `voice_speak` name, its description, and three parameters: `text` (required), `voice`, and `rate`. No prompt prose is added. The generated [voice_speak schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-voice) pins the exact schema.

#### Token effect

The schema is a fixed per-request cost. `text` is the only unbounded field and is capped by `maxTextChars`.

#### KV Cache effect

An unchanged tool schema and system prompt keep the prefix cacheable; a different `voice` or `rate` value changes only the tool-call arguments and does not alter the assembled tool definition.

### Result

#### What the model sees

One text block reporting the binary, the spoken character count, and the voice when one was used.

#### Token effect

The result is bounded by construction: one short sentence, never the input text.

#### KV Cache effect

The result appends to the next request and preserves the earlier reusable prefix.

### UI presentation

#### What the model sees

A generic card titled `Speak <n> characters`, derived purely from the arguments.

#### Token effect

No model tokens; presentation is UI-only.

#### KV Cache effect

No effect; the card is not part of the request.

## Known Limitations and Deferred Work

- **Requires a host TTS binary** — the harness does not bundle audio synthesis; a missing binary fails the call with its name.
- **No speech-to-text** — this package only speaks; listening needs a separate capability.
- **No playback control** — the process runs to completion; there is no pause, queue, or ducking surface.
