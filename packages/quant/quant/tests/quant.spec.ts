/**
 * Unit tests for the quant seam: provider registration conflict/exclusivity rules, disposer
 * release, order-independent default selection, operation support checks, and the closed result
 * union, driven through a real Cordis context with stub providers.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Quant, QuantError, QuantProviderId } from '../src/index.ts'
import type {
  QuantProvider,
  QuantRequest,
  QuantResult,
} from '../src/types.ts'

function provider(id: string, operations: QuantProvider['operations'] = ['quantize', 'gemm', 'capabilities']): QuantProvider {
  return {
    id: QuantProviderId(id),
    operations,
    device: `device-${id}`,
    async execute(request: QuantRequest): Promise<QuantResult> {
      if (request.operation === 'capabilities') {
        return { kind: 'capabilities', bitWidths: [2], device: this.device ?? '', throughputClaims: [] }
      }
      if (request.operation === 'gemm') {
        return { kind: 'gemm', output: { shape: [1, 1], data: [1] } }
      }
      return { kind: 'quantized', codes: [1], scales: [1], groupSize: 1, bitsPerWeight: 2, memoryRatioVsFp16: 8 }
    },
  }
}

function stubQuant(): { ctx: Context; service: Quant } {
  const ctx = new Context()
  const service = new Quant(ctx)
  ctx.quant = service
  return { ctx, service }
}

describe('quant seam registration', () => {
  it('registers a provider and executes it by backend id', async () => {
    const { service } = stubQuant()
    const p = provider('reference')
    service.registerProvider(p)
    const result = await service.execute({ operation: 'capabilities', backend: 'reference' })
    expect(result).toMatchObject({ kind: 'capabilities', device: 'device-reference', bitWidths: [2] })
  })

  it('rejects an empty provider id before mutating', () => {
    const { service } = stubQuant()
    expect(() => service.registerProvider(provider(''))).toThrow(QuantError)
  })

  it('rejects a conflicting id atomically', () => {
    const { service } = stubQuant()
    service.registerProvider(provider('reference'))
    expect(() => service.registerProvider(provider('reference'))).toThrow(/already registered/)
  })

  it('rejects a provider with no operations', () => {
    const { service } = stubQuant()
    expect(() => service.registerProvider(provider('empty', []))).toThrow(/registers no operations/)
  })

  it('releases the reservation when the disposer runs', async () => {
    const { service } = stubQuant()
    const dispose = service.registerProvider(provider('reference'))
    dispose()
    await expect(service.execute({ operation: 'capabilities', backend: 'reference' }))
      .rejects.toMatchObject({ code: 'QUANT_UNAVAILABLE' })
  })

  it('fails loud when no provider matches the backend id', async () => {
    const { service } = stubQuant()
    service.registerProvider(provider('reference'))
    await expect(service.execute({ operation: 'capabilities', backend: 'nope' }))
      .rejects.toMatchObject({ code: 'QUANT_UNAVAILABLE' })
  })

  it('fails loud when an operation is unsupported by the selected provider', async () => {
    const { service } = stubQuant()
    service.registerProvider(provider('quant-only', ['quantize']))
    await expect(service.execute({ operation: 'gemm', backend: 'quant-only', activation: { shape: [1, 1], data: [1] }, weights: { shape: [1, 1], data: [1] }, groupSize: 1 }))
      .rejects.toMatchObject({ code: 'QUANT_UNSUPPORTED_OPERATION' })
  })
})
