/**
 * Service Definition for the quantization capability seam (`ctx.quant`): a backend provider
 * registry and order-independent selection over normalized group ternary quantize / ternary GEMM /
 * capabilities requests, aligned to the entheai engine's `crates/ternary` semantics.
 *
 * A provider reserves a branded id exclusively: {@link Quant.registerProvider} validates and
 * conflict-checks before mutating, so an invalid or conflicting registration publishes nothing,
 * and its disposer releases the reservation together. Selection routes a request by its `backend`
 * field (or the single registered default); it never depends on registration order. The seam
 * exposes exactly the three operations and no protocol escape hatch.
 * @module @deepseek-ai/dsh-quant
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { QuantProviderId } from './brand.ts'
import type {
  QuantProvider,
  QuantRequest,
  QuantResult,
  QuantService,
} from './types.ts'

export { QuantProviderId } from './brand.ts'
export type {
  CapabilitiesRequest,
  GemmRequest,
  GemmResult,
  QuantCapabilities,
  QuantMatrix,
  QuantOperation,
  QuantProvider,
  QuantProviderQuery,
  QuantRequest,
  QuantResult,
  QuantService,
  QuantizeRequest,
  QuantizedWeights,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    quant: QuantService
  }
}

/**
 * Structured quantization failure. Extends {@link HarnessError} with a stable `code`
 * (`QUANT_INVALID_PROVIDER`, `QUANT_CONFLICT`, `QUANT_UNAVAILABLE`, `QUANT_DISPOSED`,
 * `QUANT_UNSUPPORTED_OPERATION`, `QUANT_MALFORMED_RESPONSE`, …) that callers route on instead of
 * parsing `message`.
 */
export class QuantError extends HarnessError {}

/**
 * `ctx.quant`. Holds the id reservations and the provider table; a route always has a live
 * provider because disposal removes both together.
 */
export class Quant extends Service implements QuantService {
  private readonly providerIds = new Set<QuantProviderId>()
  private readonly providers = new Map<QuantProviderId, QuantProvider>()

  constructor(ctx: Context) {
    super(ctx, 'quant')
  }

  registerProvider(provider: QuantProvider): () => void {
    // Validate and conflict-check everything BEFORE any mutation: an invalid or conflicting
    // registration must publish nothing (fail-loud, all-or-nothing).
    const id = provider.id
    if (id.trim() === '') {
      throw new QuantError('a quant provider id must be a non-empty string', 'QUANT_INVALID_PROVIDER')
    }
    if (this.providerIds.has(id)) {
      throw new QuantError(`a quant provider with id "${id}" is already registered`, 'QUANT_CONFLICT')
    }
    if (provider.operations.length === 0) {
      throw new QuantError(`quant provider "${id}" registers no operations`, 'QUANT_INVALID_PROVIDER')
    }

    // All checks passed: reserve the id in one lifecycle controller so disposal releases it.
    const dispose = this.ctx.effect(function* (this: Quant) {
      this.providerIds.add(id)
      this.providers.set(id, provider)
      yield () => {
        this.providerIds.delete(id)
        this.providers.delete(id)
      }
    }.bind(this), 'quant.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is synchronous
    // fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  async execute(request: QuantRequest, signal?: AbortSignal): Promise<QuantResult> {
    const id = request.backend !== undefined ? QuantProviderId(request.backend) : defaultProviderId(this.providers)
    const provider = this.providers.get(id)
    if (provider === undefined) {
      throw new QuantError(`no quant provider "${String(id)}" is registered`, 'QUANT_UNAVAILABLE')
    }
    if (!provider.operations.includes(request.operation)) {
      throw new QuantError(
        `quant provider "${String(id)}" does not support operation "${request.operation}"`,
        'QUANT_UNSUPPORTED_OPERATION',
      )
    }
    return provider.execute(request, signal)
  }
}

/** The sole registered provider id, or `QUANT_UNAVAILABLE` when selection is ambiguous. */
function defaultProviderId(providers: Map<QuantProviderId, QuantProvider>): QuantProviderId {
  if (providers.size === 1) {
    const only = providers.keys().next().value
    if (only !== undefined) return only
  }
  throw new QuantError(
    'no default quant provider: select one via the request backend field',
    'QUANT_UNAVAILABLE',
  )
}

export default Quant
