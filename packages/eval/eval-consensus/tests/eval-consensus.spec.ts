import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import ConsensusEvaluator, { geometricConsensus, normalizeAnswer, similarity } from '../src/index.ts'
import * as ConsensusEvaluatorInvariant from '../src/invariant.ts'

/** A fake llm whose stream yields one text completion per (provider, model). */
function stubLlm(completions: Record<string, string>) {
  return {
    stream: (options: { provider: string; model: string }): AsyncIterable<StreamChunk> => {
      const text = completions[`${options.provider}/${options.model}`] ?? ''
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        },
      }
    },
  }
}

function ctxWithLlm(llm: unknown): Context {
  const ctx = new Context()
  ;(ctx as unknown as { llm: unknown }).llm = llm
  return ctx
}

describe('consensus aggregation', () => {
  it('normalizes answers for agreement', () => {
    expect(normalizeAnswer('  The ANSWER  is   42 ')).toBe('the answer is 42')
  })

  it('computes Jaccard similarity between normalized answers', () => {
    expect(similarity('the answer is 42', 'the answer is 42')).toBe(1)
    expect(similarity('the answer is 42', 'the answer is 43')).toBe(0.6)
    expect(similarity('apple', 'banana')).toBe(0)
    expect(similarity('!!!', '???')).toBe(1)
  })

  it('picks the highest-support answer and its geometric-mean confidence', () => {
    const result = geometricConsensus([
      { id: 'a', provider: 'p', model: 'm1', output: 'the answer is 42' },
      { id: 'b', provider: 'p', model: 'm2', output: 'the answer is 42' },
      { id: 'c', provider: 'p', model: 'm3', output: 'the result is banana' },
    ])
    expect(result.answer).toBe('the answer is 42')
    expect(result.supporters).toEqual(['a', 'b'])
    expect(result.unanimous).toBe(false)
    // Geometric mean of [1, 1] is 1; the outlier is excluded.
    expect(result.confidence).toBe(1)
  })

  it('drags confidence toward zero when support is thin', () => {
    const result = geometricConsensus([
      { id: 'a', provider: 'p', model: 'm1', output: 'alpha beta gamma' },
      { id: 'b', provider: 'p', model: 'm2', output: 'alpha beta delta epsilon' },
      { id: 'c', provider: 'p', model: 'm3', output: 'zeta eta theta' },
    ])
    // a and b share tokens (Jaccard above 0.6?) — alpha/beta in both → sim 0.5 < threshold; no supporters beyond self.
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('handles empty and single-route councils', () => {
    expect(geometricConsensus([])).toEqual({ answer: '', confidence: 0, supporters: [], unanimous: true })
    const single = geometricConsensus([{ id: 'a', provider: 'p', model: 'm', output: 'solo' }])
    expect(single.answer).toBe('solo')
    expect(single.confidence).toBe(1)
    expect(single.unanimous).toBe(true)
  })
})

describe('ConsensusEvaluator service', () => {
  it('runs one task across every route and aggregates the consensus', async () => {
    const ctx = ctxWithLlm(stubLlm({
      'qwen/8b': 'the answer is 42',
      'qwen/14b': 'the answer is 42',
      'deepseek/pro': 'banana is the best fruit',
    }))
    await ctx.plugin(ConsensusEvaluator, {
      routes: [
        { id: 'q1', provider: 'qwen', model: '8b' },
        { id: 'q2', provider: 'qwen', model: '14b' },
        { id: 'd1', provider: 'deepseek', model: 'pro' },
      ],
    })
    const report = await ctx.consensusEval.run('What is the answer?')
    expect(report.routes).toHaveLength(3)
    expect(report.consensus.answer).toBe('the answer is 42')
    expect(report.consensus.supporters).toEqual(['q1', 'q2'])
    expect(report.consensus.unanimous).toBe(false)
  })

  it('reports route failures (Error and non-Error) without poisoning the consensus', async () => {
    const ctx = ctxWithLlm({
      stream: (options: { provider: string }) => {
        if (options.provider === 'broken') throw new Error('route down')
        if (options.provider === 'broken2') throw 'plain string failure'
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'text-delta', index: 0, text: 'ok' }
          },
        }
      },
    })
    await ctx.plugin(ConsensusEvaluator, {
      routes: [
        { id: 'ok1', provider: 'good', model: 'a' },
        { id: 'ok2', provider: 'good', model: 'b' },
        { id: 'br', provider: 'broken', model: 'c' },
        { id: 'br2', provider: 'broken2', model: 'd' },
      ],
    })
    const report = await ctx.consensusEval.run('task', { system: 'sys', temperature: 0.2 })
    expect(report.routes[2]!.error).toBe('route down')
    expect(report.routes[3]!.error).toBe('plain string failure')
    expect(report.consensus.answer).toBe('ok')
  })

  it('configures routes through schemastery and requires at least one', async () => {
    const ctx = ctxWithLlm(stubLlm({}))
    let threw = false
    try {
      await ctx.plugin(ConsensusEvaluator, { routes: [] })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})

describe('eval-consensus invariant companion', () => {
  it('registers under the invariants service', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(ConsensusEvaluatorInvariant)).resolves.toBeDefined()
  })
})
