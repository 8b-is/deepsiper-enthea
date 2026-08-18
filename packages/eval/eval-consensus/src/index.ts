/**
 * Council-of-Elders inference consensus eval: run one task through a
 * configured set of model routes and aggregate the answers with a
 * geometric-mean-style agreement (the inference analog of KOMPRESS v2's
 * geometric-mean softmax consensus distillation).
 *
 * @module @deepseek-ai/dsh-eval-consensus
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm'
import { geometricConsensus, type ConsensusResult, type RouteOutput } from './consensus.ts'

export { geometricConsensus, normalizeAnswer, similarity } from './consensus.ts'
export type { ConsensusResult, RouteOutput } from './consensus.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    consensusEval: ConsensusEvaluator
  }
}

/** One Council member: a model route to consult. */
export interface ConsensusRoute {
  /** Stable route id used in the report. */
  id: string
  provider: string
  model: string
}

/** One completed consultation of the Council. */
export interface CouncilReport {
  task: string
  routes: Array<RouteOutput & { error?: string }>
  consensus: ConsensusResult
}

/** Plugin configuration. */
export interface Config {
  /** The Council of Elders: model routes consulted per task. */
  routes: ConsensusRoute[]
  /** Jaccard similarity above which two answers count as agreeing. */
  supportThreshold?: number
}

/** The consensus eval service (`ctx.consensusEval`). */
export class ConsensusEvaluator extends Service {
  static Config: z<Config> = z.object({
    routes: z.array(z.object({
      id: z.string().required(),
      provider: z.string().required(),
      model: z.string().required(),
    })).min(1),
    supportThreshold: z.number().min(0).max(1).default(0.6),
  })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'consensusEval')
    if (config.routes.length === 0) {
      throw new Error('eval-consensus: the Council must contain at least one route')
    }
  }

  /**
   * Run one task through every Council route and aggregate the answers.
   * @param task - the prompt delivered to every route.
   * @param options - optional system prompt and per-call temperature.
   * @returns one report per route plus the geometric-mean consensus.
   */
  async run(task: string, options: { system?: string; temperature?: number } = {}): Promise<CouncilReport> {
    const routes = this.config.routes.map(async (route): Promise<RouteOutput & { error?: string }> => {
      try {
        const stream = this.ctx.llm.stream({
          provider: route.provider,
          model: route.model,
          messages: [createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'user' } })],
          ...options.system === undefined ? {} : { system: options.system },
          ...options.temperature === undefined ? {} : { temperature: options.temperature },
        })
        let text = ''
        for await (const chunk of stream) {
          if (chunk.type === 'text-delta') text += chunk.text
        }
        return { id: route.id, provider: route.provider, model: route.model, output: text.trim() }
      } catch (error: unknown) {
        return {
          id: route.id,
          provider: route.provider,
          model: route.model,
          output: '',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
    const settled = await Promise.all(routes)
    const outputs = settled.filter((route): route is RouteOutput => route.error === undefined)
    const consensus = geometricConsensus(outputs, this.config.supportThreshold)
    return { task, routes: settled, consensus }
  }
}

export default ConsensusEvaluator
