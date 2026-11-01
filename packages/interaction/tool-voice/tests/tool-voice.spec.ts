import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { platformBinary, runSpeak, speakArgs } from '../src/index.ts'

/** A child-process stand-in that emits the events `runSpeak` observes. */
function fakeSpawn(emit: (child: EventEmitter) => void): typeof import('node:child_process').spawn {
  return (() => {
    const child = new EventEmitter()
    queueMicrotask(() => { emit(child) })
    return child
  }) as unknown as typeof import('node:child_process').spawn
}

describe('platformBinary', () => {
  it('names the platform binary and refuses an unknown platform', () => {
    expect(platformBinary('darwin')).toBe('say')
    expect(platformBinary('linux')).toBe('espeak-ng')
    expect(() => platformBinary('win32')).toThrow(/set the binary config field/)
  })
})

describe('speakArgs', () => {
  it('uses say rate flags and espeak rate flags', () => {
    expect(speakArgs('say', { text: 'hi', voice: 'Alex', rate: 180 })).toEqual(['-v', 'Alex', '-r', '180', 'hi'])
    expect(speakArgs('espeak-ng', { text: 'hi', rate: 180 })).toEqual(['-s', '180', 'hi'])
    expect(speakArgs('/opt/bin/custom-tts', { text: 'hi' })).toEqual(['hi'])
  })
})

describe('runSpeak', () => {
  it('resolves on a clean exit and rejects on a non-zero one', async () => {
    await expect(runSpeak('say', { text: 'hi' }, undefined, fakeSpawn(child => child.emit('close', 0))))
      .resolves.toBeUndefined()
    await expect(runSpeak('say', { text: 'hi' }, undefined, fakeSpawn(child => child.emit('close', 2))))
      .rejects.toThrow(/exited with status 2/)
  })

  it('names a missing binary', async () => {
    await expect(runSpeak('missing-tts', { text: 'hi' }, undefined, fakeSpawn((child) => {
      child.emit('error', Object.assign(new Error('spawn missing-tts ENOENT'), { code: 'ENOENT' }))
    }))).rejects.toThrow(/was not found/)
  })
})
