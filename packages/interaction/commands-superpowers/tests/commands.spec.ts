import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import SubagentRuntime, { type SubagentProvider } from '@deepseek-ai/dsh-subagent'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalBashExecutor from '@deepseek-ai/dsh-bash-local'
import * as CommandsSuperpowers from '@deepseek-ai/dsh-commands-superpowers'
import {
  brainstormPrompt,
  implementerPrompt,
  parseWorktreeInput,
  plannerPrompt,
  reviewerPrompt,
  worktreePath,
  worktreeRootOf,
} from '@deepseek-ai/dsh-commands-superpowers'

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0

/** A scripted subagent provider returning canned output per phase label. */
function scriptedProvider(replies: Record<string, string>): SubagentProvider {
  return {
    name: 'spawn',
    capabilities: { outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
    inheritsParentContext: false,
    start: async request => ({
      id: SessionId('fake-child'),
      localAgent: undefined,
      result: Promise.resolve({
        output: [{ type: 'text', text: replies[request.label ?? ''] ?? 'phase-ok' }],
        stopReason: 'completed',
      }),
      dispose: async () => {},
    }),
  }
}

/** Mint a scope whose key is a live agent (real session for command lifecycle). */
async function mintAgentScope(ctx: Context, name: string, cwd?: string): Promise<{ scope: Scope; agent: Agent }> {
  const session = ctx.sessions.create(SessionId(name), cwd === undefined ? {} : { meta: { cwd } })
  const agent = { id: session.id, session } as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, { inject: ['commands'] }))
  return { scope, agent }
}

async function boot(withSubagents = true, withShell = true, providerReplies: Record<string, string> = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CommandRuntime)
  if (withShell) await ctx.plugin(LocalSubprocessRuntime)
  if (withShell) await ctx.plugin(LocalBashExecutor, { timeoutMs: 20_000, graceMs: 200 })
  if (withSubagents) {
    await ctx.plugin(SubagentRuntime)
    ctx.subagents.registerProvider(scriptedProvider(providerReplies))
  }
  await ctx.plugin(CommandsSuperpowers, {})
  return ctx
}

describe('registration', () => {
  it('registers brainstorm, sdd, and worktree', async () => {
    const ctx = await boot()
    const { agent } = await mintAgentScope(ctx, 'reg')
    const names = ctx.commands.list(agent).map(item => item.name)
    expect(names).toEqual(['brainstorm', 'sdd', 'worktree'])
  })
})

describe('parseWorktreeInput', () => {
  it('parses create/list/remove and requires a branch where needed', () => {
    expect(parseWorktreeInput('  create  feat-x  ')).toEqual({ subcommand: 'create', branch: 'feat-x' })
    expect(parseWorktreeInput('list')).toEqual({ subcommand: 'list' })
    expect(parseWorktreeInput('remove feat-x')).toEqual({ subcommand: 'remove', branch: 'feat-x' })
    expect(() => parseWorktreeInput('create')).toThrow(/requires a branch name/)
    expect(() => parseWorktreeInput('nope')).toThrow(/takes create <branch> | list | remove <branch>/)
  })
})

describe('worktree path helpers', () => {
  it('defaults the worktree parent into the repo', () => {
    expect(worktreeRootOf('/repo')).toBe('/repo/.dsh-worktrees')
    expect(worktreeRootOf('/repo', '/custom')).toBe('/custom')
    expect(worktreePath('/repo', 'feat-x')).toBe('/repo/.dsh-worktrees/feat-x')
  })
})

describe('prompts', () => {
  it('pins the brainstorm prompt', () => {
    expect(brainstormPrompt('serverless bus')).toContain('serverless bus')
    expect(brainstormPrompt('serverless bus')).toContain('clarifying questions')
  })

  it('pins the sdd phase prompts with the task and workspace', () => {
    expect(plannerPrompt('add retry', '/ws')).toContain('add retry')
    expect(plannerPrompt('add retry', '/ws')).toContain('/ws')
    expect(plannerPrompt('add retry', '/ws')).toContain('numbered plan')
    const plan = '1. add client/retry.ts\n2. wire it in'
    expect(implementerPrompt('add retry', plan, '/ws')).toContain('1. add client/retry.ts')
    expect(reviewerPrompt('add retry', 'done', '/ws')).toContain('APPROVE or')
  })
})

describe('/brainstorm', () => {
  it('runs a brainstorm phase and returns its output', async () => {
    const ctx = await boot(true, false, { brainstorm: 'Idea is sound. Risk: cold start. Question: target latency?' })
    const { agent } = await mintAgentScope(ctx, 'b1')
    const execution = await ctx.commands.execute(agent, '/brainstorm serverless bus', new AbortController().signal)
    expect(execution?.result).toEqual({ kind: 'success', text: 'Idea is sound. Risk: cold start. Question: target latency?' })
  })

  it('fails loud on a missing idea', async () => {
    const ctx = await boot()
    const { agent } = await mintAgentScope(ctx, 'b2')
    await expect(ctx.commands.execute(agent, '/brainstorm', new AbortController().signal))
      .rejects.toThrow(/needs an idea/)
  })
})

describe('/sdd', () => {
  it('runs plan, implement, and review phases in order and combines their output', async () => {
    const seen: string[] = []
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(CommandRuntime)
    await ctx.plugin(SubagentRuntime)
    ctx.subagents.registerProvider({
      name: 'spawn',
      capabilities: { outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
      inheritsParentContext: false,
      start: async (request) => {
        seen.push(request.label ?? '')
        const reply = request.label === 'sdd:plan' ? 'PLAN-1' : request.label === 'sdd:implement' ? 'IMP-1' : 'APPROVE'
        return {
          id: SessionId('fake-child'),
          localAgent: undefined,
          result: Promise.resolve({ output: [{ type: 'text', text: reply }], stopReason: 'completed' }),
          dispose: async () => {},
        }
      },
    })
    await ctx.plugin(CommandsSuperpowers, {})
    const { agent } = await mintAgentScope(ctx, 's1')
    const execution = await ctx.commands.execute(agent, '/sdd add a retry with backoff', new AbortController().signal)
    expect(seen).toEqual(['sdd:plan', 'sdd:implement', 'sdd:review'])
    expect(execution?.result.kind).toBe('success')
    const text = (execution?.result as { text?: string }).text ?? ''
    expect(text).toContain('PLAN-1')
    expect(text).toContain('IMP-1')
    expect(text).toContain('APPROVE')
  })

  it('fails loud on a missing task and without a subagent runtime', async () => {
    const ctx = await boot()
    const { agent } = await mintAgentScope(ctx, 's2')
    await expect(ctx.commands.execute(agent, '/sdd', new AbortController().signal)).rejects.toThrow(/needs a task/)

    const bare = await boot(false)
    const { agent: bareAgent } = await mintAgentScope(bare, 's3')
    await expect(bare.commands.execute(bareAgent, '/sdd build a thing', new AbortController().signal))
      .rejects.toThrow(/needs `ctx\.subagents`/)
  })
})

describe('/worktree (real git)', () => {
  it.skipIf(!hasGit)('creates, lists, and removes a worktree in a real repo', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'dsh-wt-'))
    execSync('git init -q -b main', { cwd: repo })
    execSync('git config user.email test@example.com && git config user.name test', { cwd: repo })
    execSync('echo hi > f.txt && git add f.txt && git commit -qm init', { cwd: repo })

    const ctx = await boot(false, true)
    const { agent } = await mintAgentScope(ctx, 'w1', repo)

    const created = await ctx.commands.execute(agent, '/worktree create feat-x', new AbortController().signal)
    expect((created?.result as { kind: string; text?: string }).kind).toBe('success')
    expect((created?.result as { text?: string }).text).toContain('.dsh-worktrees/feat-x')
    expect(execSync('git branch --list feat-x', { cwd: repo, encoding: 'utf8' })).toContain('feat-x')

    const listed = await ctx.commands.execute(agent, '/worktree list', new AbortController().signal)
    expect((listed?.result as { text?: string }).text).toContain('.dsh-worktrees/feat-x')

    const removed = await ctx.commands.execute(agent, '/worktree remove feat-x', new AbortController().signal)
    expect((removed?.result as { text?: string }).text).toContain('removed')
    expect(execSync('git worktree list', { cwd: repo, encoding: 'utf8' })).not.toContain('feat-x')
  })

  it('fails loud in a non-repository and with invalid input', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'dsh-notrepo-'))
    const ctx = await boot(false, true)
    const { agent } = await mintAgentScope(ctx, 'w2', plain)
    await expect(ctx.commands.execute(agent, '/worktree create feat-x', new AbortController().signal))
      .rejects.toThrow(/not a git repository/)
    await expect(ctx.commands.execute(agent, '/worktree nope', new AbortController().signal))
      .rejects.toThrow(/takes create <branch> | list | remove <branch>/)
  })

  it('fails loud without a shell seam', async () => {
    const ctx = await boot(false, false)
    const { agent } = await mintAgentScope(ctx, 'w3')
    await expect(ctx.commands.execute(agent, '/worktree list', new AbortController().signal))
      .rejects.toThrow(/needs `ctx\.shell`/)
  })
})
