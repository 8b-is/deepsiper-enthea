import React from 'react'

interface Feature {
  title: string
  desc: string
  tag: string
  depth: string
  icon: React.ReactNode
}

export const FeatureGrid: React.FC = () => {
  const features: Feature[] = [
    {
      title: 'Leviathan Multi-Fiber Engine',
      desc: 'Everything is a Cordis plugin. Reactive dependency injection, lifecycle fibers, '
        + 'and isolated capability seams ensure zero runtime coupling beneath high pressure.',
      tag: 'CORDIS-KERNEL',
      depth: '-1,200m',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="8" rx="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      ),
    },
    {
      title: 'Abyssal Sovereign Pods',
      desc: 'Native integration with EntheAI and self-hosted inference clusters. '
        + 'Guaranteed zero external data leakage, local parameter alignment, and air-gapped support.',
      tag: 'ENTHEAI-VAULT',
      depth: '-10,900m',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      title: 'Sonar Rubric Evaluator',
      desc: 'Plug-and-play evaluation suites including tool-eval, eval-entheai, '
        + 'adversarial perturbations, and deterministic replay of agent trajectories.',
      tag: 'EVAL-SUITE',
      depth: '-4,500m',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      title: 'Poly-Pod Model Mesh',
      desc: 'Unified model provider abstraction across DeepSeek R1/V3, Gemini 2.5, '
        + 'local vLLM/Ollama nodes, and standard OpenAI-compatible endpoints.',
      tag: 'OCEANIC-MESH',
      depth: '-2,800m',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      title: 'Acoustic JSON-RPC 2.0 SDK',
      desc: 'Drive evaluation runs and agent loops programmatically from OpenCode '
        + 'or custom orchestrators via typed duplex JSON-RPC and streaming sessions.',
      tag: 'DUPLEX-RPC',
      depth: '-800m',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
    },
    {
      title: 'Landlock Pressure Hull',
      desc: 'Strict ESM TypeScript 6, tsdown and rolldown bundling, Vitest 4 with coverage gates, '
        + 'Oxlint performance linting, and kernel Landlock sandbox bounds.',
      tag: 'PRESSURE-HULL',
      depth: '-11,000m',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
  ]

  return (
    <section id="features" className="features-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Bioluminescent Seams</div>
          <h2 className="section-title">Engineered for Unbounded Hydrodynamic Intelligence</h2>
        </div>

        <div className="features-grid">
          {features.map((feature, idx) => (
            <div key={idx} className="feature-card">
              <div className="feature-card-header">
                <div className="feature-icon-box">{feature.icon}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.65rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-cyan)',
                  }}>
                    {feature.depth}
                  </span>
                  <span className="feature-tag">{feature.tag}</span>
                </div>
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
