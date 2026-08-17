import React, { useState } from 'react'

interface LogMessage {
  time: string
  type: 'eval' | 'tool' | 'score' | 'info'
  text: string
}

export const InteractiveEvaluator: React.FC = () => {
  const [model, setModel] = useState<string>('entheai-sovereign-r1')
  const [evalSuite, setEvalSuite] = useState<string>('tool-rubric')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [logs, setLogs] = useState<LogMessage[]>([
    { time: '00:00.000', type: 'info', text: 'Kernel ready. Cordis context initialized with 24 plugins.' },
    { time: '00:00.120', type: 'info', text: 'Sovereign backend connected at http://127.0.0.1:8000/v1.' },
  ])
  const [score, setScore] = useState<number | null>(null)

  const handleRunEvaluation = () => {
    setIsRunning(true)
    setScore(null)
    setLogs([
      { time: '00:00.000', type: 'info', text: `Initializing session [profile: sovereign-eval, model: ${model}]...` },
    ])

    const steps: { delay: number; log: LogMessage }[] = [
      { delay: 400, log: { time: '00:00.412', type: 'eval', text: `[eval_case] Loading benchmark suite "${evalSuite}" (12 assertions)` } },
      { delay: 900, log: { time: '00:00.920', type: 'tool', text: '[tool_call] bash_run: git diff --check && vitest run --coverage' } },
      { delay: 1400, log: { time: '00:01.431', type: 'tool', text: '[tool_result] Status: 0 (100% coverage, 0 lint regressions)' } },
      { delay: 1900, log: { time: '00:01.910', type: 'eval', text: '[eval_rubric] Verifying tool parameter typing and Landlock bounds' } },
      { delay: 2400, log: { time: '00:02.400', type: 'score', text: '[eval_complete] PASS: 12/12 passed (Score: 98.4%, Latency: 2.4s)' } },
    ]

    steps.forEach(({ delay, log }, index) => {
      setTimeout(() => {
        setLogs(prev => [...prev, log])
        if (index === steps.length - 1) {
          setIsRunning(false)
          setScore(98.4)
        }
      }, delay)
    })
  }

  return (
    <section id="evaluator" className="sandbox-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Interactive Evaluation Sandbox</div>
          <h2 className="section-title">Live Harness Evaluation Console</h2>
        </div>

        <div className="sandbox-container">
          <div className="sandbox-controls">
            <div className="form-group">
              <label className="form-label">Select Model Target</label>
              <select
                className="form-select"
                value={model}
                onChange={e => setModel(e.target.value)}
                disabled={isRunning}
              >
                <option value="entheai-sovereign-r1">EntheAI Sovereign-R1 (Local VPC)</option>
                <option value="deepseek-r1">DeepSeek R1 (API)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="vllm-local">Local vLLM Cluster</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Evaluation Rubric</label>
              <select
                className="form-select"
                value={evalSuite}
                onChange={e => setEvalSuite(e.target.value)}
                disabled={isRunning}
              >
                <option value="tool-rubric">Tool Execution & Schema Robustness</option>
                <option value="adversarial-bounds">Adversarial Landlock Escapes</option>
                <option value="reasoning-stability">Multi-Turn Reasoning Invariants</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Sandboxing Level</label>
              <input
                className="form-input"
                type="text"
                value="Landlock Full (Read-Only Root, Isolated FS)"
                readOnly
              />
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
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Run Benchmark Evaluation</span>
                </>
              )}
            </button>

            {score !== null && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '12px',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  Evaluation Score
                </div>
                <div style={{ color: '#ffffff', fontSize: '1.75rem', fontWeight: 800 }}>
                  {score}%
                </div>
              </div>
            )}
          </div>

          <div className="sandbox-output">
            <div className="output-header">
              <span style={{ color: 'var(--text-muted)' }}>Session Telemetry Log Stream</span>
              <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>RPC 2.0 ws://127.0.0.1:3080</span>
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
