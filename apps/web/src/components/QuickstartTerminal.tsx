import React, { useState } from 'react'

export const QuickstartTerminal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'cli' | 'sdk' | 'docker'>('cli')
  const [copied, setCopied] = useState<boolean>(false)

  const commands = {
    cli: `# 1. Clone sovereign harness
git clone https://github.com/8b-is/deepsiper-enthea.git
cd deepsiper-enthea

# 2. Install and build
pnpm install
pnpm build

# 3. Run headless evaluation task
pnpm dsh --profile headless "Evaluate codebase test coverage and tool safety"`,
    sdk: `import { createHarnessClient } from '@deepseek-ai/dsh-sdk'

const client = createHarnessClient({ endpoint: 'ws://127.0.0.1:3080/rpc' })
await client.connect()

const session = await client.createSession({ preset: 'eval-sovereign' })
const stream = session.dispatchTask({
  prompt: 'Run full security audit benchmark',
})

for await (const event of stream) {
  console.log(event.type, event.payload)
}`,
    docker: `# Run air-gapped sovereign container
docker run -d -p 3080:3080 \\
  -e ENTHEAI_BASE_URL="http://host.docker.internal:8000/v1" \\
  -v $(pwd)/workspaces:/app/workspaces \\
  8b-is/deepsiper-enthea:latest`,
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(commands[activeTab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id="quickstart" className="quickstart-section">
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Developer Setup</div>
          <h2 className="section-title">Up and Running in 60 Seconds</h2>
        </div>

        <div className="terminal-box">
          <div className="terminal-header">
            <div className="terminal-dots">
              <div className="dot dot-red"></div>
              <div className="dot dot-yellow"></div>
              <div className="dot dot-green"></div>
            </div>

            <div className="terminal-tabs">
              <button
                className={`terminal-tab ${activeTab === 'cli' ? 'active' : ''}`}
                onClick={() => setActiveTab('cli')}
              >
                CLI Mode
              </button>
              <button
                className={`terminal-tab ${activeTab === 'sdk' ? 'active' : ''}`}
                onClick={() => setActiveTab('sdk')}
              >
                JSON-RPC SDK
              </button>
              <button
                className={`terminal-tab ${activeTab === 'docker' ? 'active' : ''}`}
                onClick={() => setActiveTab('docker')}
              >
                Docker
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <pre className="terminal-body">{commands[activeTab]}</pre>
        </div>
      </div>
    </section>
  )
}
