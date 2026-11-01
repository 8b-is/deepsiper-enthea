/**
 * Voice seam vocabulary: the speak and transcribe requests, provider contract,
 * and result union. Types only; the {@link VoiceError} taxonomy and the
 * {@link VoiceProviderId} factory are runtime.
 * @module @deepseek-ai/dsh-voice/types
 */

import type { VoiceProviderId } from './brand.ts'

/** The two voice operations. */
export type VoiceOperation = 'speak' | 'transcribe'

/** Speak text through a TTS provider. */
export interface VoiceSpeakRequest {
  readonly operation: 'speak'
  /** Text to speak. */
  readonly text: string
  /** Provider voice name. */
  readonly voice?: string
  /** Provider rate (words per minute, or its documented speed knob). */
  readonly rate?: number
  /** Language hint (`auto` when omitted). */
  readonly language?: string
  /** Backend id; omitted selects the single registered provider. */
  readonly backend?: string
}

/** Transcribe one audio file. */
export interface VoiceTranscribeRequest {
  readonly operation: 'transcribe'
  /** Audio file path, owned and readable by the provider. */
  readonly audio: { readonly path: string }
  /** Language hint (`auto` when omitted). */
  readonly language?: string
  /** Backend id; omitted selects the single registered provider. */
  readonly backend?: string
}

/** Any voice request. */
export type VoiceRequest = VoiceSpeakRequest | VoiceTranscribeRequest

/** A successfully spoken request. */
export interface VoiceSpokenResult {
  readonly kind: 'spoken'
  readonly provider: string
  readonly characters: number
  readonly voice?: string
}

/** A successfully transcribed request. */
export interface VoiceTranscribedResult {
  readonly kind: 'transcribed'
  readonly provider: string
  readonly text: string
}

/** The closed result union. */
export type VoiceResult = VoiceSpokenResult | VoiceTranscribedResult

/** One voice backend registered on `ctx.voice`. */
export interface VoiceProvider {
  /** Stable provider identity, reserved exclusively at registration. */
  readonly id: VoiceProviderId
  /** The operations this backend supports. */
  readonly capabilities: readonly VoiceOperation[]
  /**
   * Speak text; present exactly when `speak` is in {@link capabilities}.
   * @param request - the normalized speak request.
   * @param signal - optional cancellation.
   * @returns the spoken result.
   */
  speak?(request: VoiceSpeakRequest, signal?: AbortSignal): Promise<VoiceSpokenResult>
  /**
   * Transcribe audio; present exactly when `transcribe` is in {@link capabilities}.
   * @param request - the normalized transcribe request.
   * @param signal - optional cancellation.
   * @returns the transcribed result.
   */
  transcribe?(request: VoiceTranscribeRequest, signal?: AbortSignal): Promise<VoiceTranscribedResult>
}

/** The voice capability seam (`ctx.voice`). */
export interface VoiceService {
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
}
