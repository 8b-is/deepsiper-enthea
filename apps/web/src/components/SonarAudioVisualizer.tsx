import React, { useEffect, useState } from 'react'

interface SonarAudioVisualizerProps {
  onPing?: () => void
}

export const SonarAudioVisualizer: React.FC<SonarAudioVisualizerProps> = ({ onPing }) => {
  const [frequencies, setFrequencies] = useState<number[]>([12, 28, 45, 62, 80, 55, 38, 20, 48, 70, 92, 60, 35, 18, 50, 75])
  const [isPinging, setIsPinging] = useState<boolean>(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrequencies(prev =>
        prev.map(() => Math.floor(Math.random() * 85) + 10),
      )
    }, 120)
    return () => { clearInterval(interval) }
  }, [])

  const handlePing = () => {
    setIsPinging(true)
    if (onPing) {
      onPing()
    }
    // Surge frequencies to emulate active acoustic ping
    setFrequencies([95, 100, 98, 90, 85, 92, 99, 94, 88, 96, 100, 93, 89, 95, 98, 90])

    setTimeout(() => { setIsPinging(false) }, 1200)
  }

  return (
    <div className="sonar-bar-container">
      <div className="sonar-info">
        <div className="sonar-status-dot" />
        <div className="sonar-labels">
          <span className="sonar-title">ABYSSAL HYDRO-ACOUSTIC TELEMETRY</span>
          <span className="sonar-depth">DEPTH: -10,924m // CHANGER DEEP // ZERO DATA LEAKAGE</span>
        </div>
      </div>

      <div className="sonar-equalizer">
        {frequencies.map((freq, idx) => {
          const heightPct = isPinging ? Math.min(100, freq * 1.2) : freq
          const color = heightPct > 75 ? '#38bdf8' : heightPct > 45 ? '#06b6d4' : '#0284c7'
          return (
            <div
              key={idx}
              className="sonar-eq-bar"
              style={{
                height: `${heightPct}%`,
                background: color,
                boxShadow: isPinging ? `0 0 8px ${color}` : 'none',
              }}
            />
          )
        })}
      </div>

      <button
        onClick={handlePing}
        className={`btn-sonar-ping ${isPinging ? 'pinging' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        <span>{isPinging ? 'EMITTING SONAR...' : 'EMIT ACOUSTIC PING'}</span>
      </button>
    </div>
  )
}
