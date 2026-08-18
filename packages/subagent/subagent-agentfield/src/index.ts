/**
 * AgentField swe_af one-shot subagent provider. Every accepted run dispatches
 * the task to the AgentField control plane's `swe_af.solve_issue` reasoner
 * (async execute + poll) and returns the terminal result as the child output.
 *
 * @module @deepseek-ai/dsh-subagent-agentfield
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  NO_START_CAPABILITIES,
  assertPositiveFinite,
  resolveChildCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import { startAgentFieldRun, type AgentFieldRunSpec } from './run.ts'

export const name = 'subagent-agentfield'
export const inject = ['subagents']

/** Deployment-owned control plane endpoint and polling policy. */
export interface Config {
  /** Control plane base URL (defaults to the fleet's dev-cx53 control plane). */
  controlPlaneUrl?: string
  /** Reasoner target in `node.reasoner` form (defaults to `swe_af.solve_issue`). */
  target?: string
  /** Optional model override passed to the reasoner (e.g. `openrouter/…`). */
  model?: string
  /** Poll cadence in milliseconds. */
  pollIntervalMs?: number
  /** Hard polling deadline in milliseconds. */
  timeoutMs?: number
  /** Optional test seam replacing the global `fetch`. */
  fetchImpl?: typeof fetch
}

export const Config: z<Config> = z.object({
  controlPlaneUrl: z.string().default('http://100.105.72.88:8085'),
  target: z.string().default('swe_af.solve_issue'),
  model: z.string(),
  pollIntervalMs: z.number().default(2000),
  timeoutMs: z.number().default(300_000),
})

type ResolvedConfig = Required<Omit<Config, 'fetchImpl'>> & { fetchImpl?: typeof fetch }

class AgentFieldProvider implements SubagentProvider {
  readonly name = 'agentfield'
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  start(request: ResolvedSubagentStartRequest) {
    const parentCwd = request.parent.session.header.cwd
    const spec: AgentFieldRunSpec = {
      controlPlaneUrl: this.config.controlPlaneUrl,
      target: this.config.target,
      pollIntervalMs: this.config.pollIntervalMs,
      timeoutMs: this.config.timeoutMs,
      ...this.config.model === '' ? {} : { model: this.config.model },
      ...parentCwd === undefined ? {} : {
        cwd: resolveChildCwd('subagent-agentfield', undefined, parentCwd),
      },
      /* v8 ignore next 2 -- unit tests always stub fetch; the absent branch is the production default */
      ...this.config.fetchImpl === undefined ? {} : { fetchImpl: this.config.fetchImpl },
      onError: (error, stopReason) => {
        this.ctx.logger.warn(
          `subagent-agentfield: child run failed (${stopReason}): ${error.message}`,
        )
      },
    }
    return Promise.resolve(startAgentFieldRun(request, spec))
  }
}

/**
 * Register the AgentField `agentfield` provider.
 * @param ctx - context carrying the shared subagent service.
 * @param config - control plane endpoint, target, model, and polling policy.
 */
export function apply(ctx: Context, config: Config): void {
  const pollIntervalMs = config.pollIntervalMs ?? 2000
  const timeoutMs = config.timeoutMs ?? 300_000
  assertPositiveFinite('subagent-agentfield', 'pollIntervalMs', pollIntervalMs)
  assertPositiveFinite('subagent-agentfield', 'timeoutMs', timeoutMs)
  const resolved: ResolvedConfig = {
    controlPlaneUrl: config.controlPlaneUrl ?? 'http://100.105.72.88:8085',
    target: config.target ?? 'swe_af.solve_issue',
    model: config.model ?? '',
    pollIntervalMs,
    timeoutMs,
    ...config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl },
  }
  ctx.subagents.registerProvider(new AgentFieldProvider(ctx, resolved))
}
