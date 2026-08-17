import React, { useState } from 'react'

interface OceanicZoneData {
  id: string
  depth: string
  title: string
  subtitle: string
  description: string
  spec: string
  color: string
}

export const ArchitectureDiagram: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('cordis')

  const zones: OceanicZoneData[] = [
    {
      id: 'epipelagic',
      depth: '0 - 200m',
      title: '1. Epipelagic Surface',
      subtitle: 'OpenCode / JSON-RPC / CLI / Web Ingress',
      description: 'The sunlit surface gateway. Handles high-speed duplex WebSocket frames, telemetry streaming, and IDE orchestrators.',
      spec: 'Transport: WebSocket 2.0 / StdIO / HTTP BFF\nSDK: @deepseek-ai/dsh-sdk\nProtocols: OpenCode Bridge, ACP Automation Server',
      color: '#38bdf8',
    },
    {
      id: 'cordis',
      depth: '200 - 1,000m',
      title: '2. Mesopelagic Twilight',
      subtitle: 'Cordis Kernel & Spatiotemporal Fibers',
      description: 'The core reactive engine. Dispatches lifecycle fibers, resolves dependency graph injection, and manages zero-coupling event streams.',
      spec: 'Engine: Vendored Cordis Kernel\nPrimitives: Context, Service, Event, Effect\nLifecycle: Isolated Disposer Fibers',
      color: '#6366f1',
    },
    {
      id: 'bathypelagic',
      depth: '1,000 - 4,000m',
      title: '3. Bathypelagic Midnight',
      subtitle: 'Landlock Pressure Sandboxes & Seams',
      description: 'Granular capability seams isolating bash execution, subprocess process-trees, and filesystem policies beneath kernel-enforced hulls.',
      spec: 'Isolation: Linux Landlock ABI v3 + macOS Sandbox\nSeams: dsh-shell, dsh-fs, dsh-lsp, dsh-web\nSecurity: Zero-Escapes Boundary',
      color: '#06b6d4',
    },
    {
      id: 'hadal',
      depth: '4,000 - 11,000m',
      title: '4. Hadal Trench Abyss',
      subtitle: 'EntheAI Sovereign Inference & Eval',
      description: 'The sovereign deep. Air-gapped self-hosted model weights, deterministic trajectory scoring, and rubric verification with total data sovereignty.',
      spec: 'Sovereignty: EntheAI Sovereign Inference Nodes\nEval Plugins: tool-eval, eval-entheai\nTelemetry: SQLite Monotonic Schema Logs',
      color: '#10b981',
    },
  ]

  const defaultZone: OceanicZoneData = zones[1] as OceanicZoneData
  const activeZone: OceanicZoneData = zones.find(z => z.id === selectedId) ?? defaultZone

  return (
    <section id="architecture" className="arch-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Oceanic Depth Topology</div>
          <h2 className="section-title">Deep Subsea Architecture Layers</h2>
        </div>

        <div className="arch-container">
          <div className="arch-flow">
            {zones.map(zone => (
              <div
                key={zone.id}
                className={`arch-node ${zone.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(zone.id)}
                style={{
                  borderLeft: `4px solid ${zone.color}`,
                }}
              >
                <div style={{ fontSize: '0.6875rem', color: zone.color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  DEPTH: {zone.depth}
                </div>
                <div className="arch-node-title">{zone.title}</div>
                <div className="arch-node-meta">{zone.subtitle}</div>
              </div>
            ))}
          </div>

          <div className="arch-detail-view" style={{ borderColor: activeZone.color }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1rem' }}>
                {activeZone.title} — {activeZone.subtitle}
              </div>
              <span style={{
                background: 'rgba(255,255,255,0.06)',
                color: activeZone.color,
                padding: '3px 8px',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
              }}>
                ZONE DEPTH: {activeZone.depth}
              </span>
            </div>

            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              {activeZone.description}
            </p>

            <pre style={{
              color: activeZone.color,
              background: '#040914',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '14px 18px',
              borderRadius: 8,
              overflowX: 'auto',
            }}>
              {activeZone.spec}
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
