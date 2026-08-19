/**
 * Plugin-style unit tests for the `quant_ternary` tool: registration, summary execution through a
 * real `ctx.quant` seam with a stub provider, render output, and the fail-loud path when no quant
 * provider is registered.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import Quant, { QuantProviderId } from '@deepseek-ai/dsh-quant'
import type { QuantProvider, QuantProviderQuery, QuantResult } from '@deepseek-ai/dsh-quant'
import * as ToolQuant from '@deepseek-ai/dsh-tool-quant'
import { DEFAULT_GROUP_SIZE, QUANT_TOOL_DESCRIPTION } from '@deepseek-ai/dsh-tool-quant'

/** A stub quant provider computing the entheai group formula over the request matrices. */
const stubProvider: QuantProvider = {
  id: QuantProviderId('stub'),
  operations: ['quantize', 'gemm', 'capabilities'],
  device: 'cpu-stub',
  async execute(request: QuantProviderQuery): Promise<QuantResult> {
    if (request.operation === 'capabilities') {
      return { kind: 'capabilities', bitWidths: [2], device: 'cpu-stub', throughputClaims: [] }
    }
    if (request.operation === 'gemm') {
      return { kind: 'gemm', output: { shape: [request.activation.shape[0], request.weights.shape[1]], data: [] } }
    }
    const [rows, cols] = request.weights.shape
    const groupsPerRow = cols / request.groupSize
    return {
      kind: 'quantized',
      codes: request.weights.data.map(() => 0),
      scales: new Array(rows * groupsPerRow).fill(1),
      groupSize: request.groupSize,
      bitsPerWeight: 2,
      memoryRatioVsFp16: 8,
    }
  },
}

/** Mount the real tool stack over the real seam; `withProvider` controls registration. */
async function mount(withProvider: boolean): Promise<{ ctx: Context }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(Quant)
  if (withProvider) ctx.quant.registerProvider(stubProvider)
  await ctx.plugin(ToolQuant)
  return { ctx }
}

let seq = 0
const testToolSignal = new AbortController().signal
function call(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: `q-${++seq}` as never,
    name: 'quant_ternary',
    arguments: args,
  })
}

describe('tool-quant registration', () => {
  it('registers the quant_ternary tool', async () => {
    const { ctx } = await mount(true)
    const tool = ctx.tools.get('quant_ternary')
    expect(tool).toBeDefined()
    expect(tool?.description).toBe(QUANT_TOOL_DESCRIPTION)
    const parameters = tool?.parameters as { properties: { weights: unknown; group_size: { default: number } } }
    expect(parameters.properties.weights).toBeDefined()
    expect(parameters.properties.group_size.default).toBe(DEFAULT_GROUP_SIZE)
    await ctx.fiber.dispose()
  })

  it('has no default export (namespace plugin shape)', () => {
    expect((ToolQuant as { default?: unknown }).default).toBeUndefined()
    expect(ToolQuant.name).toBe('tool-quant')
    expect(ToolQuant.inject).toEqual(['tools', 'quant', 'systemPrompt'])
  })
})

describe('tool-quant execution', () => {
  it('executes quantize and returns the compact summary value', async () => {
    const { ctx } = await mount(true)
    const weights = [[1.0, -0.5, 0.2, -0.4], [0.7, 0.1, -0.9, 0.3]]
    const result = await call(ctx, { weights, group_size: 4 })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      bits_per_weight: 2,
      memory_ratio_vs_fp16: 8,
      quantized_shape: { rows: 2, cols: 4 },
      groups: 2,
    })
    // Render text carries the summary line plus the first-row code preview
    // (scale = (1 + 0.5 + 0.2 + 0.4) / 4 = 0.525 → codes [1, -1, 0, -1]).
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Quantized W[2x4] to ternary: 2 bits/param, ~8× vs FP16, 2 scale groups. First row codes: [1, -1, 0, -1].',
    })
    await ctx.fiber.dispose()
  })

  it('defaults group_size to 128 when omitted', async () => {
    const { ctx } = await mount(true)
    const weights = Array.from({ length: 1 }, () => Array.from({ length: DEFAULT_GROUP_SIZE }, () => 0.5))
    const result = await call(ctx, { weights })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ groups: 1, quantized_shape: { rows: 1, cols: DEFAULT_GROUP_SIZE } })
    await ctx.fiber.dispose()
  })

  it('fails loud with QUANT_UNAVAILABLE when no quant provider is registered', async () => {
    const { ctx } = await mount(false)
    const result = await call(ctx, { weights: [[1.0, -0.5]], group_size: 1 })
    expect(result.isError).toBe(true)
    expect(result.error?.info?.code).toBe('QUANT_UNAVAILABLE')
    await ctx.fiber.dispose()
  })

  it('rejects a non-positive group_size before dispatch', async () => {
    const { ctx } = await mount(true)
    const result = await call(ctx, { weights: [[1.0, -0.5]], group_size: 0 })
    expect(result.isError).toBe(true)
    expect(result.error?.message).toMatch(/group_size/)
    await ctx.fiber.dispose()
  })

  it('rejects ragged weight matrices before dispatch', async () => {
    const { ctx } = await mount(true)
    const result = await call(ctx, { weights: [[1.0, -0.5], [0.2]] })
    expect(result.isError).toBe(true)
    expect(result.error?.message).toMatch(/rectangular/)
    await ctx.fiber.dispose()
  })
})
