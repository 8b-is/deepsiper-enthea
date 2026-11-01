/**
 * `ctx.voice`'s owned branded id: the opaque identity a voice provider reserves.
 * @module @deepseek-ai/dsh-voice/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque voice-provider identity, reserved exclusively at registration. */
export type VoiceProviderId = Branded<'VoiceProviderId'>

/**
 * Brand a string as a {@link VoiceProviderId}.
 * @param id - the provider's stable identifier.
 * @returns the same string, branded.
 */
export function VoiceProviderId(id: string): VoiceProviderId {
  return id as VoiceProviderId
}
