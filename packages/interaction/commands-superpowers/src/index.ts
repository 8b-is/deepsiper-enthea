/**
 * Core superpowers slash commands, adapted from the workspace's superpowers
 * skill set into the harness's `ctx.commands` seam: `/brainstorm` (Socratic
 * idea exploration), `/sdd` (subagent-driven development — the default flow
 * for complex work: plan → implement → review, each phase a subagent run),
 * and `/worktree` (native git worktree usage for isolated task lanes).
 *
 * Subagent phases run through `ctx.subagents` on the configured provider,
 * scoped to the receiving agent's initiator so lineage, workspace, and depth
 * derive from its session. `/worktree` runs git through `ctx.shell`.
 * @module @deepseek-ai/dsh-commands-superpowers
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentRun } from '@deepseek-ai/dsh-subagent'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-subagent'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-shell'

export const name = 'commands-superpowers'
export const inject = ['commands', 'agents'] as const

/**
 * Plugin config. `provider` selects the `ctx.subagents` provider backing the
 * subagent phases (default `spawn`); `maxDepth` caps delegation depth for
 * each phase.
 */
export interface Config {
  /** Subagent provider name for the brainstorm/sdd phases (default `spawn`). */
  provider?: string
  /** Absolute delegation-depth cap for each phase child (opt-in; only passed when set). */
  maxDepth?: number
  /** Worktree parent directory; defaults to `<repoRoot>/.dsh-worktrees`. */
  worktreeRoot?: string
}

export const Config: z<Config> = z.object({
  provider: z.string().default('spawn'),
  maxDepth: z.number(),
  worktreeRoot: z.string(),
})

/** One text block for a subagent prompt. */
function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

/** Join a settled child's content blocks into one string. */
function outputText(run: SubagentRun): Promise<string> {
  return run.result.then(result => result.output.map(block => block.type === 'text' ? block.text : '').join(''))
}

/** Run one phase child under the receiving agent's initiator scope. */
function phase(
  ctx: Context,
  agent: Agent,
  provider: string,
  maxDepth: number | undefined,
  label: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const subagents = ctx.get('subagents')
  if (subagents === undefined) {
    throw new Error('commands-superpowers: this command needs `ctx.subagents` (mount a subagent provider)')
  }
  return ctx.agents.withInitiator(agent, () =>
    subagents.start(provider, {
      label,
      prompt: [textBlock(prompt)],
      parent: agent,
      signal,
      ...maxDepth !== undefined ? { maxDepth } : {},
    }).then(run => outputText(run).finally(() => { void run.dispose() })))
}

/** The pinned brainstorm prompt — Socratic exploration, questions, refined statement. */
export function brainstormPrompt(idea: string): string {
  return 'You are a brainstorming partner. Explore this idea:\n'
    + `\n${idea}\n\n`
    + 'Surface assumptions, unknowns, trade-offs, and edge cases. End with the '
    + '3-5 clarifying questions that matter most and a one-paragraph refined '
    + 'statement of the idea. Be terse; no filler.'
}

/** The pinned planner prompt for `/sdd`. */
export function plannerPrompt(task: string, cwd: string): string {
  return 'You are the planner in a subagent-driven-development flow. Produce a '
    + 'concrete implementation plan for this task:\n'
    + `\n${task}\n\n`
    + `Workspace: ${cwd}\n\n`
    + 'Return ONLY a numbered plan. Each step must name concrete file targets '
    + 'and the acceptance check that proves it done. Flag risks and open '
    + 'questions. No prose preamble or summary.'
}

/** The pinned implementer prompt for `/sdd`. */
export function implementerPrompt(task: string, plan: string, cwd: string): string {
  return 'You are the implementer in a subagent-driven-development flow. '
    + 'Implement this task exactly per the plan:\n'
    + `\nTASK\n${task}\n\n`
    + `PLAN\n${plan}\n\n`
    + `Workspace: ${cwd}\n\n`
    + 'After implementing, report what changed (files, commands, commits) and '
    + 'any deviations from the plan. Be terse.'
}

/** The pinned reviewer prompt for `/sdd`. */
export function reviewerPrompt(task: string, report: string, cwd: string): string {
  return 'You are the reviewer in a subagent-driven-development flow. Review the '
    + 'implementation against the task:\n'
    + `\nTASK\n${task}\n\n`
    + `IMPLEMENTATION REPORT\n${report}\n\n`
    + `Workspace: ${cwd}\n\n`
    + 'Inspect the actual diff in the workspace. Verdict: APPROVE or '
    + 'REQUEST_CHANGES, each with concrete reasons. Be terse.'
}

/** The worktree parent directory for one repo. */
export function worktreeRootOf(repoRoot: string, configured?: string): string {
  return configured ?? `${repoRoot}/.dsh-worktrees`
}

/** The git worktree path for one branch. */
export function worktreePath(repoRoot: string, branch: string, configured?: string): string {
  return `${worktreeRootOf(repoRoot, configured)}/${branch}`
}

/**
 * Parse the `/worktree` subcommand line into `(subcommand, branch?)`.
 * @returns the subcommand and optional branch argument.
 */
export function parseWorktreeInput(rawInput: string): { subcommand: 'create' | 'list' | 'remove'; branch?: string } {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean)
  const subcommand = tokens[0]
  if (subcommand !== 'create' && subcommand !== 'list' && subcommand !== 'remove') {
    throw new Error('commands-superpowers: /worktree takes create <branch> | list | remove <branch>')
  }
  if (subcommand === 'list') return { subcommand }
  const branch = tokens[1]
  if (branch === undefined || branch.length === 0) {
    throw new Error(`commands-superpowers: /worktree ${subcommand} requires a branch name`)
  }
  return { subcommand, branch }
}

/**
 * Install the three superpowers commands.
 * @param ctx - plugin context; commands are scoped to it and disposed with it.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const provider = config.provider as string
  const maxDepth = config.maxDepth
  if (maxDepth !== undefined && (!Number.isInteger(maxDepth) || maxDepth < 0)) {
    throw new Error(`commands-superpowers: invalid maxDepth ${String(maxDepth)} — must be a non-negative integer`)
  }

  const configuredWorktreeRoot = config.worktreeRoot

  /** Resolve the shell seam on demand; worktree needs it and fails loud without it. */
  const shell = (): ShellExecutor => {
    const seam = ctx.get('shell')
    if (seam === undefined) {
      throw new Error('commands-superpowers: /worktree needs `ctx.shell` (mount a shell executor)')
    }
    return seam
  }

  /** Resolve the repo root from the agent's session cwd. */
  async function repoRoot(agent: Agent): Promise<string> {
    const result = await shell().run(shell().resolve({
      command: 'git rev-parse --show-toplevel',
      workdir: agent.session.header.cwd ?? process.cwd(),
    }))
    const root = result.stdout.text.trim()
    if (result.exitCode !== 0 || root.length === 0) {
      throw new Error('commands-superpowers: not a git repository — `git rev-parse --show-toplevel` failed')
    }
    return root
  }

  /** Run one git command inside the repo and return its trimmed stdout. */
  async function git(repo: string, argv: readonly string[]): Promise<string> {
    const result = await shell().run(shell().resolve({
      command: `git ${argv.join(' ')}`,
      workdir: repo,
    }))
    const output = result.stdout.text.trim()
    if (result.exitCode !== 0) {
      throw new Error(`commands-superpowers: git ${argv.join(' ')} failed: ${output || result.stderr.text.trim()}`)
    }
    return output
  }

  ctx.commands.register({
    name: 'brainstorm',
    description: 'Explore an idea Socratically: assumptions, trade-offs, edge cases, then the questions that matter and a refined statement',
    input: { hint: '<idea>' },
    async handler(invocation: CommandInvocation): Promise<CommandResult> {
      const idea = invocation.rawInput.trim()
      if (idea.length === 0) {
        throw new Error('commands-superpowers: /brainstorm needs an idea — e.g. `/brainstorm serverless event bus`')
      }
      const output = await phase(ctx, invocation.agent, provider, maxDepth, 'brainstorm', brainstormPrompt(idea), invocation.signal)
      return { kind: 'success', text: output }
    },
  })

  ctx.commands.register({
    name: 'sdd',
    description: 'Subagent-driven development (default for complex work): a planner produces a plan, an implementer executes it, a reviewer verifies it',
    input: { hint: '<task>' },
    async handler(invocation: CommandInvocation): Promise<CommandResult> {
      const task = invocation.rawInput.trim()
      if (task.length === 0) {
        throw new Error('commands-superpowers: /sdd needs a task — e.g. `/sdd add a retry with backoff to the HTTP client`')
      }
      const cwd = invocation.agent.session.header.cwd ?? process.cwd()
      // Each phase forwards the invocation signal to subagents.start, which
      // rejects an aborted start — no intermediate check needed between phases.
      const plan = await phase(ctx, invocation.agent, provider, maxDepth, 'sdd:plan', plannerPrompt(task, cwd), invocation.signal)
      const report = await phase(ctx, invocation.agent, provider, maxDepth, 'sdd:implement', implementerPrompt(task, plan, cwd), invocation.signal)
      const review = await phase(ctx, invocation.agent, provider, maxDepth, 'sdd:review', reviewerPrompt(task, report, cwd), invocation.signal)
      return {
        kind: 'success',
        text: `PLAN\n${plan}\n\nIMPLEMENTATION\n${report}\n\nREVIEW\n${review}`,
      }
    },
  })

  ctx.commands.register({
    name: 'worktree',
    description: 'Native git worktree usage: create <branch> starts an isolated task lane, list shows lanes, remove <branch> tears one down',
    input: { hint: 'create <branch> | list | remove <branch>' },
    async handler(invocation: CommandInvocation): Promise<CommandResult> {
      const { subcommand, branch } = parseWorktreeInput(invocation.rawInput)
      const root = await repoRoot(invocation.agent)
      if (subcommand === 'list') {
        return { kind: 'success', text: await git(root, ['worktree', 'list']) }
      }
      const path = worktreePath(root, branch as string, configuredWorktreeRoot)
      if (subcommand === 'create') {
        await git(root, ['worktree', 'add', path, '-b', branch as string])
        return { kind: 'success', text: `worktree ${path} created on branch ${branch}` }
      }
      await git(root, ['worktree', 'remove', '--force', path])
      return { kind: 'success', text: `worktree ${path} removed` }
    },
  })
}
