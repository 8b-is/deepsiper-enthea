import React, { useState } from 'react'

interface ArchZone {
  id: string
  title: string
  depth: string
  desc: string
  details: string
  technologies: string[]
}

const ZONES: ArchZone[] = [
  {
    id: 'epipelagic',
    title: 'Epipelagic Zone (Surface)',
    depth: '0m - 200m',
    desc: 'Public client interaction, browser console, and OpenCode protocol adapters.',
    details: 'Duplex streaming over JSON-RPC 2.0 and WebSockets. Seamlessly bridges local IDE clients (Cursor, OpenCode, VS Code) to sovereign harness fibers.',
    technologies: ['Vite 6', 'TypeScript 6', 'JSON-RPC 2.0', 'ACP Gateway'],
  },
  {
    id: 'mesopelagic',
    title: 'Mesopelagic Zone (Twilight)',
    depth: '200m - 1,000m',
    desc: 'Cordis reactive dependency engine, spatiotemporal fibers, and plugin registry.',
    details: 'Everything is a Cordis plugin. Dynamic hot module replacement, lifecycle disposers, and topological execution graphs with zero side-effects.',
    technologies: ['Vendored Cordis', 'Plugin Invariant Registry', 'Context Hierarchy'],
  },
  {
    id: 'bathypelagic',
    title: 'Bathypelagic Zone (Midnight)',
    depth: '1,000m - 4,000m',
    desc: 'Landlock sandboxing, local process isolation, and subsea bash execution.',
    details: 'Enforces un-bypassable Linux Landlock ABI v3 containment. System binaries are locked to read-only; agent file mutations are confined strictly within workspace roots.',
    technologies: ['Landlock ABI v3', 'POSIX Bash Runtime', 'Subprocess Tree Isolation'],
  },
  {
    id: 'hadal',
    title: 'Hadal Trench (Abyss)',
    depth: '6,000m - 11,000m',
    desc: 'Sovereign EntheAI reasoning pods, DeepSeek R1 core, and zero-telemetry SQLite logging.',
    details: 'Air-gapped model inference enclaves. Complete operational silence: zero remote telemetry callbacks, schema-versioned durable session logs.',
    technologies: ['DeepSeek R1 / V3', 'EntheAI Reasoning Pods', 'Monotonic SQLite Engine'],
  },
]

export const ArchitectureDiagram: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('hadal')
  const fallbackZone: ArchZone = ZONES[3] ?? {
    id: 'hadal',
    title: 'Hadal Trench',
    depth: '6000m',
    desc: 'Deep',
    details: 'Sovereign',
    technologies: ['DeepSeek R1'],
  }
  const activeZone: ArchZone = ZONES.find(z => z.id === selectedId) ?? fallbackZone

  return (
    <section id="architecture" className="arch-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Spatiotemporal Ocean Architecture</div>
          <h2 className="section-title">Deep Subsea Containment Tiers</h2>
        </div>

        <div className="arch-container">
          <div className="arch-flow">
            {ZONES.map(zone => (
              <div
                key={zone.id}
                className={`arch-node ${zone.id === selectedId ? 'active' : ''}`}
                onClick={() => { setSelectedId(zone.id) }}
                style={{
                  borderColor: zone.id === selectedId ? '#38bdf8' : 'var(--border-base)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="arch-node-meta">{zone.depth}</span>
                  {zone.id === selectedId && <span className="pulse-dot" />}
                </div>
                <div className="arch-node-title">{zone.title}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {zone.desc}
                </div>
              </div>
            ))}
          </div>

          <div className="arch-detail-view">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '1rem' }}>
                {activeZone.title} &mdash; <span style={{ color: 'var(--text-muted)' }}>{activeZone.depth}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {activeZone.technologies.map(t => (
                  <span
                    key={t}
                    style={{
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      color: '#38bdf8',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <p style={{ lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {activeZone.details}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
