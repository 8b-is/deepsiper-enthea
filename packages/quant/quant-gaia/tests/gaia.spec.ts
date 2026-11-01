import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Quant } from '@deepseek-ai/dsh-quant'
import * as Gaia from '../src/index.ts'
import {
  GAIA_BITS_PER_WEIGHT,
  GAIA_MEMORY_RATIO_VS_FP16,
  GaiaQuantProvider,
  runNative,
  validateNativeResult,
} from '../src/index.ts'
import type { SpawnFn } from '../src/index.ts'

/** A stream with the one method `runNative` calls. */
class FakeStream extends EventEmitter {
  setEncoding(_encoding: string): this { return this }
}

/** A child-process stand-in with piped stdio and a captureable stdin. */
class FakeChild extends EventEmitter {
  readonly stdout = new FakeStream()
  readonly stderr = new FakeStream()
  readonly stdin = Object.assign(new EventEmitter(), {
    end: (_data?: string): void => {},
  })
}

/** A spawn that hands the request to `respond` after `stdin.end` is called. */
function fakeSpawn(respond: (request: string, child: FakeChild) => void): SpawnFn {
  return (() => {
    const child = new FakeChild()
    child.stdin.end = (data?: string): void => { queueMicrotask(() => { respond(data ?? '', child) }) }
    return child as unknown as import('node:child_process').ChildProcess
  }) as unknown as SpawnFn
}

/** Emit one complete valid response for `operation`. */
function respondWith(operation: string): (request: string, child: FakeChild) => void {
  return (_request, child) => {
    const result = operation === 'quantize'
      ? { kind: 'quantized', codes: [1, 0, -1], scales: [1], groupSize: 3, bitsPerWeight: 1.6, memoryRatioVsFp16: 10 }
      : operation === 'gemm'
        ? { kind: 'gemm', output: { shape: [1, 1], data: [2] } }
        : { kind: 'capabilities', bitWidths: [2], device: 'stub', throughputClaims: ['stub'] }
    child.stdout.emit('data', JSON.stringify(result))
    child.emit('close', 0, null)
  }
}

/** Run one request against the software provider. */
async function execute(request: Parameters<GaiaQuantProvider['execute']>[0]) {
  return new GaiaQuantProvider(1024).execute(request)
}

const quantizeRequest = { operation: 'quantize' as const, weights: { shape: [1, 3] as const, data: [1, 0, -1] }, groupSize: 3 }
const gemmRequest = { operation: 'gemm' as const, activation: { shape: [1, 2] as const, data: [1, 1] }, weights: { shape: [2, 2] as const, data: [1, 0, 0, 1] }, groupSize: 2 }
const capabilitiesRequest = { operation: 'capabilities' as const }

describe('GAIA software lane', () => {
  it('reports the five-trits-per-byte packing claim', async () => {
    const result = await execute(capabilitiesRequest)
    expect(result).toMatchObject({ kind: 'capabilities', device: 'cpu-gaia-pq' })
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
    const result = await execute(gemmRequest)
    expect(result).toMatchObject({ kind: 'gemm', output: { shape: [1, 2], data: [0.5, 0.5] } })
  })

  it('rejects a group size that does not divide the columns', async () => {
    await expect(execute(quantizeRequest)).resolves.toBeDefined()
    await expect(execute({ ...quantizeRequest, groupSize: 2 })).rejects.toThrow(/positive divisor/)
  })
})

describe('GAIA native lane', () => {
  it('delegates quantize, gemm, and capabilities to the CLI', async () => {
    const provider = new GaiaQuantProvider(1024, 'gaia-quant', fakeSpawn(respondWith('quantize')))
    await expect(provider.execute(quantizeRequest)).resolves.toMatchObject({ kind: 'quantized' })
    const gemmProvider = new GaiaQuantProvider(1024, 'gaia-quant', fakeSpawn(respondWith('gemm')))
    await expect(gemmProvider.execute(gemmRequest)).resolves.toMatchObject({ kind: 'gemm' })
    const capabilitiesProvider = new GaiaQuantProvider(1024, 'gaia-quant', fakeSpawn(respondWith('capabilities')))
    await expect(capabilitiesProvider.execute(capabilitiesRequest)).resolves.toMatchObject({ kind: 'capabilities' })
  })

  it('names a missing binary', async () => {
    const spawn = fakeSpawn((_request, child) => {
      child.emit('error', Object.assign(new Error('spawn gaia-quant ENOENT'), { code: 'ENOENT' }))
    })
    await expect(runNative('gaia-quant', quantizeRequest, 1024, undefined, spawn)).rejects.toThrow(/was not found/)
  })

  it('reports a non-zero exit with stderr', async () => {
    const spawn = fakeSpawn((_request, child) => {
      child.stderr.emit('data', 'boom')
      child.emit('close', 2, null)
    })
    await expect(runNative('gaia-quant', quantizeRequest, 1024, undefined, spawn))
      .rejects.toThrow(/status 2: boom/)
  })

  it('rejects malformed, null, and mismatched results', async () => {
    const malformedSpawn = fakeSpawn((_request, child) => {
      child.stdout.emit('data', 'not json')
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', quantizeRequest, 1024, undefined, malformedSpawn)).rejects.toThrow(/invalid JSON/)

    const nullSpawn = fakeSpawn((_request, child) => {
      child.stdout.emit('data', 'null')
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', quantizeRequest, 1024, undefined, nullSpawn)).rejects.toThrow(/non-object/)

    const mismatchSpawn = fakeSpawn(respondWith('gemm'))
    await expect(runNative('gaia-quant', quantizeRequest, 1024, undefined, mismatchSpawn)).rejects.toThrow(/result kind/)
  })

  it('rejects a result missing required fields', async () => {
    const spawn = fakeSpawn((_request, child) => {
      child.stdout.emit('data', JSON.stringify({ kind: 'quantized', codes: [1] }))
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', quantizeRequest, 1024, undefined, spawn)).rejects.toThrow(/quantized\.scales/)
  })

  it('enforces maxOutputBytes on the native gemm result', async () => {
    const spawn = fakeSpawn((_request, child) => {
      child.stdout.emit('data', JSON.stringify({ kind: 'gemm', output: { shape: [20, 20], data: Array(400).fill(0) } }))
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', gemmRequest, 1024, undefined, spawn)).rejects.toThrow(/maxOutputBytes/)
  })

  it('ignores EPIPE on stdin and rejects a real stdin failure', async () => {
    const closedSpawn = fakeSpawn((_request, child) => {
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      child.stdout.emit('data', JSON.stringify({ kind: 'capabilities', bitWidths: [2], device: 'stub', throughputClaims: [] }))
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, undefined, closedSpawn)).resolves.toMatchObject({ kind: 'capabilities' })

    const brokenSpawn = fakeSpawn((_request, child) => {
      child.stdin.emit('error', Object.assign(new Error('write EBADF'), { code: 'EBADF' }))
    })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, undefined, brokenSpawn)).rejects.toThrow(/EBADF/)
  })

  it('rejects with the abort reason when cancellation lands before close', async () => {
    const controller = new AbortController()
    const spawn = fakeSpawn((_request, child) => {
      controller.abort(new Error('stop now'))
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, controller.signal, spawn)).rejects.toThrow(/stop now/)
  })

  it('validates a decoded result directly', () => {
    expect(validateNativeResult({ kind: 'capabilities', bitWidths: [2], device: 'x', throughputClaims: [] }, 'capabilities', 1024))
      .toMatchObject({ kind: 'capabilities' })
    expect(() => validateNativeResult({ kind: 'gemm', output: { shape: [1, 2], data: [1] } }, 'gemm', 1024))
      .toThrow(/data length/)
  })
})

describe('validateNativeResult shape gate', () => {
  const q = (over: Record<string, unknown>) => ({
    kind: 'quantized', codes: [1], scales: [1], groupSize: 1, bitsPerWeight: 1.6, memoryRatioVsFp16: 10, ...over,
  })
  const g = (output: unknown) => ({ kind: 'gemm', output })
  const c = (over: Record<string, unknown>) => ({ kind: 'capabilities', bitWidths: [2], device: 'x', throughputClaims: [], ...over })

  it.each<[string, unknown, 'quantize' | 'gemm' | 'capabilities']>([
    ['a non-object', null, 'quantize'],
    ['a wrong kind', c({}), 'quantize'],
    ['quantized without codes', q({ codes: undefined }), 'quantize'],
    ['quantized without scales', q({ scales: undefined }), 'quantize'],
    ['quantized with a bad groupSize', q({ groupSize: 0 }), 'quantize'],
    ['quantized with a bad bitsPerWeight', q({ bitsPerWeight: 0 }), 'quantize'],
    ['quantized with a bad memory ratio', q({ memoryRatioVsFp16: 0 }), 'quantize'],
    ['gemm without an output object', g([]), 'gemm'],
    ['gemm with a bad shape', g({ shape: [1], data: [] }), 'gemm'],
    ['gemm with bad data', g({ shape: [1, 2], data: 'x' }), 'gemm'],
    ['gemm with a length mismatch', g({ shape: [1, 2], data: [1] }), 'gemm'],
    ['capabilities with bad bitWidths', c({ bitWidths: 'x' }), 'capabilities'],
    ['capabilities with a bad device', c({ device: 1 }), 'capabilities'],
    ['capabilities with bad claims', c({ throughputClaims: [1] }), 'capabilities'],
  ])('rejects %s', (_label, value, operation) => {
    expect(() => validateNativeResult(value, operation, 1024)).toThrow(/quant-gaia: native backend/)
  })
})

describe('GAIA native failure paths', () => {
  it('surfaces a non-ENOENT spawn error and a synchronous spawn throw', async () => {
    const denied = fakeSpawn((_request, child) => {
      child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }))
    })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, undefined, denied)).rejects.toThrow(/EACCES/)
    const throwing = (() => { throw new Error('spawn threw') }) as unknown as SpawnFn
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, undefined, throwing)).rejects.toThrow(/spawn threw/)
  })

  it('ignores a late error and close after settling', async () => {
    const spawn = fakeSpawn((_request, child) => {
      child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
      child.emit('close', 0, null)
      child.emit('error', Object.assign(new Error('late EIO'), { code: 'EIO' }))
    })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, undefined, spawn)).rejects.toThrow(/was not found/)
  })

  it('names the close signal when the exit code is null', async () => {
    const spawn = fakeSpawn((_request, child) => { child.emit('close', null, 'SIGTERM') })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, undefined, spawn)).rejects.toThrow(/status SIGTERM/)
  })

  it('wraps a non-Error abort reason', async () => {
    const controller = new AbortController()
    const spawn = fakeSpawn((_request, child) => {
      controller.abort('plain reason')
      child.emit('close', 0, null)
    })
    await expect(runNative('gaia-quant', capabilitiesRequest, 1024, controller.signal, spawn))
      .rejects.toThrow(/aborted/)
  })
})

describe('GAIA provider wiring', () => {
  it('rejects mismatched gemm dimensions and an oversized software output', async () => {
    await expect(execute({
      operation: 'gemm',
      activation: { shape: [1, 2], data: [1, 2] },
      weights: { shape: [3, 2], data: [1, 0, 0, 1, 1, 0] },
      groupSize: 2,
    })).rejects.toThrow(/must equal weight rows/)
    const tiny = new GaiaQuantProvider(8)
    await expect(tiny.execute(gemmRequest)).rejects.toThrow(/maxOutputBytes/)
  })

  it('registers through apply with and without an explicit bound', async () => {
    const first = new Context()
    await first.plugin(Quant)
    await first.plugin(Gaia, { maxOutputBytes: 1024 })
    await expect(first.quant.execute(capabilitiesRequest)).resolves.toMatchObject({ kind: 'capabilities', device: 'cpu-gaia-pq' })
    await first.fiber.dispose()

    const second = new Context()
    await second.plugin(Quant)
    await second.plugin(Gaia, {})
    await expect(second.quant.execute(capabilitiesRequest)).resolves.toMatchObject({ kind: 'capabilities' })
    await second.fiber.dispose()
  })
})
