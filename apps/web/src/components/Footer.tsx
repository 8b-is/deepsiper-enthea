import React from 'react'

export const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Deepsiper Enthea
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            Sovereign agent evaluation harness · MIT License
          </div>
        </div>

        <div className="footer-links">
          <a href="https://github.com/8b-is/deepsiper-enthea" target="_blank" rel="noreferrer">GitHub</a>
          <a href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">Documentation</a>
          <a href="https://github.com/8b-is" target="_blank" rel="noreferrer">8b-is Org</a>
          <a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noreferrer">Upstream (dsh)</a>
        </div>
      </div>
    </footer>
  )
}
