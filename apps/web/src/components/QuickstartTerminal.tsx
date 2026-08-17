import React, { useState } from 'react'

export const QuickstartTerminal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'cli' | 'sdk' | 'docker'>('cli')
  const [copied, setCopied] = useState<boolean>(false)

  const commands = {
    cli: `# 1. Clone sovereign harness fork
git clone https://github.com/8b-is/deepsiper-enthea.git
cd deepsiper-enthea

# 2. Install dependencies with pnpm & TypeScript 6
pnpm install

# 3. Launch the sovereign web console & JSON-RPC gateway
pnpm dsh web`,
    sdk: `// Programmatic JSON-RPC Client Integration
import { Client } from '@deepseek-ai/dsh-sdk'

const client = new Client({
  url: 'http://127.0.0.1:3080/rpc',
  token: process.env.DSH_RPC_TOKEN,
})

// Dispatch evaluation agent in isolated Landlock sandbox
const session = await client.createSession({
  model: 'deepseek-r1',
  sandbox: 'landlock-v3',
})

const result = await session.executeTask('Audit invariants on Cordis graph')
console.log('Telemetry score:', result.score)`,
    docker: `# Run air-gapped sovereign Docker container
docker run -d \\
  --name deepsiper-harness \\
  --security-opt seccomp=unconfined \\
  --cap-add SYS_ADMIN \\
  -p 3080:3080 \\
  -v $(pwd)/workspace:/workspace \\
  ghcr.io/8b-is/deepsiper-enthea:latest`,
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(commands[activeTab])
    setCopied(true)
    setTimeout(() => { setCopied(false) }, 2000)
  }

  return (
    <section id="quickstart" className="quickstart-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Zero to Hadal Trench</div>
          <h2 className="section-title">Quickstart Deployment</h2>
        </div>

        <div className="terminal-box">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>

            <div className="terminal-tabs">
              <button
                className={`terminal-tab ${activeTab === 'cli' ? 'active' : ''}`}
                onClick={() => { setActiveTab('cli') }}
              >
                CLI Submersible
              </button>
              <button
                className={`terminal-tab ${activeTab === 'sdk' ? 'active' : ''}`}
                onClick={() => { setActiveTab('sdk') }}
              >
                TypeScript SDK
              </button>
              <button
                className={`terminal-tab ${activeTab === 'docker' ? 'active' : ''}`}
                onClick={() => { setActiveTab('docker') }}
              >
                Air-Gapped Docker
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>

          <div className="terminal-body">
            <pre>{commands[activeTab]}</pre>
          </div>
        </div>
      </div>
    </section>
  )
}
