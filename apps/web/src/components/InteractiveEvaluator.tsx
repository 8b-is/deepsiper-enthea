import React, { useState } from 'react'

interface LogEntry {
  time: string
  type: 'eval' | 'tool' | 'score'
  text: string
}

export const InteractiveEvaluator: React.FC = () => {
  const [model, setModel] = useState<string>('deepseek-r1')
  const [evalSuite, setEvalSuite] = useState<string>('tool-calling')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: '00:00:00', type: 'eval', text: 'System ready in Hadal Trench air-gapped harness.' },
    { time: '00:00:01', type: 'tool', text: 'Landlock sandbox active (read-only system plane, confined workspace write).' },
  ])

  const runEvaluation = () => {
    setIsRunning(true)
    setLogs(prev => [
      ...prev,
      { time: new Date().toLocaleTimeString(), type: 'eval', text: `Initiating evaluation: ${evalSuite} on ${model}...` },
    ])

    setTimeout(() => {
      setLogs(prev => [
        ...prev,
        { time: new Date().toLocaleTimeString(), type: 'tool', text: 'Executing sandboxed bash verification tests with tool timeout bounds...' },
      ])
    }, 900)

    setTimeout(() => {
      setLogs(prev => [
        ...prev,
        { time: new Date().toLocaleTimeString(), type: 'score', text: 'Evaluation complete! Score: 99.4% (All invariants satisfied; zero telemetry leaks).' },
      ])
      setIsRunning(false)
    }, 2200)
  }

  return (
    <section id="interactive-eval" className="sandbox-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Zero-Telemetry Test Arena</div>
          <h2 className="section-title">Run Sandboxed Evaluation Sim</h2>
        </div>

        <div className="sandbox-container">
          <div className="sandbox-controls">
            <div className="form-group">
              <label className="form-label">Sovereign LLM Model</label>
              <select
                className="form-select"
                value={model}
                onChange={(e) => { setModel(e.target.value) }}
                disabled={isRunning}
              >
                <option value="deepseek-r1">DeepSeek R1 (671B MoE / 37B Active)</option>
                <option value="deepseek-v3">DeepSeek V3 (Sovereign Reasoning)</option>
                <option value="entheai-leviathan">EntheAI Leviathan-R1 (Air-Gapped Pod)</option>
                <option value="local-vllm">Local vLLM Submersible Instance</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Evaluation Benchmark Suite</label>
              <select
                className="form-select"
                value={evalSuite}
                onChange={(e) => { setEvalSuite(e.target.value) }}
                disabled={isRunning}
              >
                <option value="tool-calling">Tool-Calling Schema & Argument Rubric</option>
                <option value="cordis-invariants">Cordis Lifecycle & Disposer Invariants</option>
                <option value="landlock-containment">Landlock ABI v3 Boundary Confinement</option>
                <option value="swe-bench-lite">SWE-bench Lite Multi-Turn Repair</option>
              </select>
            </div>

            <button
              onClick={runEvaluation}
              disabled={isRunning}
              className="btn btn-ocean-primary"
              style={{ marginTop: 12 }}
            >
              {isRunning ? 'Evaluating in Sandbox...' : 'Run Sandboxed Evaluation'}
            </button>
          </div>

          <div className="sandbox-output">
            <div className="output-header">
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>SANDBOX TTY LOGS</span>
              <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pulse-dot" style={{ background: '#10b981' }} />
                LANDLOCK ENFORCED
              </span>
            </div>

            <div className="log-stream">
              {logs.map((log, idx) => (
                <div key={idx} className="log-entry">
                  <span className="log-time">[{log.time}]</span>
                  <span className={`log-type log-type-${log.type}`}>
                    {log.type.toUpperCase()}:
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{log.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
