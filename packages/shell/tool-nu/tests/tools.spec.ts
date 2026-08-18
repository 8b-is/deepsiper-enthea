/**
 * Consumer-surface tests for the `nu` tool over a FAKE nushell executor,
 * exercised through `ctx.tools.execute()` so nothing bypasses the tool
 * registry. The fake executor makes every seam outcome scriptable — output
 * text, truncation, timeout, abort, nonzero exits, background handles — so
 * these tests verify the schema, argument validation, workdir derivation,
 * managed `DSH_*` collection, abort translation, canonical result projection,
 * sandbox denial rendering with the escalation surface, rendering,
 * background job wiring, and the UI presenters. Real-nu behavior
 * is pinned separately in integration.spec.ts.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import * as ToolTasks from '@deepseek-ai/dsh-tool-jobs'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import * as ToolNu from '@deepseek-ai/dsh-tool-nu'
import * as NuEnvPlugin from '@deepseek-ai/dsh-shell-env'
import { processOutcome } from '../src/background.ts'
import { renderNuProcessRead, renderNuResult } from '../src/render.ts'

const testToolSignal = new AbortController().signal

const escalateArgs = {
  command: 'echo ok',
  description: 'test escalation',
  sandbox_permissions: 'workspace-write',
  justification: 'the command needs workspace writes',
}

/** A scriptable fake executor: `resolve()` mirrors the real defaulting, `run()` returns the armed foreground script. */
class FakeNu extends ShellExecutor {
  requests: ShellExecRequest[] = []
  specs: ShellExecSpec[] = []
  handler: (spec: ShellExecSpec) => ShellRunResult = () => runResult('')

  override resolve(request: ShellExecRequest): ShellExecSpec {
    this.requests.push(request)
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs: request.timeoutMs ?? 60_000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      ...request.signal ? { signal: request.signal } : {},
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      ...request.env !== undefined ? { env: request.env } : {},
      ...request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    this.specs.push(spec)
    return this.handler(spec)
  }

  override start(): ShellProcess {
    throw new Error('FakeNu.start is not implemented')
  }
}

/** A successful run result over the given stdout; overrides script the failure shapes. */
function runResult(stdout: string, overrides?: Partial<ShellRunResult>): ShellRunResult {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    aborted: false,
    timeoutMs: 60_000,
    stdout: { text: stdout, truncated: false },
    stderr: { text: '', truncated: false },
    ...overrides,
  }
}

/** A settled successful background handle; overrides script failure shapes. */
function fakeProcess(delta = 'bg-ok\n'): ShellProcess {
  let consumed = false
  return {
    status: 'completed',
    exitCode: 0,
    signal: null,
    done: Promise.resolve(),
    readOutput: () => {
      if (consumed) return { delta: '', lossy: false }
      consumed = true
      return { delta, lossy: false }
    },
    kill: () => false,
  }
}

async function setup(toolConfig: Partial<ToolNu.Config> = {}, dshHome?: string) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(NuEnvPlugin, dshHome === undefined ? {} : { dshHome })
  await ctx.plugin(FakeNu)
  await ctx.plugin(ToolNu, toolConfig)
  const nu = ctx.shell as FakeNu
  return { ctx, nu }
}

/** Full harness: the generic job runtime + its controller, then the nu tool. */
async function setupWithTasks(toolConfig: Partial<ToolNu.Config> = {}, dshHome?: string) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalJobRegistry)
  await ctx.plugin(ToolTasks)
  await ctx.plugin(NuEnvPlugin, dshHome === undefined ? {} : { dshHome })
  await ctx.plugin(FakeNu)
  await ctx.plugin(ToolNu, toolConfig)
  const nu = ctx.shell as FakeNu
  return { ctx, nu }
}

/** A CONFINING fake executor (`sandboxMode` advertised): the tool must resolve the calling session's policy and stamp it. */
class ConfiningFakeNu extends ShellExecutor {
  requests: ShellExecRequest[] = []
  modes: Array<string | undefined> = []

  override get sandboxMode() {
    return 'read-only' as const
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    this.requests.push(request)
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs: request.timeoutMs ?? 60_000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      ...request.signal ? { signal: request.signal } : {},
      ...request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    this.modes.push(spec.sandboxPolicy?.mode)
    return runResult('ok\n', {
      sandbox: {
        mode: spec.sandboxPolicy?.mode ?? 'read-only',
        denied: false,
        ...spec.command === 'without optional sandbox facts'
          ? {}
          : { enforcement: 'full' as const, runnerFailed: false },
      },
    })
  }

  override start(): ShellProcess {
    throw new Error('ConfiningFakeNu.start is not implemented')
  }
}

/** Sandboxed composition: the shared policy service + a confining executor + the nu tool (+ optional approval). */
async function setupSandboxed(withApproval = false) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalJobRegistry)
  await ctx.plugin(ToolTasks)
  await ctx.plugin(NuEnvPlugin)
  await ctx.plugin(SandboxPolicyService, {})
  await ctx.plugin(ConfiningFakeNu)
  if (withApproval) await ctx.plugin(ApprovalService)
  await ctx.plugin(ToolNu)
  const nu = ctx.shell as ConfiningFakeNu
  return { ctx, nu }
}

function sandboxAgent(
  mode?: 'read-only' | 'workspace-write' | 'danger-full-access',
  ctx?: Context,
  onAppend?: (type: string) => void,
): Agent {
  const id = SessionId('sandbox-session')
  const events: Array<{ type: string; data?: Record<string, unknown> }> = [{ type: 'turn/start' }]
  if (mode !== undefined) events.push({ type: 'sandbox/mode', data: { mode } })
  return {
    id,
    ...ctx === undefined ? {} : { ctx: ctx.plugin(() => {}).ctx },
    session: {
      id,
      header: { version: 0, id, createdAt: 0 },
      events,
      append: (type: string, data: Record<string, unknown>) => {
        const event = { type, data }
        events.push(event)
        onAppend?.(type)
        return event
      },
    },
  } as unknown as Agent
}

function registerFakeAgent(ctx: Context, sessionId: string): Agent {
  const scopeFiber = ctx.plugin(() => {})
  const id = SessionId(sessionId)
  const agent = {
    id,
    ctx: scopeFiber.ctx,
    session: { id, header: { version: 0, id, createdAt: 0 }, events: [] },
  } as unknown as Agent
  ctx.agents.register(agent)
  return agent
}

let callCounter = 0
function call(ctx: Context, name: string, args: unknown, agent?: Agent, signal?: AbortSignal) {
  return ctx.tools.execute({
    signal: signal ?? testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name,
    arguments: args,
    ...agent ? { agent } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

async function callUntilText(
  ctx: Context,
  name: string,
  args: unknown,
  expected: string,
  timeoutMs = 5_000,
): Promise<Awaited<ReturnType<typeof call>>> {
  const deadline = Date.now() + timeoutMs
  let last: Awaited<ReturnType<typeof call>> | undefined
  while (Date.now() < deadline) {
    last = await call(ctx, name, args)
    if (text(last).includes(expected)) return last
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`tool output did not include ${JSON.stringify(expected)}; last text ${JSON.stringify(last === undefined ? '' : text(last))}`)
}

describe('registration', () => {
  it('registers the nu tool with its prompt section and schema', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'nu')
    expect(schema).toBeDefined()
    expect(schema?.description).toContain('nushell command')
    expect(schema?.parameters.properties).toMatchObject({
      command: { type: 'string' },
      description: { type: 'string' },
      timeoutMs: { type: 'number' },
      workdir: { type: 'string' },
      run_in_background: { type: 'boolean' },
    })
    expect(schema?.parameters.required).toEqual(['command', 'description'])
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toContain('Non-zero exits are reported as `[exit code: N]` markers')
    expect(prompt).toContain('[killed by signal: <signal>]')
  })

  it('stays pending until ctx.shell exists (inject)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ToolNu)
    expect(ctx.tools.schemas()).toHaveLength(0)
  })

  it('unregisters everything on fiber disposal (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NuEnvPlugin)
    await ctx.plugin(FakeNu)
    const fiber = await ctx.plugin(ToolNu)
    expect(ctx.tools.schemas()).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.tools.schemas()).toHaveLength(0)
  })
})

describe('argument validation', () => {
  it('rejects a blank command or description and a non-positive timeoutMs', async () => {
    const { ctx } = await setup()
    expect(text(await call(ctx, 'nu', { command: '  ', description: 'd' }))).toContain('expected a non-empty string')
    expect(text(await call(ctx, 'nu', { command: 'echo hi', description: ' ' }))).toContain('expected a non-empty string')
    expect(text(await call(ctx, 'nu', { command: 'echo hi', description: 'd', timeoutMs: -1 })))
      .toContain('invalid timeoutMs: expected a positive number')
  })
})

describe('execution through the shell seam', () => {
  it('forwards command, session cwd, timeout, and managed DSH_* environment', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'dsh-tool-nu-home-'))
    const { ctx, nu } = await setup({}, dshHome)
    nu.handler = () => runResult('hi\n')
    const agent = registerFakeAgent(ctx, 'session-1')
    Object.assign(agent.session.header, { cwd: '/sessions/s1' })
    const result = await call(ctx, 'nu', {
      command: 'echo hi',
      description: 'say hi',
      timeoutMs: 1234,
    }, agent)
    expect(result.isError).toBe(false)
    const request = nu.requests[0]
    expect(request?.command).toBe('echo hi')
    expect(request?.workdir).toBe('/sessions/s1')
    expect(request?.timeoutMs).toBe(1234)
    expect(request?.dshEnv).toBeDefined()
  })

  it('keeps an absolute workdir as-is', async () => {
    const { ctx, nu } = await setup()
    nu.handler = () => runResult('')
    await call(ctx, 'nu', { command: 'echo hi', description: 'hi', workdir: '/abs' })
    expect(nu.requests[0]?.workdir).toBe('/abs')
  })

  it('resolves a relative workdir against the session cwd', async () => {
    const { ctx, nu } = await setup()
    nu.handler = () => runResult('')
    const agent = registerFakeAgent(ctx, 'session-2')
    Object.assign(agent.session.header, { cwd: '/sessions/s2' })
    await call(ctx, 'nu', { command: 'echo hi', description: 'hi', workdir: 'sub' }, agent)
    expect(nu.requests[0]?.workdir).toBe(resolvePath('/sessions/s2', 'sub'))
  })

  it('returns stdout, stderr in a marked section, and a nonzero exit as a marker, not an error', async () => {
    const { ctx, nu } = await setup()
    nu.handler = () => runResult('out\n', {
      exitCode: 3,
      stderr: { text: 'boom\n', truncated: false },
    })
    const result = await call(ctx, 'nu', { command: 'print -e boom; exit 3', description: 'fail' })
    expect(result.isError).toBe(false)
    expect(text(result)).toBe('out\n[stderr]\nboom\n[exit code: 3]')
  })

  it('reports a timed-out run with the timed-out marker, not an error', async () => {
    const { ctx, nu } = await setup()
    nu.handler = () => runResult('', { timedOut: true, timeoutMs: 500, exitCode: null, signal: 'SIGTERM' })
    const result = await call(ctx, 'nu', { command: 'sleep 1min', description: 'block', timeoutMs: 500 })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('[timed out after 500ms]')
  })

  it('translates an aborted run into the TOOL_ABORTED HarnessError', async () => {
    const { ctx, nu } = await setup()
    nu.handler = () => runResult('', { aborted: true, exitCode: null, signal: 'SIGTERM' })
    const result = await call(ctx, 'nu', { command: 'sleep 1min', description: 'block' })
    expect(result.isError).toBe(true)
    expect(result.error).toMatchObject({ info: { name: 'AbortError', code: TOOL_ABORTED } })
  })

  it('renders a truncation notice with the spill path', async () => {
    const { ctx, nu } = await setup()
    nu.handler = () => runResult('big\n', {
      stdout: { text: 'big\n', truncated: true, spillPath: '/tmp/spill' },
    })
    const result = await call(ctx, 'nu', { command: 'seq 1 10000', description: 'big output' })
    expect(text(result)).toContain('[output truncated; full output: /tmp/spill]')
  })
})

describe('sandbox surface', () => {
  it('stamps the calling session policy on the request and keeps the escalation fields out of sandbox-less compositions', async () => {
    const { ctx, nu } = await setupSandboxed()
    const agent = sandboxAgent()
    const result = await call(ctx, 'nu', { command: 'echo ok', description: 'hi' }, agent)
    expect(result.isError).toBe(false)
    expect(nu.modes[0]).toBe('read-only')

    const plain = await setup()
    const schema = plain.ctx.tools.schemas().find(item => item.name === 'nu')!
    expect(schema.description).not.toContain('sandbox_permissions')
    expect(schema.parameters.properties).not.toHaveProperty('sandbox_permissions')
  })

  it('advertises the sandbox fields and the escalation clause under a confining executor', async () => {
    const { ctx } = await setupSandboxed()
    const schema = ctx.tools.schemas().find(item => item.name === 'nu')!
    const properties = schema.parameters.properties as Record<string, { enum?: string[] }>
    expect(properties['sandbox_permissions']?.enum).toEqual(['workspace-write', 'danger-full-access'])
    expect(schema.description).toContain('approval prompt')
    expect(schema.description).toContain('escalate immediately in the same turn')
  })

  it('rejects non-widening escalation without prompting', async () => {
    const { ctx } = await setupSandboxed(true)
    const result = await call(ctx, 'nu', {
      command: 'echo ok',
      description: 'd',
      sandbox_permissions: 'workspace-write',
      justification: 'needs it',
    }, sandboxAgent('workspace-write'))
    expect(text(result)).toContain('not strictly wider')
  })

  it('fails closed when approval cannot be routed', async () => {
    const withoutService = await setupSandboxed()
    expect(text(await call(withoutService.ctx, 'nu', escalateArgs, sandboxAgent()))).toContain('no approval service')
    const withService = await setupSandboxed(true)
    expect(text(await call(withService.ctx, 'nu', escalateArgs))).toContain('no agent to route')
  })

  it('runs a granted foreground call under the approved mode', async () => {
    const { ctx, nu } = await setupSandboxed(true)
    ctx.on('approval/request', () => Promise.resolve<'allowed-once'>('allowed-once'))
    const agent = sandboxAgent(undefined, ctx)
    ctx.agents.register(agent)
    const result = await call(ctx, 'nu', { ...escalateArgs, sandbox_permissions: 'workspace-write' }, agent)
    expect(result.isError).toBe(false)
    expect(nu.modes).toEqual(['workspace-write'])
  })

  it('rejects sandbox_permissions in a composition without a confining executor', async () => {
    const { ctx } = await setup()
    const result = await call(ctx, 'nu', escalateArgs)
    expect(text(result)).toContain('sandbox_permissions is not available in this composition')
  })

  it('fails the tool plugin when a confining executor lacks ctx.sandboxPolicy', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LocalJobRegistry)
    await ctx.plugin(ToolTasks)
    await ctx.plugin(NuEnvPlugin)
    await ctx.plugin(ConfiningFakeNu)
    await expect(ctx.plugin(ToolNu)).rejects.toThrow(/ctx\.sandboxPolicy is missing/)
  })
})

describe('background execution', () => {
  it('starts a background job and settles it through job_output and job_kill', async () => {
    const { ctx } = await setupWithTasks()
    ctx.shell.start = () => fakeProcess('bg-work\n')
    const started = await call(ctx, 'nu', { command: 'sleep 100ms', description: 'bg', run_in_background: true })
    expect(started.isError).toBe(false)
    expect(started.value).toMatchObject({ kind: 'background' })
    const jobId = (started.value as { jobId: string }).jobId
    const read = await callUntilText(ctx, 'job_output', { job_id: jobId }, 'bg-work')
    expect(text(read)).toContain('[status: completed, exit code: 0]')
  })

  it('rejects run_in_background when disabled', async () => {
    const { ctx } = await setupWithTasks({ enableRunInBackground: false })
    const result = await call(ctx, 'nu', { command: 'sleep 100ms', description: 'bg', run_in_background: true })
    expect(text(result)).toContain('run_in_background is disabled for this deployment')
  })

  it('an abort after approval settles the background dispatch as TOOL_ABORTED', async () => {
    const { ctx } = await setupSandboxed(true)
    const controller = new AbortController()
    const agent = sandboxAgent(undefined, ctx, (type) => {
      if (type === 'approval/decided') controller.abort()
    })
    ctx.agents.register(agent)
    ctx.on('approval/request', () => Promise.resolve('allowed-once' as const))
    const result = await ctx.tools.execute({
      callId: CallId('cancelled-escalation-background'),
      name: 'nu',
      arguments: { ...escalateArgs, run_in_background: true },
      agent,
      signal: controller.signal,
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toBe('Error: tool call aborted')
  })

  it('reports a missing jobs runtime', async () => {
    const { ctx } = await setup({})
    const result = await call(ctx, 'nu', { command: 'sleep 100ms', description: 'bg', run_in_background: true })
    expect(text(result)).toContain('background jobs unavailable')
  })
})

describe('UI presenters', () => {
  it('renders a foreground terminal card and a background generic card via presentCall', async () => {
    const { ctx } = await setup()
    const definition = ctx.tools.get('nu')
    expect(definition?.presentCall?.({ command: 'echo hi', description: 'say hi' })).toMatchObject({ card: 'terminal' })
    expect(definition?.presentCall?.({ command: 'echo hi', description: 'say hi', run_in_background: true })).toMatchObject({ card: 'generic' })
    expect(definition?.presentResult?.(
      { command: 'echo hi', description: 'hi', run_in_background: true },
      { content: [{ type: 'text', text: 'started background job j1\n' }], isError: false },
    )).toMatchObject({ card: 'generic' })
  })

  it('presentResult: parses the exit marker out of the terminal output', async () => {
    const { ctx } = await setup()
    const definition = ctx.tools.get('nu')
    expect(definition?.presentResult?.(
      { command: 'echo hi', description: 'hi' },
      { content: [{ type: 'text', text: 'oops\n[exit code: 3]' }], isError: false },
    )).toMatchObject({ card: 'terminal', exitCode: 3 })
  })
})

describe('render helpers', () => {
  it('renders foreground markers: denied, timeout, signal, and clean', () => {
    expect(renderNuResult({ exitCode: 1, signal: null, timedOut: false, timeoutMs: 1000, stdout: { text: '', truncated: false }, stderr: { text: '', truncated: false } })).toBe('(no output)\n[exit code: 1]')
    expect(renderNuResult({
      exitCode: 0,
      signal: null,
      timedOut: false,
      timeoutMs: 1000,
      stdout: { text: '', truncated: false },
      stderr: { text: '', truncated: false },
      sandbox: { mode: 'read-only', denied: true, enforcement: 'full' },
    }, ['workspace-write'])).toContain('[sandbox: file access denied under read-only mode]')
    expect(renderNuResult({
      exitCode: null,
      signal: 'SIGKILL',
      timedOut: false,
      timeoutMs: 1000,
      stdout: { text: '', truncated: false },
      stderr: { text: '', truncated: false },
    })).toContain('[killed by signal: SIGKILL]')
    expect(renderNuResult({
      exitCode: null,
      signal: null,
      timedOut: true,
      timeoutMs: 500,
      stdout: { text: '', truncated: false },
      stderr: { text: '', truncated: false },
    })).toContain('[timed out after 500ms]')
    expect(renderNuResult({
      exitCode: 0,
      signal: null,
      timedOut: false,
      timeoutMs: 1000,
      stdout: { text: 'clean\n', truncated: false },
      stderr: { text: '', truncated: false },
    })).toBe('clean\n')
  })

  it('renders process-read notices for loss and runner failure', () => {
    expect(renderNuProcessRead({ delta: 'out\n', lossy: true, stdoutSpillPath: '/s/o', stderrSpillPath: '/s/e' })).toContain('[some output was dropped from memory; full output: /s/o, /s/e]')
    expect(renderNuProcessRead({ delta: '', lossy: false }, { mode: 'read-only', denied: false, runnerFailed: true })).toContain('the sandbox runner itself failed')
    expect(renderNuProcessRead({ delta: 'x', lossy: false }, { mode: 'read-only', denied: true })).toContain('[sandbox: file access denied under read-only mode]')
    expect(renderNuProcessRead({ delta: 'x', lossy: false }, { mode: 'read-only', denied: true }, ['workspace-write'])).toContain('escalation available')
    expect(renderNuProcessRead({ delta: 'd', lossy: false })).toBe('d')
  })

  it('maps settled processes to generic task outcomes', () => {
    expect(processOutcome({ status: 'killed', exitCode: null, signal: 'SIGTERM' } as never)).toEqual({ status: 'killed', detail: 'signal: SIGTERM' })
    expect(processOutcome({ status: 'killed', exitCode: null, signal: null } as never)).toEqual({ status: 'killed', detail: 'killed before exit' })
    expect(processOutcome({ status: 'completed', exitCode: 0, signal: null } as never)).toEqual({ status: 'completed', detail: 'exit code: 0' })
  })
})
