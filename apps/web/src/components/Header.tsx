import React from 'react'

interface HeaderProps {
  onLaunchConsole?: () => void
  onSonarPing?: () => void
}

export const Header: React.FC<HeaderProps> = ({ onLaunchConsole, onSonarPing }) => {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="brand">
          <div className="brand-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 12c3-4 7-6 11-4 3 1.5 5 5 9 4-2 3-5 5-9 4-3-.8-6-1-11-4z" />
              <path d="M18 10c1-2 2-3 4-3v6c-2 0-3-1-4-3z" />
            </svg>
          </div>
          <div className="brand-text-block">
            <span className="brand-domain">deepsiper.vaked.dev</span>
            <span className="brand-sub">SOVEREIGN LEVIATHAN</span>
          </div>
        </a>

        <nav className="nav-links">
          <a href="#features" className="nav-link">Capabilities</a>
          <a href="#architecture" className="nav-link">Depth Zones</a>
          <a href="#evaluator" className="nav-link">Abyssal Arena</a>
          <a href="#quickstart" className="nav-link">Quickstart</a>
          <a href="http://127.0.0.1:5173" target="_blank" rel="noreferrer" className="nav-link">Documentation</a>
        </nav>

        <div className="header-actions">
          {onSonarPing && (
            <button onClick={onSonarPing} className="btn btn-secondary btn-header-ping" title="Sonar Ping">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
              <span>Sonar</span>
            </button>
          )}

          <a
            href="https://github.com/8b-is/deepsiper-enthea"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            <span>GitHub</span>
          </a>

          {onLaunchConsole && (
            <button onClick={onLaunchConsole} className="btn btn-accent">
              <span>Web Console</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
