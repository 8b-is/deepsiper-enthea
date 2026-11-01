# @deepseek-ai/dsh-voice-say

English | [中文](README.zh.md)

Local text-to-speech provider for `ctx.voice`: `say` on macOS and `espeak-ng` on Linux, or any configured command that accepts the text as its last argument. The host binary is the sole speech authority.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `binary` | `say` / `espeak-ng` | TTS binary; a platform with no default must set it. |
| `voice` | none | Default voice name. |
| `rate` | none | Default words-per-minute rate. |

## Model Experience

### Spoken audio

#### What the model sees

No model-visible text; `dsh-tool-voice` owns the `voice_speak` schema and result rendering.

#### Token effect

None; the provider contributes no prompt or schema tokens.

#### KV Cache effect

No direct invalidation; `dsh-tool-voice` owns request-prefix changes.

## Known Limitations and Deferred Work

- **Requires a host TTS binary** — a missing binary fails the call with its name.
- **Speak only** — no transcription capability in this provider.
- **No playback control** — the process runs to completion.
