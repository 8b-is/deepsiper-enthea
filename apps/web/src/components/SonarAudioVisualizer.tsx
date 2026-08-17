import React, { useState, useEffect } from 'react'

interface SonarVisualizerProps {
  onPing?: () => void
}

export const SonarAudioVisualizer: React.FC<SonarVisualizerProps> = ({ onPing }) => {
  const [isPinging, setIsPinging] = useState<boolean>(false)
  const [bars, setBars] = useState<number[]>([25, 45, 70, 90, 60, 40, 80, 100, 75, 50, 30, 65, 85, 40, 20])
  const [depth, setDepth] = useState<number>(3840) // meters deep in oceanic abyss

  useEffect(() => {
    const interval = setInterval(() => {
      setBars(prev => prev.map(() => Math.floor(Math.random() * 85) + 15))
      setDepth(d => (d > 10900 ? 3840 : d + Math.floor(Math.random() * 12) + 2))
    }, 120)
    return () => clearInterval(interval)
  }, [])

  const triggerSonar = () => {
    setIsPinging(true)
    if (onPing) onPing()

    // Trigger visual pulse event
    const event = new MouseEvent('click', {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      bubbles: true,
    })
    window.dispatchEvent(event)

    setTimeout(() => setIsPinging(false), 1200)
  }

  return (
    <div className="sonar-bar-container">
      <div className="sonar-info">
        <div className="sonar-status-dot"></div>
        <div className="sonar-labels">
          <span className="sonar-title">SONAR TELEMETRY MATRIX</span>
          <span className="sonar-depth">DEPTH: -{depth}M (HUXLEY TRENCH)</span>
        </div>
      </div>

      <div className="sonar-equalizer">
        {bars.map((height, i) => (
          <div
            key={i}
            className="sonar-eq-bar"
            style={{
              height: `${isPinging ? Math.min(100, height * 1.3) : height}%`,
              background: isPinging
                ? 'linear-gradient(to top, #06b6d4, #38bdf8, #ffffff)'
                : 'linear-gradient(to top, #1e3a8a, #0284c7, #38bdf8)',
            }}
          />
        ))}
      </div>

      <button
        onClick={triggerSonar}
        className={`btn-sonar-ping ${isPinging ? 'pinging' : ''}`}
        title="Emit an acoustic sonar ping across all connected agent seams"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2a10 10 0 0 0-10 10c0 5.5 4.5 10 10 10s10-4.5 10-10" />
          <path d="M12 6a6 6 0 0 0-6 6c0 3.3 2.7 6 6 6s6-2.7 6-6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
        <span>{isPinging ? 'SONAR PINGING...' : 'EMIT ACOUSTIC PING'}</span>
      </button>
    </div>
  )
}
