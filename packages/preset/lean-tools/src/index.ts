/**
 * Per-agent tool restriction preset. Mounting it calls
 * `agent.ctx.tools.restrict()` for every agent as it is created, denying the
 * configured heavy orchestration tools so the assembled tool-schema footprint
 * shrinks for ordinary sessions. The restriction is per-agent and scoped: the
 * tools vanish from that agent's prompt AND refuse to execute, without
 * affecting other agents or the global registry.
 *
 * @module @deepseek-ai/dsh-lean-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'

export const name = 'lean-tools'

/** Heavy orchestration tools a lean session rarely needs by default. */
export const DEFAULT_LEAN_DENY = ['ralph', 'subagent_fork', 'workflow']

/** Deployment-authored tool restriction applied to every agent. */
export interface Config {
  /** Tool names to deny for every agent. Defaults to {@link DEFAULT_LEAN_DENY}. */
  deny?: string[]
}

export const Config: z<Config> = z.object({
  deny: z.array(z.string()).default(DEFAULT_LEAN_DENY),
})

/**
 * Register the per-agent lean tool restriction.
 * @param ctx - context; the restriction applies to every agent created after load.
 * @param config - the denied tool names.
 */
export function apply(ctx: Context, config: Config): void {
  const deny = config.deny ?? DEFAULT_LEAN_DENY
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.tools.restrict({ deny })
  })
}
