import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { KokoroVoiceProvider, runCapture, speakArgs, transcribeArgs } from '../src/index.ts'

/** A child with piped stdout/stderr; `runCapture` reads both. */
class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
}

/** A spawn stand-in that feeds stdout then exits. */
function fakeSpawn(code: number, stdout = '', stderr = ''): typeof import('node:child_process').spawn {
  return (() => {
    const child = new FakeChild()
    queueMicrotask(() => {
      if (stdout) child.stdout.emit('data', stdout)
      if (stderr) child.stderr.emit('data', stderr)
      child.emit('close', code)
    })
    return child
  }) as unknown as typeof import('node:child_process').spawn
}

describe('args', () => {
  it('builds speak and transcribe argv', () => {
    expect(speakArgs({ operation: 'speak', text: 'hi' }, { binary: 'kokoro-speak', voice: 'af_sky', speed: 1.2, language: 'en' }))
      .toEqual(['say', 'hi', '-V', 'af_sky', '-s', '1.2', '-L', 'en'])
    expect(transcribeArgs({ operation: 'transcribe', audio: { path: '/tmp/a.wav' } }, { binary: 'kokoro-speak', language: 'hu' }))
      .toEqual(['stt', '/tmp/a.wav', '--lang', 'hu'])
  })
})

describe('runCapture', () => {
  it('captures stdout and exits', async () => {
    await expect(runCapture('kokoro-speak', ['say'], undefined, fakeSpawn(0, 'ok'))).resolves.toEqual({ code: 0, stdout: 'ok', stderr: '' })
  })
})

describe('KokoroVoiceProvider', () => {
  it('speaks and transcribes through the CLI', async () => {
    const provider = new KokoroVoiceProvider({ binary: 'kokoro-speak', voice: 'af_sky' }, fakeSpawn(0, 'transcript'))
    await expect(provider.speak({ operation: 'speak', text: 'hi' }))
      .resolves.toEqual({ kind: 'spoken', provider: 'kokoro', characters: 2, voice: 'af_sky' })
    await expect(provider.transcribe({ operation: 'transcribe', audio: { path: '/tmp/a.wav' } }))
      .resolves.toEqual({ kind: 'transcribed', provider: 'kokoro', text: 'transcript' })
  })

  it('rejects a failing CLI', async () => {
    const provider = new KokoroVoiceProvider({ binary: 'kokoro-speak' }, fakeSpawn(1, '', 'boom'))
    await expect(provider.speak({ operation: 'speak', text: 'hi' })).rejects.toThrow(/status 1: boom/)
  })
})
