/**
 * GAIA-MLX-QUANT software-lane provider for `ctx.quant` ([8b-is/alexiai](https://github.com/8b-is/alexiai)
 * `rust/gaia-mlx-quant`). The native crate is a `no_std` library with no process or HTTP surface,
 * so this provider implements the same seam contract in portable TypeScript: group symmetric
 * ternary quantize, a dense ternary GEMM over dequantized weights, and capabilities reporting the
 * GAIA packing claim of five trits per byte. It is the software lane, not the p/q integer kernel.
 * @module @deepseek-ai/dsh-quant-gaia
 */

import { spawn } from 'node:child_process'
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

export const name = 'quant-gaia'
export const inject = ['quant']

/** Largest `gemm` output this provider materializes, in bytes (16 MiB). */
export const DEFAULT_MAX_OUTPUT_BYTES = 16_777_216

/** Physical packed bits per weight for GAIA's five-trits-per-byte layout. */
export const GAIA_BITS_PER_WEIGHT = 8 / 5

/** Memory ratio versus FP16 at {@link GAIA_BITS_PER_WEIGHT}. */
export const GAIA_MEMORY_RATIO_VS_FP16 = 16 / GAIA_BITS_PER_WEIGHT

/** Plugin configuration: the gemm output bound and an optional native CLI. */
export interface Config {
  /** Largest `gemm` output in bytes (`rows × cols × 8`); a larger output fails loud (default 16777216). */
  maxOutputBytes?: number
  /** Native `gaia-quant` CLI path; when set, requests are delegated to it. */
  binary?: string
}

export const Config: z<Config> = z.object({
  maxOutputBytes: z.natural().min(1).default(DEFAULT_MAX_OUTPUT_BYTES),
  binary: z.string(),
})

/** The subset of `spawn` the native bridge uses; injectable for tests. */
export type SpawnFn = typeof spawn

const NATIVE_KIND = { quantize: 'quantized', gemm: 'gemm', capabilities: 'capabilities' } as const

/** True for a plain JSON object (never null, array, or primitive). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True for a finite JSON number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** True for an array whose every item is a finite number. */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber)
}

/** True for an array whose every item is a string. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/** A malformed native response, routed as `QUANT_MALFORMED_RESPONSE`. */
function malformed(detail: string): QuantError {
  return new QuantError(`quant-gaia: native backend returned ${detail}`, 'QUANT_MALFORMED_RESPONSE')
}

/**
 * Validate a native result against the closed {@link QuantResult} union before
 * any consumer can dereference it. The process boundary is untrusted: a missing
 * field, a wrong discriminant, or an oversized gemm output is rejected here.
 * @param parsed - the decoded JSON value.
 * @param operation - the request operation that must agree with `kind`.
 * @param maxOutputBytes - the gemm output bound.
 * @returns the validated result.
 * @throws QuantError on any shape, kind, or bound violation.
 */
export function validateNativeResult(
  parsed: unknown,
  operation: QuantOperation,
  maxOutputBytes: number,
): QuantResult {
  if (!isRecord(parsed)) throw malformed('a non-object result')
  const kind = parsed.kind
  if (kind !== NATIVE_KIND[operation]) {
    throw malformed(`result kind ${JSON.stringify(kind)} for ${operation}`)
  }
  switch (kind) {
    case 'quantized': {
      if (!isNumberArray(parsed.codes)) throw malformed('quantized.codes')
      if (!isNumberArray(parsed.scales)) throw malformed('quantized.scales')
      if (!Number.isInteger(parsed.groupSize) || (parsed.groupSize as number) <= 0) {
        throw malformed('quantized.groupSize')
      }
      if (!isFiniteNumber(parsed.bitsPerWeight) || parsed.bitsPerWeight <= 0) {
        throw malformed('quantized.bitsPerWeight')
      }
      if (!isFiniteNumber(parsed.memoryRatioVsFp16) || parsed.memoryRatioVsFp16 <= 0) {
        throw malformed('quantized.memoryRatioVsFp16')
      }
      return parsed as unknown as QuantResult
    }
    case 'gemm': {
      if (!isRecord(parsed.output)) throw malformed('gemm.output')
      const shape = parsed.output.shape
      if (
        !Array.isArray(shape)
        || shape.length !== 2
        || !shape.every(size => Number.isInteger(size) && (size as number) >= 0)
      ) {
        throw malformed('gemm.output.shape')
      }
      const [rows, columns] = shape as [number, number]
      if (!isNumberArray(parsed.output.data)) throw malformed('gemm.output.data')
      if (parsed.output.data.length !== rows * columns) throw malformed('gemm.output.data length')
      if (rows * columns * 8 > maxOutputBytes) {
        throw new QuantError(
          `gemm output exceeds maxOutputBytes (${rows * columns * 8} > ${maxOutputBytes})`,
          'QUANT_RESULT_TOO_LARGE',
        )
      }
      return parsed as unknown as QuantResult
    }
    case 'capabilities': {
      if (!isNumberArray(parsed.bitWidths)) throw malformed('capabilities.bitWidths')
      if (typeof parsed.device !== 'string') throw malformed('capabilities.device')
      if (!isStringArray(parsed.throughputClaims)) throw malformed('capabilities.throughputClaims')
      return parsed as unknown as QuantResult
    }
    /* v8 ignore next -- NATIVE_KIND exhausts the closed operation union. */
    default:
      throw malformed('an unknown result kind')
  }
}

/**
 * Delegate one request to a native `gaia-quant` CLI: the request is JSON on
 * stdin and the result is JSON on stdout, validated against the seam's closed
 * union. A child that exits before consuming stdin cannot crash the harness
 * with an unhandled `EPIPE`.
 * @param binary - the native CLI path.
 * @param request - the normalized request.
 * @param maxOutputBytes - the gemm output bound enforced on the response.
 * @param signal - caller cancellation.
 * @param spawnFn - process launcher, defaulting to Node's `spawn`.
 * @returns the validated result.
 * @throws QuantError when the process fails, returns a malformed result, or exceeds the bound.
 */
export async function runNative(
  binary: string,
  request: QuantProviderQuery,
  maxOutputBytes: number,
  signal?: AbortSignal,
  spawnFn: SpawnFn = spawn,
): Promise<QuantResult> {
  return await new Promise<QuantResult>((resolve, reject) => {
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }
    const child = spawnFn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'], ...signal === undefined ? {} : { signal } })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    // A child may exit before reading a large request. Ignore EPIPE; the close
    // handler owns the outcome.
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') fail(error)
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      fail(error.code === 'ENOENT'
        ? new QuantError(`quant-gaia: native binary ${JSON.stringify(binary)} was not found`, 'QUANT_UNAVAILABLE')
        : error)
    })
    child.on('close', (code, closeSignal) => {
      if (settled) return
      settled = true
      if (signal?.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new Error('quant-gaia: native request aborted'))
        return
      }
      if (code !== 0) {
        reject(new QuantError(
          `quant-gaia: ${binary} exited with status ${String(code ?? closeSignal)}: ${stderr.trim()}`,
          'QUANT_PROVIDER_FAILURE',
        ))
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(stdout)
      } catch (error) {
        /* v8 ignore next -- JSON.parse only throws SyntaxError, an Error. */
        reject(malformed(`invalid JSON (${error instanceof Error ? error.message : String(error)})`))
        return
      }
      try {
        resolve(validateNativeResult(parsed, request.operation, maxOutputBytes))
      } catch (error) {
        /* v8 ignore next -- validateNativeResult only throws QuantError. */
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    child.stdin.end(JSON.stringify(request))
  })
}


/**
 * GAIA-lane {@link QuantProvider}: group ternary quantization and dense GEMM over plain row-major
 * `number[]` matrices, reporting the GAIA five-trits-per-byte packing ratio.
 */
export class GaiaQuantProvider implements QuantProvider {
  readonly id = QuantProviderId('gaia')
  readonly operations: readonly QuantOperation[] = ['quantize', 'gemm', 'capabilities']
  readonly device = 'cpu-gaia-pq'

  constructor(
    private readonly maxOutputBytes: number,
    private readonly binary?: string,
    private readonly spawnFn: SpawnFn = spawn,
  ) {}

  async execute(request: QuantProviderQuery, signal?: AbortSignal): Promise<QuantResult> {
    signal?.throwIfAborted()
    if (this.binary !== undefined) return await runNative(this.binary, request, this.maxOutputBytes, signal, this.spawnFn)
    switch (request.operation) {
      case 'quantize':
        return this.quantize(request.weights, request.groupSize)
      case 'gemm':
        return this.gemm(request.activation, request.weights, request.groupSize)
      case 'capabilities':
        return {
          kind: 'capabilities',
          bitWidths: [2],
          device: this.device,
          throughputClaims: [
            'five trits per byte (8/5 bits per weight)',
            'software lane; the Rust p/q kernel is the native lane',
          ],
        }
      /* v8 ignore next -- exhaustive over the closed QuantProviderQuery union; unreachable. */
      default:
        throw new QuantError('quant-gaia: unsupported operation', 'QUANT_UNSUPPORTED_OPERATION')
    }
  }

  /** Group symmetric ternary quantize: per group, `scale = max(mean(|w|), 1e-7)`, code `round(clamp(w / scale, -1, +1))`. */
  private quantize(weights: QuantMatrix, groupSize: number): QuantResult {
    const cols = weights.shape[1]
    assertGroupSize(cols, groupSize)
    const scales = groupScales(weights.data, cols, groupSize)
    const codes: number[] = []
    for (let index = 0; index < weights.data.length; index++) {
      /* v8 ignore next -- index is bounded by the declared matrix length. */
      const scale = scales[Math.floor(index / groupSize)] ?? 1
      /* v8 ignore next -- index is bounded by the declared matrix length. */
      codes.push(ternaryCode(weights.data[index] ?? 0, scale))
    }
    return {
      kind: 'quantized',
      codes,
      scales,
      groupSize,
      bitsPerWeight: GAIA_BITS_PER_WEIGHT,
      memoryRatioVsFp16: GAIA_MEMORY_RATIO_VS_FP16,
    }
  }

  /** Dense ternary GEMM: `activation @ dequantize(weights)` with per-row-group scales. */
  private gemm(activation: QuantMatrix, weights: QuantMatrix, groupSize: number): QuantResult {
    const [activationRows, k] = activation.shape
    const [weightRows, n] = weights.shape
    if (k !== weightRows) {
      throw new QuantError(
        `quant-gaia: gemm activation columns (${k}) must equal weight rows (${weightRows})`,
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
          /* v8 ignore next -- row/column/depth are bounded by the declared shapes. */
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
      `quant-gaia: groupSize must be a positive divisor of the weight column count (${cols} % ${groupSize} !== 0)`,
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
function groupScales(data: readonly number[], cols: number, groupSize: number): number[] {
  const groupsPerRow = cols / groupSize
  const scales: number[] = []
  for (let rowOffset = 0; rowOffset < data.length; rowOffset += cols) {
    for (let group = 0; group < groupsPerRow; group++) {
      let sum = 0
      for (let column = group * groupSize; column < (group + 1) * groupSize; column++) {
        /* v8 ignore next -- rowOffset + column is bounded by the declared matrix length. */
        sum += Math.abs(data[rowOffset + column] ?? 0)
      }
      scales.push(Math.max(sum / groupSize, 1e-7))
    }
  }
  return scales
}

/** Reconstruct each weight as `code × scale` using the entheai group formula. */
function dequantize(data: readonly number[], rows: number, cols: number, groupSize: number): number[][] {
  const scales = groupScales(data, cols, groupSize)
  const dequantized: number[][] = []
  for (let row = 0; row < rows; row++) {
    const rowOffset = row * cols
    const out: number[] = []
    for (let column = 0; column < cols; column++) {
      /* v8 ignore next -- rowOffset + column is bounded by the declared matrix length. */
      const scale = scales[Math.floor((rowOffset + column) / groupSize)] ?? 1
      /* v8 ignore next -- rowOffset + column is bounded by the declared matrix length. */
      out.push(ternaryCode(data[rowOffset + column] ?? 0, scale) * scale)
    }
    dequantized.push(out)
  }
  return dequantized
}

/**
 * Register the `gaia` quant provider.
 * @param ctx - the plugin context carrying `quant`.
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  /* v8 ignore next -- the Config schema defaults maxOutputBytes before apply runs. */
  ctx.quant.registerProvider(new GaiaQuantProvider(config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, config.binary))
}
