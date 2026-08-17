/**
 * Abyssal Harmonic Audio Synthesizer — "One Love" Oceanic Resonance Engine
 * 100% Client-Side Web Audio API (zero external sound files)
 * Synthesizes peaceful subsea harmonics, soothing ocean swell filters,
 * and warm root chords (Bb Major: Bb2, D3, F3, Bb3).
 */

class AbyssalAudioHarmonics {
  private ctx: AudioContext | null = null
  private isPlaying = false
  private masterGain: GainNode | null = null
  private oscillators: OscillatorNode[] = []
  private noiseNode: AudioNode | null = null

  private initContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  toggle(): boolean {
    if (this.isPlaying) {
      this.stop()
      return false
    }
    this.play()
    return true
  }

  play(): void {
    if (this.isPlaying) return
    const ctx = this.initContext()

    this.masterGain = ctx.createGain()
    this.masterGain.gain.setValueAtTime(0.001, ctx.currentTime)
    this.masterGain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 2.5) // Smooth 2.5s swell
    this.masterGain.connect(ctx.destination)

    // "One Love" warm harmonic triad chord (Bb2, F2, D3, Bb3)
    const chordFrequencies = [116.54, 87.31, 146.83, 233.08, 349.23]

    this.oscillators = chordFrequencies.map((freq, idx) => {
      const osc = ctx.createOscillator()
      const oscGain = ctx.createGain()
      const filter = ctx.createBiquadFilter()

      osc.type = idx === 0 ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)

      // Slight detune for warm, rich oceanic shimmer
      osc.detune.setValueAtTime((idx - 2) * 4, ctx.currentTime)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(380, ctx.currentTime)

      // Gentle LFO filter modulation simulating oceanic swells
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.setValueAtTime(0.12 + idx * 0.03, ctx.currentTime)
      lfoGain.gain.setValueAtTime(80, ctx.currentTime)
      lfo.connect(lfoGain)
      lfoGain.connect(filter.frequency)
      lfo.start()

      oscGain.gain.setValueAtTime(0.22 / chordFrequencies.length, ctx.currentTime)
      osc.connect(filter)
      filter.connect(oscGain)
      oscGain.connect(this.masterGain as GainNode)

      osc.start()
      return osc
    })

    // Pink/Brown oceanic current noise generator
    const bufferSize = ctx.sampleRate * 3
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.04
    }

    const whiteNoise = ctx.createBufferSource()
    whiteNoise.buffer = noiseBuffer
    whiteNoise.loop = true

    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(220, ctx.currentTime)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.08, ctx.currentTime)

    whiteNoise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.masterGain)

    whiteNoise.start()
    this.noiseNode = whiteNoise

    this.isPlaying = true
  }

  stop(): void {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return
    const now = this.ctx.currentTime
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2) // Smooth fade-out

    setTimeout(() => {
      this.oscillators.forEach((osc) => {
        try {
          osc.stop()
          osc.disconnect()
        } catch {
          // ignore
        }
      })
      this.oscillators = []
      if (this.noiseNode) {
        try {
          (this.noiseNode as AudioBufferSourceNode).stop()
          this.noiseNode.disconnect()
        } catch {
          // ignore
        }
        this.noiseNode = null
      }
      this.isPlaying = false
    }, 1250)
  }

  get active(): boolean {
    return this.isPlaying
  }
}

export const harmonics = new AbyssalAudioHarmonics()
