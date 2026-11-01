import { describe, expect, it } from 'vitest'
import { presentTranscribeCall, renderVoiceSpeak, truncateTranscript } from '../src/index.ts'

describe('truncateTranscript', () => {
  it('keeps short transcripts and bounds long ones with the marker', () => {
    expect(truncateTranscript('hello', 10)).toEqual({ text: 'hello', truncated: false })
    const bounded = truncateTranscript('x'.repeat(40), 20)
    expect(bounded.truncated).toBe(true)
    expect(bounded.text.length).toBeLessThanOrEqual(20)
    expect(bounded.text.endsWith('[truncated]')).toBe(true)
  })
})

describe('renderVoiceSpeak', () => {
  it('names the provider and voice', () => {
    expect(renderVoiceSpeak({ text: 'hi' }, { provider: 'say', characters: 2, voice: 'Alex' }))
      .toEqual([{ type: 'text', text: 'Spoke 2 characters in voice "Alex" via say.' }])
  })
})

describe('presentTranscribeCall', () => {
  it('titles the card with the file name', () => {
    expect(presentTranscribeCall({ path: '/tmp/a.wav' }).title).toBe('Transcribe a.wav')
  })
})
