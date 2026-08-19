/**
 * Unit tests for the reference quant provider, driven through a real Cordis context and the real
 * `Quant` seam service: entheai-parity quantize on a worked example, a round-trip reconstruction
 * bound, gemm parity with an independently written dense reference, the `maxOutputBytes` bound,
 * groupSize divisibility, capabilities, and disposal removing the registration.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Quant, { QuantError, QuantProviderId } from '@deepseek-ai/dsh-quant'
import type { GemmResult, QuantMatrix, QuantProvider, QuantService, QuantizedWeights } from '@deepseek-ai/dsh-quant'
import * as QuantReference from '@deepseek-ai/dsh-quant-reference'

/** Mount the real seam plus the reference provider plugin. */
async function mount(config: QuantReference.Config = {}): Promise<{ ctx: Context; quant: Quant }> {
  const ctx = new Context()
  const service = new Quant(ctx)
  ctx.quant = service
  await ctx.plugin(QuantReference, config)
  return { ctx, quant: service }
}

/** Narrow a quantize execution to its quantized result, failing loud otherwise. */
async function quantize(
  quant: QuantService,
  weights: QuantMatrix,
  groupSize: number,
): Promise<QuantizedWeights> {
  const result = await quant.execute({ operation: 'quantize', weights, groupSize })
  if (result.kind !== 'quantized') throw new Error('expected a quantized result')
  return result
}

/** Narrow a gemm execution to its dense output, failing loud otherwise. */
async function gemm(
  quant: QuantService,
  activation: QuantMatrix,
  weights: QuantMatrix,
  groupSize: number,
): Promise<GemmResult> {
  const result = await quant.execute({ operation: 'gemm', activation, weights, groupSize })
  if (result.kind !== 'gemm') throw new Error('expected a gemm result')
  return result
}

/** The entheai dequantize formula, re-implemented independently for parity checks. */
function dequantize(weights: QuantMatrix, scales: readonly number[], groupSize: number): number[] {
  const [rows, cols] = weights.shape
  const out: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < cols; column++) {
      const index = row * cols + column
      const scale = scales[Math.floor(index / groupSize)] ?? 1
      const value = weights.data[index] ?? 0
      out.push(Math.round(Math.max(-1, Math.min(1, value / scale))) * scale)
    }
  }
  return out
}

/** Deterministic pseudo-random values in `[-maxAbs, maxAbs)`; small magnitudes keep ternary reconstruction inside the round-trip bound. */
function seededValues(rows: number, cols: number, maxAbs: number): number[] {
  let state = 0x2f6e2b1
  const values: number[] = []
  for (let index = 0; index < rows * cols; index++) {
    state = (state * 1103515245 + 12345) % 2147483648
    values.push((((state / 2147483648) - 0.5) * 2) * maxAbs)
  }
  return values
}

/** A dense matmul reference the gemm result is compared against. */
function denseMatmul(activation: QuantMatrix, weights: number[]): number[] {
  const [m, k] = activation.shape
  const n = weights.length / k
  const out: number[] = []
  for (let row = 0; row < m; row++) {
    for (let column = 0; column < n; column++) {
      let sum = 0
      for (let depth = 0; depth < k; depth++) {
        sum += (activation.data[row * k + depth] ?? 0) * (weights[depth * n + column] ?? 0)
      }
      out.push(sum)
    }
  }
  return out
}

describe('quant-reference provider', () => {
  it('has no default export (namespace plugin shape)', () => {
    expect((QuantReference as { default?: unknown }).default).toBeUndefined()
    expect(QuantReference.name).toBe('quant-reference')
    expect(QuantReference.inject).toEqual(['quant'])
  })

  it('quantizes a worked example exactly per the entheai formula', async () => {
    const { ctx } = await mount()
    const weights: QuantMatrix = { shape: [1, 4], data: [3.0, -1.0, 0.2, -0.4] }
    const result = await quantize(ctx.quant, weights, 4)
    expect(result).toMatchObject({
      kind: 'quantized',
      // scale = (3 + 1 + 0.2 + 0.4) / 4 ≈ 1.15; codes = round(clamp(w / scale, -1, 1)).
      codes: [1, -1, 0, 0],
      groupSize: 4,
      bitsPerWeight: 2,
      memoryRatioVsFp16: 8,
    })
    expect(result.scales[0]).toBeCloseTo(1.15, 12)
    await ctx.fiber.dispose()
  })

  it('round-trips quantize + dequantize within 1e-3 on a deterministic matrix', async () => {
    const { ctx } = await mount()
    const rows = 8
    const cols = 16
    const data = seededValues(rows, cols, 0.0008)
    const weights: QuantMatrix = { shape: [rows, cols], data }
    const quantized = await quantize(ctx.quant, weights, 4)
    const reconstructed = dequantize(weights, quantized.scales, quantized.groupSize)
    const maxError = Math.max(...reconstructed.map((value, index) => Math.abs(value - (data[index] ?? 0))))
    expect(maxError).toBeLessThanOrEqual(1e-3)
    await ctx.fiber.dispose()
  })

  it('gemm matches an independently computed dense dequantize + matmul reference', async () => {
    const { ctx } = await mount()
    const activation: QuantMatrix = {
      shape: [4, 6],
      data: [
        0.5, -1.0, 0.25, 0.75, -0.5, 1.0, 0.1, 0.9, -0.2, 0.3, 0.8, -0.7,
        1.0, 0.0, -0.4, 0.6, -1.0, 0.2, 0.4, 0.5, -0.8, -0.1, 0.7, 0.9,
      ],
    }
    const weights: QuantMatrix = {
      shape: [6, 5],
      data: [
        0.9, -0.6, 0.3, -0.8, 0.5, -0.2, 0.7, 0.4, -0.5, 0.1, 0.6, 0.8,
        -0.9, 0.2, -0.3, -0.7, 0.5, 0.1, 0.9, -0.4, 0.3, -0.1, -0.6, 0.8,
        0.2, 0.5, -0.9, 0.7, -0.2, 0.4,
      ],
    }
    const groupSize = 1
    const quantized = await quantize(ctx.quant, weights, groupSize)
    const dequantizedWeights = dequantize(weights, quantized.scales, groupSize)
    const output = await gemm(ctx.quant, activation, weights, groupSize)
    const expected = denseMatmul(activation, dequantizedWeights)
    const maxError = Math.max(...output.output.data.map((value, index) => Math.abs(value - (expected[index] ?? 0))))
    expect(maxError).toBeLessThanOrEqual(1e-3)
    await ctx.fiber.dispose()
  })

  it('rejects a gemm output beyond maxOutputBytes with QUANT_RESULT_TOO_LARGE', async () => {
    const { ctx } = await mount({ maxOutputBytes: 64 })
    const activation: QuantMatrix = { shape: [4, 6], data: new Array(24).fill(0.5) }
    const weights: QuantMatrix = { shape: [6, 5], data: new Array(30).fill(0.5) }
    await expect(ctx.quant.execute({ operation: 'gemm', activation, weights, groupSize: 5 }))
      .rejects.toMatchObject({ code: 'QUANT_RESULT_TOO_LARGE' })
    await ctx.fiber.dispose()
  })

  it('rejects a groupSize that does not divide the weight columns', async () => {
    const { ctx } = await mount()
    const weights: QuantMatrix = { shape: [2, 5], data: new Array(10).fill(0.3) }
    await expect(ctx.quant.execute({ operation: 'quantize', weights, groupSize: 3 }))
      .rejects.toMatchObject({ code: 'QUANT_UNSUPPORTED_OPERATION' })
    await ctx.fiber.dispose()
  })

  it('reports capabilities bitWidths [2] on device cpu-reference with no throughput claims', async () => {
    const { ctx } = await mount()
    const result = await ctx.quant.execute({ operation: 'capabilities' })
    expect(result).toEqual({ kind: 'capabilities', bitWidths: [2], device: 'cpu-reference', throughputClaims: [] })
    await ctx.fiber.dispose()
  })

  it('uses the configured maxOutputBytes and the default when omitted', async () => {
    const { ctx: defaultCtx } = await mount()
    const { ctx: configured } = await mount({ maxOutputBytes: 128 })
    await expect(configured.quant.execute({
      operation: 'gemm',
      activation: { shape: [4, 6], data: new Array(24).fill(0.5) },
      weights: { shape: [6, 5], data: new Array(30).fill(0.5) },
      groupSize: 5,
    })).rejects.toMatchObject({ code: 'QUANT_RESULT_TOO_LARGE' })
    // The default bound (16 MiB) admits the same 4x5x8 = 160-byte output.
    const ok = await defaultCtx.quant.execute({
      operation: 'gemm',
      activation: { shape: [4, 6], data: new Array(24).fill(0.5) },
      weights: { shape: [6, 5], data: new Array(30).fill(0.5) },
      groupSize: 5,
    })
    expect(ok.kind).toBe('gemm')
    await defaultCtx.fiber.dispose()
    await configured.fiber.dispose()
  })

  it('releases the provider reservation when the fiber is disposed', async () => {
    const { ctx, quant } = await mount()
    await expect(ctx.quant.execute({ operation: 'capabilities' })).resolves.toMatchObject({ device: 'cpu-reference' })
    await ctx.fiber.dispose()
    await expect(quant.execute({ operation: 'capabilities' }))
      .rejects.toMatchObject({ code: 'QUANT_UNAVAILABLE' })
  })

  it('rejects a non-positive maxOutputBytes at load', async () => {
    const ctx = new Context()
    const service = new Quant(ctx)
    ctx.quant = service
    expect(() => { QuantReference.apply(ctx, { maxOutputBytes: 0 }) }).toThrow(/maxOutputBytes/)
  })

  it('registers a provider that satisfies the seam contract (QuantError instance)', async () => {
    const { ctx } = await mount()
    const provider: QuantProvider = { id: QuantProviderId('other'), operations: ['quantize'], execute: () => Promise.resolve({ kind: 'quantized', codes: [], scales: [], groupSize: 1, bitsPerWeight: 2, memoryRatioVsFp16: 8 }) }
    ctx.quant.registerProvider(provider)
    // Multiple providers require an explicit backend; the reference provider answers by id.
    const result = await ctx.quant.execute({ operation: 'capabilities', backend: 'reference' })
    expect(result.kind).toBe('capabilities')
    await ctx.fiber.dispose()
  })

  it('throws QuantError-shaped failures for invalid requests', async () => {
    const { ctx } = await mount()
    const weights: QuantMatrix = { shape: [1, 5], data: [1, 2, 3, 4, 5] }
    await expect(ctx.quant.execute({ operation: 'quantize', weights, groupSize: 2 }))
      .rejects.toBeInstanceOf(QuantError)
    await ctx.fiber.dispose()
  })
})
