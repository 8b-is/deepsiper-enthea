# 量化能力接缝

[English](quant.md) | 中文

`ctx.quant` 是抽象的低比特量化接缝：以品牌化后端 id 为键的 provider 注册表、与顺序无关的 provider 选择、用于分组三值量化、三值 GEMM 与能力报告的归一化请求/结果词汇，以及 `QuantError` 错误分类。[服务定义 README](../../packages/quant/quant/README.md) 拥有完整契约；本页记录来自 [`packages/quant/quant/src/types.ts`](../../packages/quant/quant/src/types.ts) 的确切服务表面。

该接缝内置一个进程内 provider：[`quant-reference`](../../packages/quant/quant-reference/README.md)，一个纯软件 BitNet b1.58 后端，不涉及子进程、文件系统、SIMD 或设备 I/O。可选启用的模型面 [`quant_ternary`](../../packages/quant/tool-quant/README.md) 工具是消费方；它在 `ctx.tools` 之外注入 `ctx.quant`，并在没有注册 provider 时明确失败。

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
