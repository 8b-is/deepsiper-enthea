# @deepseek-ai/dsh-voice

English | [中文](README.zh.md)

The **voice capability seam** for `ctx.voice`: a provider registry over two operations — speak text and transcribe audio — with order-independent selection, branded backend ids, and a `VoiceError` taxonomy. A provider reserves its id exclusively; an invalid or conflicting registration publishes nothing.

## Service API (`ctx.voice`)

- `registerProvider(provider)` — validates, reserves the id, and returns a disposer. A provider must advertise at least one capability and supply the matching method.
- `speak(request)` — selects the request's `backend`, else the sole registered provider, and executes `speak`.
- `transcribe(request)` — same selection, then executes `transcribe` with `audio.path`.

## Vocabulary

- Requests: `VoiceSpeakRequest` (`operation: 'speak'`, `text`, `voice?`, `rate?`, `language?`) and `VoiceTranscribeRequest` (`operation: 'transcribe'`, `audio.path`, `language?`).
- Results: `VoiceSpokenResult` (`kind: 'spoken'`, `provider`, `characters`) and `VoiceTranscribedResult` (`kind: 'transcribed'`, `provider`, `text`).
- Errors: `VOICE_INVALID_PROVIDER`, `VOICE_CONFLICT`, `VOICE_UNAVAILABLE`, `VOICE_UNSUPPORTED_OPERATION`.

## Model Experience

### Spoken result

#### What the model sees

`dsh-tool-voice` owns the `voice_speak` schema and result rendering; this seam contributes no prompt or schema.

#### Token effect

None directly; the consumer tool bounds its result.

#### KV Cache effect

No direct invalidation; `dsh-tool-voice` owns request-prefix changes.

### Transcribed result

#### What the model sees

`dsh-tool-voice` owns the `voice_transcribe` schema and truncation marker.

#### Token effect

None directly; the consumer bounds the transcript.

#### KV Cache effect

No direct invalidation; the consumer owns request-prefix changes.

## Known Limitations and Deferred Work

- **Provider-owned binaries** — the seam never synthesizes audio; each provider documents its host dependency.
- **File-path transcription** — `audio.path` is the only input form today; byte payloads need a seam revision.
- **No streaming** — results settle once; partial speech and live captions are future operations.
