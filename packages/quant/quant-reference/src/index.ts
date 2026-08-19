/**
 * Pure-software reference backend for `ctx.quant` (BitNet b1.58 ternary). Registers one provider,
 * `reference`, implementing group symmetric ternary `quantize` matching the entheai engine's
 * `crates/ternary` semantics, a dense ternary GEMM over dequantized weights, and a static
 * `capabilities` report. No subprocess, filesystem, SIMD, or device I/O — plain floating-point
 * compute bounded by `maxOutputBytes`.
 *
 * Namespace plugin (named exports, no default export). The registration is effect-scoped: disposal
 * unregisters the provider and releases its id reservation.
 * @module @deepseek-ai/dsh-quant-reference
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { QuantError, QuantProviderId } from '@deepseek-ai/dsh-quant'
import type {
  QuantMatrix,
  QuantOperation,
  QuantProvider,
  QuantProviderQuery,
  QuantResult,
} from '@deepseek-ai/dsh-quant'
import type {} from '@deepseek-ai/dsh-quant'

/** Cordis plugin name for loader diagnostics. */
export const name = 'quant-reference'

/** Services required by this plugin. */
export const inject = ['quant']

/** Largest `gemm` output this provider materializes, in bytes (16 MiB). */
export const DEFAULT_MAX_OUTPUT_BYTES = 16_777_216

/** Plugin configuration: the gemm output bound. */
export interface Config {
  /** Largest `gemm` output in bytes (`rows × cols × 8`); a larger output fails with `QUANT_RESULT_TOO_LARGE` (default 16777216). */
  maxOutputBytes?: number
}

export const Config: z<Config> = z.object({
  maxOutputBytes: z.natural().min(1).default(DEFAULT_MAX_OUTPUT_BYTES),
})

/**
 * Reference {@link QuantProvider}: deterministic group ternary quantization and dense GEMM over
 * plain row-major `number[]` matrices. Correctness is pinned by this package's spec.
 */
export class ReferenceQuantProvider implements QuantProvider {
  readonly id = QuantProviderId('reference')
  readonly operations: readonly QuantOperation[] = ['quantize', 'gemm', 'capabilities']
  readonly device = 'cpu-reference'

  constructor(private readonly maxOutputBytes: number) {}

  execute(request: QuantProviderQuery, signal?: AbortSignal): Promise<QuantResult> {
    signal?.throwIfAborted()
    switch (request.operation) {
      case 'quantize':
        return Promise.resolve(this.quantize(request.weights, request.groupSize))
      case 'gemm':
        return Promise.resolve(this.gemm(request.activation, request.weights, request.groupSize))
      case 'capabilities':
        return Promise.resolve({ kind: 'capabilities', bitWidths: [2], device: this.device, throughputClaims: [] })
      /* v8 ignore next -- exhaustive over the closed QuantProviderQuery union; unreachable. */
      default:
        throw new QuantError('quant-reference: unsupported operation', 'QUANT_UNSUPPORTED_OPERATION')
    }
  }

  /** Group symmetric ternary quantize: per group, `scale = max(mean(|w|), 1e-7)`, code `round(clamp(w / scale, -1, +1))`. */
  private quantize(weights: QuantMatrix, groupSize: number): QuantResult {
    const [rows, cols] = weights.shape
    assertGroupSize(cols, groupSize)
    const scales = groupScales(weights.data, rows, cols, groupSize)
    const codes: number[] = []
    for (let index = 0; index < weights.data.length; index++) {
      const scale = scales[Math.floor(index / groupSize)] ?? 1
      codes.push(ternaryCode(weights.data[index] ?? 0, scale))
    }
    return { kind: 'quantized', codes, scales, groupSize, bitsPerWeight: 2, memoryRatioVsFp16: 8 }
  }

  /** Dense ternary GEMM: `activation @ dequantize(weights)` with per-row-group scales. */
  private gemm(activation: QuantMatrix, weights: QuantMatrix, groupSize: number): QuantResult {
    const [activationRows, k] = activation.shape
    const [weightRows, n] = weights.shape
    if (k !== weightRows) {
      throw new QuantError(
        `quant-reference: gemm activation columns (${k}) must equal weight rows (${weightRows})`,
        'QUANT_UNSUPPORTED_OPERATION',
      )
    }
    assertGroupSize(n, groupSize)
    const outputBytes = activationRows * n * 8
    if (outputBytes > this.maxOutputBytes) {
      throw new QuantError(
        `gemm output exceeds maxOutputBytes (${outputBytes} > ${this.maxOutputBytes}): reduce the matrices or raise maxOutputBytes`,
        'QUANT_RESULT_TOO_LARGE',
      )
    }
    const dequantized = dequantize(weights.data, weightRows, n, groupSize)
    const data: number[] = []
    for (let row = 0; row < activationRows; row++) {
      for (let column = 0; column < n; column++) {
        let sum = 0
        for (let depth = 0; depth < k; depth++) {
          sum += (activation.data[row * k + depth] ?? 0) * (dequantized[depth]?.[column] ?? 0)
        }
        data.push(sum)
      }
    }
    return { kind: 'gemm', output: { shape: [activationRows, n], data } }
  }
}

/** Reject a group size that cannot partition the weight columns. */
function assertGroupSize(cols: number, groupSize: number): void {
  if (groupSize <= 0 || cols % groupSize !== 0) {
    throw new QuantError(
      `quant-reference: groupSize must be a positive divisor of the weight column count (${cols} % ${groupSize} !== 0)`,
      'QUANT_UNSUPPORTED_OPERATION',
    )
  }
}

/** `round(clamp(value / scale, -1, 1))` with a canonical `+0` (never `-0`). */
function ternaryCode(value: number, scale: number): number {
  const code = Math.round(Math.max(-1, Math.min(1, value / scale)))
  return code === 0 ? 0 : code
}

/** Per-row-group scales, row-major over `rows * (cols / groupSize)` groups. */
function groupScales(data: readonly number[], rows: number, cols: number, groupSize: number): number[] {
  const groupsPerRow = cols / groupSize
  const scales: number[] = []
  for (let row = 0; row < rows; row++) {
    const rowOffset = row * cols
    for (let group = 0; group < groupsPerRow; group++) {
      let sum = 0
      for (let column = group * groupSize; column < (group + 1) * groupSize; column++) {
        sum += Math.abs(data[rowOffset + column] ?? 0)
      }
      scales.push(Math.max(sum / groupSize, 1e-7))
    }
  }
  return scales
}

/** Reconstruct each weight as `code × scale` using the entheai group formula. */
function dequantize(
  data: readonly number[],
  rows: number,
  cols: number,
  groupSize: number,
): number[][] {
  const scales = groupScales(data, rows, cols, groupSize)
  const dequantized: number[][] = []
  for (let row = 0; row < rows; row++) {
    const rowOffset = row * cols
    const out: number[] = []
    for (let column = 0; column < cols; column++) {
      const scale = scales[Math.floor((rowOffset + column) / groupSize)] ?? 1
      out.push(ternaryCode(data[rowOffset + column] ?? 0, scale) * scale)
    }
    dequantized.push(out)
  }
  return dequantized
}

/**
 * Register the `reference` quant provider.
 * @param ctx - the plugin context carrying `quant`.
 * @param config - the resolved plugin configuration (schemastery has filled every default).
 */
export function apply(ctx: Context, config: Config): void {
  const maxOutputBytes = config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new Error('quant-reference: maxOutputBytes must be a positive integer')
  }
  const provider = new ReferenceQuantProvider(maxOutputBytes)
  ctx.effect(() => ctx.quant.registerProvider(provider), 'quant-reference.registerProvider')
}
