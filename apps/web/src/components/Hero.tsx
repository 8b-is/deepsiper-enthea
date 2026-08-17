import React from 'react'

interface HeroProps {
  onGetStarted: () => void
  onLaunchConsole?: () => void
}

export const Hero: React.FC<HeroProps> = ({ onGetStarted, onLaunchConsole }) => {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-badge">
          <span className="pulse-dot"></span>
          <span>v0.1.0-rc.7 · Sovereign Agent Harness</span>
        </div>

        <h1 className="hero-title">
          Sovereign Agent Harness for <span className="gradient-text">LLM Evaluation</span>
        </h1>

        <p className="hero-desc">
          Extensible, high-throughput agent evaluation pipeline powered by Cordis.
          Orchestrate self-hosted EntheAI backends, benchmark tool reasoning robustness,
          and run multi-model evaluations with strict sandboxing.
        </p>

        <div className="hero-ctas">
          <button onClick={onGetStarted} className="btn btn-primary">
            <span>Get Started</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

          <a
            href="https://github.com/8b-is/deepsiper-enthea"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            <span>View on GitHub</span>
          </a>

          {onLaunchConsole && (
            <button onClick={onLaunchConsole} className="btn btn-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Web Console</span>
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
