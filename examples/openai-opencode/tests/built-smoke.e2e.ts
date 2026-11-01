/** Built CLI and real Loader verification for the opt-in OpenCode overlay. Requires pnpm build. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const overlay = join(root, 'examples/openai-opencode/cordis.patch.yml')

it('publishes the Astra catalog and selects it for a fresh web session without a model call', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-opencode-web-'))
  const launch = resolveExampleLaunch({
    srcBin: join(root, 'apps/cli/src/bin.ts'),
    mode: 'lib',
    configArgs: ['--profile', 'web', '--patch', overlay, '--port', '0'],
    env: {
      DSH_HOME: join(cwd, '.dsh'), DSH_AGENTS_HOME: join(cwd, '.agents'),
      DSH_OPENCODE_ACCESS_TOKEN: 'keyless-no-provider-request', DSH_TELEMETRY_DISABLED: '1',
    },
  })
  const child = execa(launch.command, launch.args, { cwd, env: launch.env, reject: false, timeout: 30_000, forceKillAfterDelay: 5_000 })
  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        const ready = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1]
        if (ready !== undefined) resolve(ready)
      })
      void child.then((result) => { reject(new Error(`web exited before readiness: ${result.stderr}`)) })
    })
    const rpc = async (method: string, payload: object): Promise<Record<string, unknown>> => {
      const response = await fetch(`${baseUrl}/api/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'opencode-smoke', method, payload }),
      })
      expect(response.status).toBe(200)
      const body = await response.json() as { result: { ok: boolean; value: Record<string, unknown> } }
      expect(body.result.ok).toBe(true)
      return body.result.value
    }
    const { sessionId } = await rpc('session.create', {})
    const selected = await rpc('session.models', { sessionId })
    expect(selected).toMatchObject({ current: { provider: 'openai-codex', model: 'gpt-6-astra' }, routable: true })
    const catalog = await rpc('llm.models', {})
    const groups = catalog.groups as { id: string }[]
    expect(groups.find(group => group.id === 'openai-codex')).toMatchSnapshot()
  } finally {
    child.kill('SIGTERM')
    const result = await child
    await rm(cwd, { recursive: true, force: true })
    expect(result.timedOut).toBe(false)
    expect(result.signal).not.toBe('SIGKILL')
  }
}, 45_000)

it.skipIf(process.env.DSH_OPENCODE_E2E !== '1')('uses the active OpenCode connection to create and read a real file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-opencode-live-'))
  try {
    const result = await execa(process.execPath, [
      '--import', import.meta.resolve('tsx'), join(root, 'scripts/opencode-local.ts'), 'headless',
      'Use bash to write exactly OPENCODE_ASTRA_TOOL_OK followed by a newline to proof.txt in the working directory, then read it with a tool and reply with its contents. Do not modify any other files.',
    ], {
      cwd, env: { DSH_HOME: join(cwd, '.dsh'), DSH_AGENTS_HOME: join(cwd, '.agents'), DSH_TELEMETRY_DISABLED: '1' },
      timeout: 120_000, forceKillAfterDelay: 5_000,
    })
    expect(await readFile(join(cwd, 'proof.txt'), 'utf8')).toBe('OPENCODE_ASTRA_TOOL_OK\n')
    expect(result.stdout).toContain('OPENCODE_ASTRA_TOOL_OK')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}, 135_000)
