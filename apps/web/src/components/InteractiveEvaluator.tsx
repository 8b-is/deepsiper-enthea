import React, { useState } from 'react'

interface LogMessage {
  time: string
  type: 'eval' | 'tool' | 'score' | 'info'
  text: string
}

export const InteractiveEvaluator: React.FC = () => {
  const [model, setModel] = useState<string>('entheai-leviathan-r1')
  const [evalSuite, setEvalSuite] = useState<string>('tool-rubric')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [logs, setLogs] = useState<LogMessage[]>([
    { time: '00:00.000', type: 'info', text: 'Abyssal Kernel ready. 24 Cordis plugins initialized at -10,920m.' },
    { time: '00:00.120', type: 'info', text: 'Sovereign EntheAI Pod connected (zero cloud telemetry escape).' },
  ])
  const [score, setScore] = useState<number | null>(null)
  const [pressureBar, setPressureBar] = useState<number>(1080)

  const handleRunEvaluation = () => {
    setIsRunning(true)
    setScore(null)
    setLogs([
      { time: '00:00.000', type: 'info', text: `Deploying Subsea Probe [profile: hadal-eval, target: ${model}]...` },
    ])

    const steps: { delay: number; log: LogMessage; pressure: number }[] = [
      {
        delay: 400,
        pressure: 1100,
        log: { time: '00:00.412', type: 'eval', text: `[eval_case] Emitting Sonar Ping on suite "${evalSuite}" (12 assertions)` },
      },
      {
        delay: 900,
        pressure: 1125,
        log: { time: '00:00.920', type: 'tool', text: '[tool_call] bash_run: git diff --check && vitest run --coverage' },
      },
      {
        delay: 1400,
        pressure: 1140,
        log: { time: '00:01.431', type: 'tool', text: '[tool_result] Status: 0 (100% coverage, 0 leaks across hull)' },
      },
      {
        delay: 1900,
        pressure: 1150,
        log: { time: '00:01.910', type: 'eval', text: '[eval_rubric] Validating Landlock bounds & deterministic trajectory log' },
      },
      {
        delay: 2400,
        pressure: 1080,
        log: { time: '00:02.400', type: 'score', text: '[eval_complete] PASS: 12/12 passed (Score: 99.2%, Latency: 2.4ms)' },
      },
    ]

    steps.forEach(({ delay, log, pressure }, index) => {
      setTimeout(() => {
        setLogs(prev => [...prev, log])
        setPressureBar(pressure)
        if (index === steps.length - 1) {
          setIsRunning(false)
          setScore(99.2)
        }
      }, delay)
    })
  }

  return (
    <section id="evaluator" className="sandbox-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Abyssal Benchmark Arena</div>
          <h2 className="section-title">Live Sovereign Evaluation Console</h2>
        </div>

        <div className="sandbox-container">
          <div className="sandbox-controls">
            <div className="form-group">
              <label className="form-label">Select Sovereign Model Pod</label>
              <select
                className="form-select"
                value={model}
                onChange={e => setModel(e.target.value)}
                disabled={isRunning}
              >
                <option value="entheai-leviathan-r1">EntheAI Leviathan-R1 (Air-Gapped Sovereign Node)</option>
                <option value="deepseek-r1-abyss">DeepSeek R1 Abyss (Direct Endpoint)</option>
                <option value="gemini-marine-flash">Gemini 2.5 Marine Flash</option>
                <option value="vllm-submersible">Local vLLM Submersible Cluster</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Evaluation Rubric & Benchmark</label>
              <select
                className="form-select"
                value={evalSuite}
                onChange={e => setEvalSuite(e.target.value)}
                disabled={isRunning}
              >
                <option value="tool-rubric">Tool Execution & Schema Robustness</option>
                <option value="adversarial-bounds">Adversarial Landlock Pressure Escapes</option>
                <option value="reasoning-stability">Multi-Turn Reasoning Invariants</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Hydrodynamic Pressure Hull</label>
              <div style={{
                background: '#070f1e',
                border: '1px solid var(--border-base)',
                borderRadius: 6,
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-cyan)',
              }}>
                <span>LANDLOCK v3 HULL</span>
                <span>{pressureBar} BAR</span>
              </div>
            </div>

            <button
              className="btn btn-accent"
              style={{ marginTop: 8 }}
              onClick={handleRunEvaluation}
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <span className="pulse-dot"></span>
                  <span>Executing Hydrodynamic Run...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Run Abyssal Benchmark</span>
                </>
              )}
            </button>

            {score !== null && (
              <div style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '16px',
                borderRadius: '10px',
                textAlign: 'center',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.2)',
              }}>
                <div style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Acoustic Benchmark Score
                </div>
                <div style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 800 }}>
                  {score}%
                </div>
                <div style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem', marginTop: 4 }}>
                  ✓ 100% Zero-Telemetry Sovereign Isolation
                </div>
              </div>
            )}
          </div>

          <div className="sandbox-output">
            <div className="output-header">
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isRunning ? '#06b6d4' : '#10b981',
                  boxShadow: `0 0 8px ${isRunning ? '#06b6d4' : '#10b981'}`,
                }} />
                Subsea Sonar Telemetry Feed
              </span>
              <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                ACOUSTIC RPC ws://127.0.0.1:3080/rpc
              </span>
            </div>

            <div className="log-stream">
              {logs.map((item, idx) => (
                <div key={idx} className="log-entry">
                  <span className="log-time">{item.time}</span>
                  <span className={`log-type log-type-${item.type}`}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
