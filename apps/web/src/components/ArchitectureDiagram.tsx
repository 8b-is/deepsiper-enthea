import React, { useState } from 'react'

interface ArchNodeData {
  id: string
  title: string
  subtitle: string
  description: string
  spec: string
}

export const ArchitectureDiagram: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('cordis')

  const nodes: ArchNodeData[] = [
    {
      id: 'orchestration',
      title: '1. Ingress & Clients',
      subtitle: 'OpenCode / JSON-RPC / CLI / Web',
      description: 'Dispatches task goals, benchmark datasets, and evaluation runs via typed JSON-RPC 2.0 or local CLI sessions.',
      spec: 'Transport: WebSocket / StdIO / HTTP BFF\nSDK: @deepseek-ai/dsh-sdk\nProtocols: OpenCode Bridge, ACP Server',
    },
    {
      id: 'cordis',
      title: '2. Cordis Kernel',
      subtitle: 'Dependency Injection & Fibers',
      description: 'The spatiotemporal plugin kernel. Manages service lifecycle, reactive event buses, and isolated capability registration with zero global coupling.',
      spec: 'Engine: Vendored Cordis Framework\nPrimitives: Context, Service, Event, Effect\nLifecycle: Isolated Disposer Fibers',
    },
    {
      id: 'capabilities',
      title: '3. Capability Seams',
      subtitle: 'Tools, Sandboxes, LLM Seams',
      description: 'Composable seams separating Service Definitions, Service Providers, and Consumers (Landlock, Bash, Subprocess, FS, Memory).',
      spec: 'Isolation: Linux Landlock + macOS Sandbox\nSeams: dsh-shell, dsh-fs, dsh-lsp, dsh-web\nPolicy: Granular Permission Gates',
    },
    {
      id: 'eval',
      title: '4. Sovereign Eval Leaf',
      subtitle: 'EntheAI & Benchmarking Engine',
      description: 'Executes trajectory scoring, rubric checking, tool schema adherence, and local model parameter alignment.',
      spec: 'Plugins: tool-eval, eval-entheai\nTelemetry: SQLite monotonically-versioned logs\nMetrics: Step count, Token efficiency, Rubric score',
    },
  ]

  const defaultNode: ArchNodeData = nodes[0] as ArchNodeData
  const activeNode: ArchNodeData = nodes.find(n => n.id === selectedId) ?? defaultNode

  return (
    <section id="architecture" className="arch-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">System Topology</div>
          <h2 className="section-title">Cordis Plugin Architecture</h2>
        </div>

        <div className="arch-container">
          <div className="arch-flow">
            {nodes.map(node => (
              <div
                key={node.id}
                className={`arch-node ${node.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(node.id)}
              >
                <div className="arch-node-title">{node.title}</div>
                <div className="arch-node-meta">{node.subtitle}</div>
              </div>
            ))}
          </div>

          <div className="arch-detail-view">
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8, fontSize: '0.9375rem' }}>
              {activeNode.title} — {activeNode.subtitle}
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              {activeNode.description}
            </p>
            <pre style={{ color: 'var(--accent-cyan)', background: '#050507', padding: '12px 16px', borderRadius: 6, overflowX: 'auto' }}>
              {activeNode.spec}
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
