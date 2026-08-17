import React from 'react'

interface HeroProps {
  onGetStarted: () => void
  onLaunchConsole?: () => void
  onSonarPing?: () => void
}

export const Hero: React.FC<HeroProps> = ({ onGetStarted, onLaunchConsole, onSonarPing }) => {
  return (
    <section className="hero">
      <div className="container hero-container">
        <div className="hero-badge">
          <span className="pulse-dot"></span>
          <span>deepsiper.vaked.dev · Sovereign Abyssal Harness</span>
        </div>

        <h1 className="hero-title">
          The <span className="gradient-ocean-text">Sovereign Leviathan</span> of LLM Evaluation
        </h1>

        <p className="hero-desc">
          Plunge into the uncharted depths of sovereign agent evaluation. Orchestrate self-hosted
          EntheAI reasoning pods, measure multi-turn tool hydrodynamics, and benchmark LLM
          trajectories with kernel-isolated Mariana Trench grade sandboxing.
        </p>

        <div className="hero-ctas">
          <button onClick={onGetStarted} className="btn btn-primary btn-ocean-primary">
            <span>Plunge into Quickstart</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
            </svg>
          </button>

          {onSonarPing && (
            <button onClick={onSonarPing} className="btn btn-accent btn-sonar-pulse">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span>Emit Sonar Ping</span>
            </button>
          )}

          {onLaunchConsole && (
            <button onClick={onLaunchConsole} className="btn btn-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Subsea Console</span>
            </button>
          )}
        </div>

        {/* Ambient Oceanic Metric Badges */}
        <div className="oceanic-metrics-grid">
          <div className="metric-pod">
            <div className="metric-pod-value">11,000m</div>
            <div className="metric-pod-label">Landlock Pressure Isolation</div>
          </div>
          <div className="metric-pod">
            <div className="metric-pod-value">&lt;2.4ms</div>
            <div className="metric-pod-label">Acoustic JSON-RPC Latency</div>
          </div>
          <div className="metric-pod">
            <div className="metric-pod-value">100%</div>
            <div className="metric-pod-label">Zero-Telemetry Sovereignty</div>
          </div>
          <div className="metric-pod">
            <div className="metric-pod-value">24+</div>
            <div className="metric-pod-label">Cordis Spatiotemporal Plugins</div>
          </div>
        </div>
      </div>
    </section>
  )
}
