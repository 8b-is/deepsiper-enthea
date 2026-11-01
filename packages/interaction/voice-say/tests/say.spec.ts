import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { SayVoiceProvider, platformBinary, runSay, speakArgs } from '../src/index.ts'

/** A child-process stand-in with the events `runSay` observes. */
function fakeSpawn(emit: (child: EventEmitter) => void): typeof import('node:child_process').spawn {
  return (() => {
    const child = new EventEmitter()
    queueMicrotask(() => { emit(child) })
    return child
  }) as unknown as typeof import('node:child_process').spawn
}

describe('platformBinary', () => {
  it('names the platform binary and refuses unknown platforms', () => {
    expect(platformBinary('darwin')).toBe('say')
    expect(platformBinary('linux')).toBe('espeak-ng')
    expect(() => platformBinary('win32')).toThrow(/set the binary config field/)
  })
})

describe('speakArgs', () => {
  it('uses say rate flags, espeak rate flags, and passes text last', () => {
    expect(speakArgs('say', { operation: 'speak', text: 'hi', voice: 'Alex', rate: 180 })).toEqual(['-v', 'Alex', '-r', '180', 'hi'])
    expect(speakArgs('espeak-ng', { operation: 'speak', text: 'hi', rate: 180 })).toEqual(['-s', '180', 'hi'])
    expect(speakArgs('/opt/bin/custom', { operation: 'speak', text: 'hi' })).toEqual(['hi'])
  })
})

describe('runSay', () => {
  it('resolves on a clean exit and rejects on a non-zero one', async () => {
    await expect(runSay('say', ['hi'], undefined, fakeSpawn(child => child.emit('close', 0)))).resolves.toBeUndefined()
    await expect(runSay('say', ['hi'], undefined, fakeSpawn(child => child.emit('close', 2)))).rejects.toThrow(/status 2/)
  })

  it('names a missing binary', async () => {
    await expect(runSay('missing', ['hi'], undefined, fakeSpawn((child) => {
      child.emit('error', Object.assign(new Error('spawn missing ENOENT'), { code: 'ENOENT' }))
    }))).rejects.toThrow(/was not found/)
  })
})

describe('SayVoiceProvider', () => {
  it('speaks with configured defaults and reports the voice', async () => {
    const provider = new SayVoiceProvider({ binary: 'say', voice: 'Alex', rate: 180 }, fakeSpawn(child => child.emit('close', 0)))
    await expect(provider.speak({ operation: 'speak', text: 'hi' }))
      .resolves.toEqual({ kind: 'spoken', provider: 'say', characters: 2, voice: 'Alex' })
  })
})
