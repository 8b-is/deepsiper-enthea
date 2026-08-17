import React, { useState } from 'react'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { FeatureGrid } from './components/FeatureGrid'
import { ArchitectureDiagram } from './components/ArchitectureDiagram'
import { InteractiveEvaluator } from './components/InteractiveEvaluator'
import { QuickstartTerminal } from './components/QuickstartTerminal'
import { Footer } from './components/Footer'
import './landing.css'

export const App: React.FC = () => {
  const [showConsoleModal, setShowConsoleModal] = useState<boolean>(false)

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="landing-root">
      <Header onLaunchConsole={() => setShowConsoleModal(true)} />

      <main>
        <Hero
          onGetStarted={() => scrollToSection('quickstart')}
          onLaunchConsole={() => setShowConsoleModal(true)}
        />
        <FeatureGrid />
        <ArchitectureDiagram />
        <InteractiveEvaluator />
        <QuickstartTerminal />
      </main>

      <Footer />

      {showConsoleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-base)',
            borderRadius: 12,
            padding: 32,
            maxWidth: 540,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Deepsiper Web Console
              </h3>
              <button
                onClick={() => setShowConsoleModal(false)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.9rem', lineHeight: 1.6 }}>
              The interactive web console connects to the local sovereign RPC host.
              To start the full backend with local Landlock sandboxes:
            </p>
            <pre style={{
              background: '#09090c',
              border: '1px solid var(--border-base)',
              padding: 16,
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: 'var(--accent-cyan)',
              marginBottom: 20,
              overflowX: 'auto',
            }}>
              pnpm dsh web
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowConsoleModal(false)} className="btn btn-secondary">
                Close
              </button>
              <a href="http://127.0.0.1:3080" className="btn btn-primary" target="_blank" rel="noreferrer">
                Open Local Host (Port 3080)
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
