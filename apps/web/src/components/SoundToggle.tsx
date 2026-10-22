import React, { useRef, useState } from 'react'

const AMBIENT_SRC = 'https://music.vaked.dev/audio/The_Residue_of_Proof_v2.mp3'

export const SoundToggle: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [on, setOn] = useState(false)

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(AMBIENT_SRC)
      audio.loop = true
      audio.volume = 0.5
      audioRef.current = audio
    }
    const audio = audioRef.current
    if (audio.paused) {
      audio.play()
        .then(() => setOn(true))
        .catch(() => {})
    } else {
      audio.pause()
      setOn(false)
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="toggle ambient soundtrack"
      aria-pressed={on}
      className="sound-toggle"
      data-on={on ? 'true' : 'false'}
      title="ambient — The Residue of Proof"
    >
      ♪
    </button>
  )
}
