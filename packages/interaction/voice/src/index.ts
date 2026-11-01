/**
 * Service Definition for the voice capability seam (`ctx.voice`): a provider
 * registry over two operations — speak text and transcribe audio — with
 * order-independent selection and a `VoiceError` taxonomy. A provider reserves
 * a branded id exclusively; an invalid or conflicting registration publishes
 * nothing.
 * @module @deepseek-ai/dsh-voice
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { effectSync } from '@deepseek-ai/dsh-effect-sync'
import { VoiceProviderId } from './brand.ts'
import type {
  VoiceProvider,
  VoiceRequest,
  VoiceService,
  VoiceSpeakRequest,
  VoiceSpokenResult,
  VoiceTranscribeRequest,
  VoiceTranscribedResult,
} from './types.ts'

export { VoiceProviderId } from './brand.ts'
export type {
  VoiceOperation,
  VoiceProvider,
  VoiceRequest,
  VoiceService,
  VoiceSpeakRequest,
  VoiceSpokenResult,
  VoiceTranscribeRequest,
  VoiceTranscribedResult,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    voice: VoiceService
  }
}

/**
 * Structured voice failure. `code` is stable for routing:
 * `VOICE_INVALID_PROVIDER`, `VOICE_CONFLICT`, `VOICE_UNAVAILABLE`,
 * `VOICE_UNSUPPORTED_OPERATION`.
 */
export class VoiceError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'VoiceError'
  }
}

/** `ctx.voice`. Holds id reservations and the provider table. */
export class Voice extends Service implements VoiceService {
  private readonly providerIds = new Set<VoiceProviderId>()
  private readonly providers = new Map<VoiceProviderId, VoiceProvider>()

  constructor(ctx: Context) {
    super(ctx, 'voice')
  }

  registerProvider(provider: VoiceProvider): () => void {
    const id = provider.id
    if (id.trim() === '') {
      throw new VoiceError('a voice provider id must be a non-empty string', 'VOICE_INVALID_PROVIDER')
    }
    if (this.providerIds.has(id)) {
      throw new VoiceError(`a voice provider with id "${id}" is already registered`, 'VOICE_CONFLICT')
    }
    if (provider.capabilities.length === 0) {
      throw new VoiceError(`voice provider "${id}" registers no capabilities`, 'VOICE_INVALID_PROVIDER')
    }
    if (provider.capabilities.includes('speak') && provider.speak === undefined) {
      throw new VoiceError(`voice provider "${id}" advertises speak without a speak method`, 'VOICE_INVALID_PROVIDER')
    }
    if (provider.capabilities.includes('transcribe') && provider.transcribe === undefined) {
      throw new VoiceError(`voice provider "${id}" advertises transcribe without a transcribe method`, 'VOICE_INVALID_PROVIDER')
    }

    return effectSync(this.ctx, (registerTeardown) => {
      this.providerIds.add(id)
      this.providers.set(id, provider)
      registerTeardown(() => {
        this.providerIds.delete(id)
        this.providers.delete(id)
      })
    }, 'voice.registerProvider()')
  }

  async speak(request: VoiceSpeakRequest, signal?: AbortSignal): Promise<VoiceSpokenResult> {
    const provider = this.select(request)
    if (provider.speak === undefined) {
      throw new VoiceError(
        `voice provider "${String(provider.id)}" does not support speak`,
        'VOICE_UNSUPPORTED_OPERATION',
      )
    }
    return await provider.speak(request, signal)
  }

  async transcribe(request: VoiceTranscribeRequest, signal?: AbortSignal): Promise<VoiceTranscribedResult> {
    const provider = this.select(request)
    if (provider.transcribe === undefined) {
      throw new VoiceError(
        `voice provider "${String(provider.id)}" does not support transcribe`,
        'VOICE_UNSUPPORTED_OPERATION',
      )
    }
    return await provider.transcribe(request, signal)
  }

  /** Resolve the request's backend, or the sole registered provider. */
  private select(request: VoiceRequest): VoiceProvider {
    if (request.backend !== undefined) {
      const provider = this.providers.get(VoiceProviderId(request.backend))
      if (provider === undefined) {
        throw new VoiceError(`no voice provider "${request.backend}" is registered`, 'VOICE_UNAVAILABLE')
      }
      return provider
    }
    if (this.providers.size === 1) {
      const only = this.providers.values().next().value
      if (only !== undefined) return only
    }
    throw new VoiceError(
      'no default voice provider: select one via the request backend field',
      'VOICE_UNAVAILABLE',
    )
  }
}

export default Voice
