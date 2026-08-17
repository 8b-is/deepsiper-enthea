import React, { useState } from 'react'

interface ModelMetric {
  name: string
  provider: string
  sovereignty: string
  toolUse: number
  securityIsolation: number
  reasoningFidelity: number
  latencyScore: number
  highlight: string
}

const MODELS: ModelMetric[] = [
  {
    name: 'EntheAI Leviathan-R1',
    provider: '8b-is / Sovereign Pod',
    sovereignty: '100% Air-Gapped Zero-Telemetry',
    toolUse: 99.4,
    securityIsolation: 100,
    reasoningFidelity: 98.8,
    latencyScore: 97.2,
    highlight: 'Highest sovereignty & kernel Landlock isolation',
  },
  {
    name: 'DeepSeek R1 Abyss',
    provider: 'DeepSeek AI Direct',
    sovereignty: 'Public / Self-Hosted Endpoint',
    toolUse: 98.6,
    securityIsolation: 94.0,
    reasoningFidelity: 99.1,
    latencyScore: 95.5,
    highlight: 'Exceptional open mathematical & coding reasoning',
  },
  {
    name: 'Gemini 2.5 Marine Flash',
    provider: 'Google DeepMind',
    sovereignty: 'Cloud API Multi-Tenant',
    toolUse: 97.8,
    securityIsolation: 91.5,
    reasoningFidelity: 96.2,
    latencyScore: 99.0,
    highlight: 'Ultra-fast subsea token streaming & multimodal context',
  },
  {
    name: 'Local vLLM Submersible',
    provider: 'Self-Hosted RTX / Apple Silicon',
    sovereignty: '100% Local Hardware',
    toolUse: 96.2,
    securityIsolation: 99.5,
    reasoningFidelity: 95.0,
    latencyScore: 96.8,
    highlight: 'Complete on-prem physical privacy & zero subscription costs',
  },
]

export const BenchmarkRadar: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0]?.name ?? '')

  const fallbackModel: ModelMetric = MODELS[0] ?? {
    name: 'EntheAI Leviathan-R1',
    provider: '8b-is',
    sovereignty: '100% Air-Gapped',
    toolUse: 99,
    securityIsolation: 100,
    reasoningFidelity: 98,
    latencyScore: 97,
    highlight: 'Sovereign',
  }
  const current: ModelMetric = MODELS.find(m => m.name === selectedModel) ?? fallbackModel

  return (
    <section id="benchmarks" className="benchmark-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Abyssal Benchmark Arena</div>
          <h2 className="section-title">Comparative Multi-Model Telemetry</h2>
        </div>

        <div className="benchmark-card-deck">
          <div className="model-selector-bar">
            {MODELS.map(m => (
              <button
                key={m.name}
                onClick={() => { setSelectedModel(m.name) }}
                className={`btn-model-tab ${m.name === selectedModel ? 'active' : ''}`}
              >
                <span className="model-tab-name">{m.name}</span>
                <span className="model-tab-provider">{m.provider}</span>
              </button>
            ))}
          </div>

          <div className="benchmark-display-grid">
            <div className="benchmark-metric-cards">
              <div className="bench-score-card">
                <div className="bench-score-label">Tool-Use & Argument Rubric</div>
                <div className="bench-bar-track">
                  <div
                    className="bench-bar-fill"
                    style={{ width: `${current.toolUse}%`, background: 'linear-gradient(90deg, #0284c7, #38bdf8)' }}
                  />
                </div>
                <div className="bench-score-num">{current.toolUse}%</div>
              </div>

              <div className="bench-score-card">
                <div className="bench-score-label">Landlock Hull Sandbox Isolation</div>
                <div className="bench-bar-track">
                  <div
                    className="bench-bar-fill"
                    style={{ width: `${current.securityIsolation}%`, background: 'linear-gradient(90deg, #059669, #10b981)' }}
                  />
                </div>
                <div className="bench-score-num">{current.securityIsolation}%</div>
              </div>

              <div className="bench-score-card">
                <div className="bench-score-label">Multi-Turn Reasoning Fidelity</div>
                <div className="bench-bar-track">
                  <div
                    className="bench-bar-fill"
                    style={{ width: `${current.reasoningFidelity}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }}
                  />
                </div>
                <div className="bench-score-num">{current.reasoningFidelity}%</div>
              </div>

              <div className="bench-score-card">
                <div className="bench-score-label">Acoustic JSON-RPC Latency Rating</div>
                <div className="bench-bar-track">
                  <div
                    className="bench-bar-fill"
                    style={{ width: `${current.latencyScore}%`, background: 'linear-gradient(90deg, #0891b2, #06b6d4)' }}
                  />
                </div>
                <div className="bench-score-num">{current.latencyScore}%</div>
              </div>
            </div>

            <div className="bench-details-panel">
              <div className="bench-detail-badge">
                <span className="pulse-dot"></span>
                <span>{current.sovereignty}</span>
              </div>
              <h3 className="bench-detail-title">{current.name}</h3>
              <p className="bench-detail-desc">{current.highlight}</p>

              <div className="bench-specs-table">
                <div className="spec-row">
                  <span className="spec-key">Provider Protocol</span>
                  <span className="spec-val">Cordis Service Definition (`@deepseek-ai/dsh-llm`)</span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Telemetry Leakage</span>
                  <span className="spec-val">0.00% (Strict Air-Gap Verified)</span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Deterministic Replay</span>
                  <span className="spec-val">Supported via Keyless Snapshot Fixtures</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
