import { describe, expect, it } from 'vitest'
import { GAIA_BITS_PER_WEIGHT, GAIA_MEMORY_RATIO_VS_FP16, GaiaQuantProvider } from '../src/index.ts'

/** Run one provider request against a fresh GAIA provider. */
async function execute(request: Parameters<GaiaQuantProvider['execute']>[0]) {
  return new GaiaQuantProvider(1024).execute(request)
}

describe('GAIA quant provider', () => {
  it('reports the five-trits-per-byte packing claim', async () => {
    const result = await execute({ operation: 'capabilities' })
    expect(result.kind).toBe('capabilities')
    if (result.kind !== 'capabilities') throw new Error('expected capabilities')
    expect(result.device).toBe('cpu-gaia-pq')
    expect(result.throughputClaims[0]).toContain('five trits per byte')
  })

  it('quantizes group-wise and reports the GAIA packing ratio', async () => {
    const result = await execute({
      operation: 'quantize',
      weights: { shape: [1, 4], data: [1, -1, 0.1, 0] },
      groupSize: 2,
    })
    expect(result.kind).toBe('quantized')
    if (result.kind !== 'quantized') throw new Error('expected quantize')
    expect(result.codes).toEqual([1, -1, 1, 0])
    expect(result.scales).toHaveLength(2)
    expect(result.bitsPerWeight).toBe(GAIA_BITS_PER_WEIGHT)
    expect(result.memoryRatioVsFp16).toBe(GAIA_MEMORY_RATIO_VS_FP16)
  })

  it('runs a dense ternary GEMM over dequantized weights', async () => {
    const result = await execute({
      operation: 'gemm',
      activation: { shape: [1, 2], data: [1, 1] },
      weights: { shape: [2, 2], data: [1, 0, 0, 1] },
      groupSize: 2,
    })
    expect(result.kind).toBe('gemm')
    if (result.kind !== 'gemm') throw new Error('expected gemm')
    expect(result.output.shape).toEqual([1, 2])
    expect(result.output.data).toEqual([0.5, 0.5])
  })

  it('rejects a group size that does not divide the columns', async () => {
    await expect(execute({
      operation: 'quantize',
      weights: { shape: [1, 3], data: [1, 0, 1] },
      groupSize: 2,
    })).rejects.toThrow(/positive divisor/)
  })
})
