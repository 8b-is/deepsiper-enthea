import React from 'react'

export const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem' }}>
              deepsiper.vaked.dev
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-cyan)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}>
              HADAL SOVEREIGN ENCLAVE
            </span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            Sovereign agent evaluation harness forked from deepseek-harness · MIT License
          </div>
        </div>

        <div className="footer-links">
          <a href="https://deepsiper.vaked.dev" target="_blank" rel="noreferrer">deepsiper.vaked.dev</a>
          <a href="https://github.com/8b-is/deepsiper-enthea" target="_blank" rel="noreferrer">GitHub</a>
          <a href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">Documentation</a>
          <a href="https://8b.is" target="_blank" rel="noreferrer">8b-is Org</a>
          <a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noreferrer">Upstream (dsh)</a>
        </div>
      </div>
    </footer>
  )
}
