import React, { useState } from 'react'

interface SeamItem {
  name: string
  category: 'core' | 'seam' | 'eval' | 'sdk' | 'sandbox'
  role: 'Service Definition' | 'Service Provider' | 'Consumer' | 'Kernel Plugin'
  description: string
  injections: string[]
}

const SEAMS: SeamItem[] = [
  {
    name: '@deepseek-ai/dsh-core',
    category: 'core',
    role: 'Kernel Plugin',
    description: 'Product API spine: agent session management, context hierarchy, tool registries, and spatiotemporal fibers.',
    injections: ['tools', 'session', 'agent'],
  },
  {
    name: '@deepseek-ai/dsh-shell',
    category: 'seam',
    role: 'Service Definition',
    description: 'POSIX bash & pwsh execution capability seam with streaming StdIO, exit-code capture, and timeout bounds.',
    injections: ['sandbox', 'subprocess'],
  },
  {
    name: '@deepseek-ai/dsh-fs',
    category: 'seam',
    role: 'Service Definition',
    description: 'Sandboxed filesystem capability with path confinement, canonical root traversal, and policy verification.',
    injections: ['sandbox'],
  },
  {
    name: '@deepseek-ai/dsh-eval-tool-eval',
    category: 'eval',
    role: 'Consumer',
    description: 'Automated evaluation suite testing tool calling schema robustness, argument parsing, and recovery invariants.',
    injections: ['tools', 'shell'],
  },
  {
    name: '@deepseek-ai/dsh-eval-entheai',
    category: 'eval',
    role: 'Consumer',
    description: 'Sovereign reasoning and parameter alignment scoring for air-gapped EntheAI inference clusters.',
    injections: ['llm', 'session'],
  },
  {
    name: '@deepseek-ai/dsh-sdk',
    category: 'sdk',
    role: 'Kernel Plugin',
    description: 'Duplex JSON-RPC 2.0 protocol and TypeScript client for headless automation and OpenCode IDE integration.',
    injections: ['session', 'agent'],
  },
  {
    name: '@deepseek-ai/dsh-llm-deepseek',
    category: 'seam',
    role: 'Service Provider',
    description: 'Native DeepSeek R1/V3 model provider with reasoning token streaming and cache-hit telemetry.',
    injections: ['llm'],
  },
  {
    name: '@deepseek-ai/node-addon-landlock-run',
    category: 'sandbox',
    role: 'Service Provider',
    description: 'Native Linux Landlock ABI v3 kernel module providing un-escapable file-descriptor containment.',
    injections: ['sandbox'],
  },
]

export const SeamDirectory: React.FC = () => {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  const filtered = SEAMS.filter((s) => {
    const matchesCat = filter === 'all' || s.category === filter
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    return matchesCat && matchesSearch
  })

  return (
    <section id="seams" className="seams-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Cordis Capability Matrix</div>
          <h2 className="section-title">24+ Composable Plugin Seams</h2>
        </div>

        <div className="seams-controls-bar">
          <div className="category-filters">
            {['all', 'core', 'seam', 'eval', 'sdk', 'sandbox'].map(cat => (
              <button
                key={cat}
                onClick={() => { setFilter(cat) }}
                className={`btn-filter ${filter === cat ? 'active' : ''}`}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Search capability seams (/)..."
              value={search}
              onChange={(e) => { setSearch(e.target.value) }}
              className="seams-search-input"
            />
          </div>
        </div>

        <div className="seams-grid">
          {filtered.map(s => (
            <div key={s.name} className="seam-card">
              <div className="seam-card-top">
                <span className="seam-role-tag">{s.role}</span>
                <span className="seam-cat-tag">{s.category.toUpperCase()}</span>
              </div>
              <h4 className="seam-name">{s.name}</h4>
              <p className="seam-desc">{s.description}</p>
              <div className="seam-injections">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Injects:</span>
                {s.injections.map(inj => (
                  <span key={inj} className="seam-inj-pill">{inj}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
