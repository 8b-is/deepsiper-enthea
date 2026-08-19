/**
 * Quant seam vocabulary: the normalized request, provider, and result contracts for low-bit
 * (BitNet b1.58 ternary) quantization and ternary GEMM. Types only — the {@link QuantError}
 * taxonomy and the {@link QuantProviderId} brand factory are runtime and live in `index.ts`.
 *
 * Semantics align to the entheai engine's `crates/ternary` quantizer (single source of truth):
 * group-based symmetric ternary quantization with `scale_g = max(mean(|w| over group), 1e-7)` and
 * code `round(clamp(w / scale_g, -1, +1))` in `{-1, 0, +1}`. The seam exposes no protocol types,
 * device or process controls, or generic escape hatch — only the three operations.
 * @module @deepseek-ai/dsh-quant/types
 */

import type { QuantProviderId } from './brand.ts'

/**
 * The three normalized operations: quantize weights to ternary codes + group scales, run a ternary
 * GEMM over an activation matrix, and report backend capabilities. A closed union: adding an
 * operation is a compile-enforced change across the seam, providers, and the tool.
 */
export type QuantOperation = 'quantize' | 'gemm' | 'capabilities'

/** A dense row-major matrix of IEEE-754 double values. */
export interface QuantMatrix {
  /** `[rows, cols]`; `data.length` must equal `rows * cols`. */
  readonly shape: readonly [number, number]
  /** Row-major values. */
  readonly data: readonly number[]
}

/** Quantize a weight matrix into ternary codes and per-group scales. */
export interface QuantizeRequest {
  readonly operation: 'quantize'
  /** The full-precision weight matrix to quantize. */
  readonly weights: QuantMatrix
  /** Number of weights per scale group; must divide the weight column count. */
  readonly groupSize: number
  /** Backend id to select; omitted selects the default provider. */
  readonly backend?: string
}

/** Run a ternary GEMM: `activation @ (dequantize(quantize(weights)))`. */
export interface GemmRequest {
  readonly operation: 'gemm'
  /** The dense activation matrix (`M x K`). */
  readonly activation: QuantMatrix
  /** The full-precision weight matrix (`K x N`); the provider quantizes it. */
  readonly weights: QuantMatrix
  /** Number of weights per scale group; must divide the weight column count. */
  readonly groupSize: number
  /** Backend id to select; omitted selects the default provider. */
  readonly backend?: string
}

/** Report what a backend supports. */
export interface CapabilitiesRequest {
  readonly operation: 'capabilities'
  /** Backend id to select; omitted selects the default provider. */
  readonly backend?: string
}

/** A caller's normalized request; providers receive it as-is (no derived fields). */
export type QuantRequest = QuantizeRequest | GemmRequest | CapabilitiesRequest

/** A request as a provider receives it: identical to the caller's request. */
export type QuantProviderQuery = QuantRequest

/** Quantized ternary weights: packed codes, per-group scales, and the memory report. */
export interface QuantizedWeights {
  readonly kind: 'quantized'
  /** Row-major ternary codes in `{-1, 0, +1}`. */
  readonly codes: readonly number[]
  /** Per-group scales (one per `weights.cols / groupSize` group). */
  readonly scales: readonly number[]
  /** The group size used. */
  readonly groupSize: number
  /** Packed bits per weight (2 for ternary). */
  readonly bitsPerWeight: number
  /** Memory ratio vs FP16 (16 / `bitsPerWeight`). */
  readonly memoryRatioVsFp16: number
}

/** The dense output matrix of a ternary GEMM. */
export interface GemmResult {
  readonly kind: 'gemm'
  readonly output: QuantMatrix
}

/** Backend capabilities. Throughput figures are provider claims, never verified facts. */
export interface QuantCapabilities {
  readonly kind: 'capabilities'
  /** Packed bit widths the backend can execute (e.g. `[2]` for ternary). */
  readonly bitWidths: readonly number[]
  /** Device label (e.g. `cpu-reference`, `metal`, `neon`, `cuda`). */
  readonly device: string
  /** Unverified throughput/latency claims from the backend; surfaced verbatim. */
  readonly throughputClaims: readonly string[]
}

/** The closed result union. Consumers `switch` on `kind` to exhaustiveness. */
export type QuantResult = QuantizedWeights | GemmResult | QuantCapabilities

/** A low-bit quantization backend registered on `ctx.quant`. */
export interface QuantProvider {
  /** Stable provider identity, reserved exclusively at registration. */
  readonly id: QuantProviderId
  /** The operations this backend supports. */
  readonly operations: readonly QuantOperation[]
  /** Device label reported through `capabilities`; optional. */
  readonly device?: string
  /**
   * Execute one request. The seam has already selected this provider by backend id.
   * @param request - the normalized provider request.
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  execute(request: QuantProviderQuery, signal?: AbortSignal): Promise<QuantResult>
}

/**
 * The quantization capability seam (`ctx.quant`). Owns provider registration/selection and
 * normalized execution of the three operations; exposes no protocol escape hatch.
 */
export interface QuantService {
  /**
   * Register a provider, atomically reserving its branded id. Any conflict or invalid input
   * publishes nothing and throws `QuantError`; the returned disposer releases the reservation.
   * Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id reservation.
   */
  registerProvider(provider: QuantProvider): () => void
  /**
   * Select a provider by the request's `backend` (or the single registered default) and execute
   * one request. No match throws `QuantError` `QUANT_UNAVAILABLE`.
   * @param request - the normalized request.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  execute(request: QuantRequest, signal?: AbortSignal): Promise<QuantResult>
}
