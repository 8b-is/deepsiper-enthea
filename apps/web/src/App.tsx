import React, { useState } from 'react'
import { WhaleWaveCanvas } from './components/WhaleWaveCanvas'
import { SonarAudioVisualizer } from './components/SonarAudioVisualizer'
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

  const triggerSonarPing = () => {
    // Trigger global acoustic sonar event on the canvas
    const event = new MouseEvent('click', {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight * 0.4,
      bubbles: true,
    })
    window.dispatchEvent(event)
  }

  return (
    <div className="landing-root">
      {/* 60FPS SOTA Animated Hydrodynamic Ocean Waves & Whale Background */}
      <WhaleWaveCanvas />

      <div className="landing-content">
        <Header
          onLaunchConsole={() => setShowConsoleModal(true)}
          onSonarPing={triggerSonarPing}
        />

        <main>
          <Hero
            onGetStarted={() => scrollToSection('quickstart')}
            onLaunchConsole={() => setShowConsoleModal(true)}
            onSonarPing={triggerSonarPing}
          />

          {/* Floating Subsea Sonar Visualizer Bar */}
          <div className="container" style={{ position: 'relative', zIndex: 10, marginTop: -20, marginBottom: 40 }}>
            <SonarAudioVisualizer onPing={triggerSonarPing} />
          </div>

          <FeatureGrid />
          <ArchitectureDiagram />
          <InteractiveEvaluator />
          <QuickstartTerminal />
        </main>

        <Footer />
      </div>

      {showConsoleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(2, 6, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #091322, #0d1b2a)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 14,
            padding: 32,
            maxWidth: 540,
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(6, 182, 212, 0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#06b6d4',
                  boxShadow: '0 0 10px #06b6d4',
                }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  deepsiper.vaked.dev Console
                </h3>
              </div>
              <button
                onClick={() => setShowConsoleModal(false)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '0.9rem', lineHeight: 1.6 }}>
              The interactive subsea console connects to the local sovereign RPC host.
              To launch the full backend with local Landlock sandboxes:
            </p>
            <pre style={{
              background: '#040812',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              padding: 16,
              borderRadius: 8,
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
