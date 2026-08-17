import React, { useState } from 'react'

interface DepthZone {
  name: string
  min: number
  max: number
  color: string
  creatures: string
  isolation: string
  protocol: string
}

const ZONES: DepthZone[] = [
  {
    name: 'Epipelagic (Sunlit Surface)',
    min: 0,
    max: 200,
    color: '#38bdf8',
    creatures: 'Dolphins, Surface WebSockets, OpenCode IDE Bridge',
    isolation: 'Public Ingress Gateway / JSON-RPC 2.0 Client',
    protocol: 'Duplex Framing & TLS 1.3 Strict Ingress',
  },
  {
    name: 'Mesopelagic (Twilight Zone)',
    min: 200,
    max: 1000,
    color: '#6366f1',
    creatures: 'Bioluminescent Lanternfish, Cordis Fiber Spores',
    isolation: 'Cordis Reactive Dependency Engine',
    protocol: 'Automatic Disposer Rollback & Topology Locks',
  },
  {
    name: 'Bathypelagic (Midnight Zone)',
    min: 1000,
    max: 4000,
    color: '#06b6d4',
    creatures: 'Giant Squid, Subsea Bash & Landlock Sandboxes',
    isolation: 'Linux Landlock ABI v3 Kernel Isolation',
    protocol: 'Read-Only System Plane / Restricted Write Root',
  },
  {
    name: 'Abyssopelagic (The Abyss)',
    min: 4000,
    max: 6000,
    color: '#3b82f6',
    creatures: 'Deep Sea Anglerfish, Monotonic SQLite Loggers',
    isolation: 'Zero-Telemetry Durable Session Persistence',
    protocol: 'Local Schema-Versioned Monotonic Event Store',
  },
  {
    name: 'Hadal Trench (Challenger Deep)',
    min: 6000,
    max: 11000,
    color: '#10b981',
    creatures: 'The Sovereign Leviathan, EntheAI Reasoning Pods',
    isolation: 'Air-Gapped Sovereign Inference Enclave',
    protocol: '100% Zero External Data Leakage Guarantee',
  },
]

export const TrenchDepthExplorer: React.FC = () => {
  const [depth, setDepth] = useState<number>(10924) // Mariana Trench depth

  const fallbackZone: DepthZone = ZONES[4] ?? {
    name: 'Hadal Trench',
    min: 6000,
    max: 11000,
    color: '#10b981',
    creatures: 'Leviathan',
    isolation: 'Air-Gapped',
    protocol: 'Zero Leakage',
  }
  const currentZone: DepthZone = ZONES.find(z => depth >= z.min && depth <= z.max) ?? fallbackZone
  const pressureBar = Math.round(1 + depth / 10)
  const pressurePsi = Math.round(pressureBar * 14.5038)
  const tempC = Math.max(1.1, +(22 - (depth / 500) * 4.8).toFixed(1))
  const lightPct = Math.max(0, +(100 - (depth / 200) * 100).toFixed(1))

  return (
    <section id="depth-explorer" className="depth-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Hydro-Barometric Explorer</div>
          <h2 className="section-title">Mariana Trench Sovereign Depth Simulator</h2>
        </div>

        <div className="depth-explorer-card">
          <div className="depth-slider-block">
            <div className="depth-readout-row">
              <div>
                <span className="depth-number">-{depth}</span>
                <span className="depth-unit">METERS</span>
                <span className="depth-fathoms">({Math.round(depth * 0.546807)} Fathoms)</span>
              </div>
              <div className="zone-pill" style={{ borderColor: currentZone.color, color: currentZone.color }}>
                {currentZone.name}
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="11000"
              step="50"
              value={depth}
              onChange={(e) => { setDepth(Number(e.target.value)) }}
              className="depth-range-input"
            />

            <div className="depth-ticks">
              <span>0m Surface</span>
              <span>2,000m</span>
              <span>4,000m</span>
              <span>6,000m</span>
              <span>8,000m</span>
              <span>11,000m Hadal</span>
            </div>
          </div>

          <div className="depth-telemetry-grid">
            <div className="depth-telemetry-item">
              <div className="telemetry-label">Hydrostatic Pressure</div>
              <div className="telemetry-val" style={{ color: 'var(--accent-cyan)' }}>
                {pressureBar.toLocaleString()} <span className="telemetry-sub">BAR</span>
              </div>
              <div className="telemetry-extra">{pressurePsi.toLocaleString()} PSI on Hull</div>
            </div>

            <div className="depth-telemetry-item">
              <div className="telemetry-label">Water Temperature</div>
              <div className="telemetry-val" style={{ color: '#38bdf8' }}>
                {tempC}°C
              </div>
              <div className="telemetry-extra">Abyssal Chill Matrix</div>
            </div>

            <div className="depth-telemetry-item">
              <div className="telemetry-label">Solar Light Penetration</div>
              <div className="telemetry-val" style={{ color: lightPct === 0 ? '#10b981' : '#f59e0b' }}>
                {lightPct}%
              </div>
              <div className="telemetry-extra">{lightPct === 0 ? '100% Bioluminescence' : 'Surface Refraction'}</div>
            </div>

            <div className="depth-telemetry-item">
              <div className="telemetry-label">Active Sovereign Layer</div>
              <div className="telemetry-val" style={{ color: currentZone.color, fontSize: '1.1rem' }}>
                {currentZone.isolation}
              </div>
              <div className="telemetry-extra">{currentZone.protocol}</div>
            </div>
          </div>

          <div className="benthic-radar-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="pulse-dot" style={{ background: currentZone.color, boxShadow: `0 0 10px ${currentZone.color}` }}></span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Benthic Telemetry Radar:
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {currentZone.creatures}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
