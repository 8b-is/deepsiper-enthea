# @deepseek-ai/dsh-voice-kokoro

English | [中文](README.zh.md)

Kokoro voice provider for `ctx.voice`, wrapping the [`kokoro-speak`](https://github.com/8b-is/kokoro-tiny) CLI: `say` for TTS and `stt` for speech-to-text. The CLI owns model download, voices, and playback; this provider owns the process call and the seam mapping.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `binary` | `kokoro-speak` | CLI name or path. |
| `voice` | CLI default (`af_sky`) | Default Kokoro voice. |
| `speed` | CLI default (`1.0`) | Default speaking speed (0.5 to 4). |
| `language` | `auto` | Default language code (`auto`, `en`, `hu`). |

## Model Experience

### Spoken audio

#### What the model sees

No model-visible text; `dsh-tool-voice` owns the `voice_speak` schema and result rendering.

#### Token effect

None; the provider contributes no prompt or schema tokens.

#### KV Cache effect

No direct invalidation; `dsh-tool-voice` owns request-prefix changes.

### Transcribed audio

#### What the model sees

No model-visible text; `dsh-tool-voice` owns the `voice_transcribe` schema and truncation marker.

#### Token effect

None; the transcript is bounded by the consumer.

#### KV Cache effect

No direct invalidation; the consumer owns request-prefix changes.

## Known Limitations and Deferred Work

- **Requires the `kokoro-speak` CLI** — the first run downloads the Kokoro model and voices; the provider only spawns it.
- **Plain-text STT** — transcription reads the CLI's stdout; its JSON mode is not parsed yet.
- **No streaming** — speak and transcribe settle once.
