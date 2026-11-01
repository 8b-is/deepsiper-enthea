# Quantization capability seam

English | [中文](quant.zh.md)

`ctx.quant` is the abstract low-bit quantization seam: a provider registry keyed by a branded backend id, order-independent provider selection, one normalized request/result vocabulary for group ternary quantize, ternary GEMM, and capabilities, and the `QuantError` taxonomy. The [service definition README](../../packages/quant/quant/README.md) owns the full contract; this page records the exact service surface from [`packages/quant/quant/src/types.ts`](../../packages/quant/quant/src/types.ts).

The seam ships one in-process provider, [`quant-reference`](../../packages/quant/quant-reference/README.md), a pure-software BitNet b1.58 backend with no subprocess, filesystem, SIMD, or device I/O. The opt-in model-facing [`quant_ternary`](../../packages/quant/tool-quant/README.md) tool is the consumer; it injects `ctx.quant` alongside `ctx.tools` and fails loud when no provider is registered.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxquant--quantservice"></a>

### `ctx.quant` — `QuantService`

The quantization capability seam (`ctx.quant`). Owns provider registration/selection and normalized execution of the three operations; exposes no protocol escape hatch.

```ts cordis-catalog
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
```

Source: [`packages/quant/quant/src/types.ts:123`](../../packages/quant/quant/src/types.ts)
<!-- END GENERATED cordis-surface -->
