import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Voice, VoiceError, VoiceProviderId } from '../src/index.ts'
import type { VoiceProvider } from '../src/index.ts'

/** One in-memory provider with both operations. */
function provider(id: string): VoiceProvider {
  return {
    id: VoiceProviderId(id),
    capabilities: ['speak', 'transcribe'],
    speak: request => Promise.resolve({ kind: 'spoken', provider: id, characters: request.text.length }),
    transcribe: () => Promise.resolve({ kind: 'transcribed', provider: id, text: 'hello' }),
  }
}

/** A context mounting the voice seam. */
async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(Voice)
  return ctx
}

describe('ctx.voice', () => {
  it('selects the sole provider and dispatches both operations', async () => {
    const ctx = await setup()
    const dispose = ctx.voice.registerProvider(provider('local'))
    await expect(ctx.voice.speak({ operation: 'speak', text: 'hi' }))
      .resolves.toEqual({ kind: 'spoken', provider: 'local', characters: 2 })
    await expect(ctx.voice.transcribe({ operation: 'transcribe', audio: { path: '/tmp/a.wav' } }))
      .resolves.toEqual({ kind: 'transcribed', provider: 'local', text: 'hello' })
    dispose()
    await ctx.fiber.dispose()
  })

  it('rejects conflicts, unsupported operations, and ambiguous selection', async () => {
    const ctx = await setup()
    ctx.voice.registerProvider(provider('one'))
    expect(() => ctx.voice.registerProvider(provider('one'))).toThrow(VoiceError)
    ctx.voice.registerProvider(provider('two'))
    await expect(ctx.voice.speak({ operation: 'speak', text: 'hi' })).rejects.toThrow(/select one/)
    await ctx.fiber.dispose()
  })

  it('rejects a provider whose capabilities and methods disagree', async () => {
    const ctx = await setup()
    expect(() => ctx.voice.registerProvider({
      id: VoiceProviderId('broken'),
      capabilities: ['speak'],
    })).toThrow(/advertises speak without a speak method/)
    await ctx.fiber.dispose()
  })
})
