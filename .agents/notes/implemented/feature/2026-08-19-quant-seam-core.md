# Agent Note: QUANT — low-bit quantization seam in core + opt-in tool

Status: implemented

## Problem

The harness ships three layers of low-bit inference foundation — the
harness (TypeScript), the entheai Rust engine (`crates/ternary`), and the
MLX-QUANT hardware layer (Metal / NEON / bare-metal dispatch) — but had no
seam for them: no normalized "quantize ternary weights / run ternary GEMM"
capability on `ctx`, no provider registry for a hardware or engine backend to
slot into, and no keyless correctness gate for the b1.58 semantics. The
benchmark sweep graded a model-facing `BitLinear {-1, 0, +1}` task, but
nothing verified the quantize/GEMM semantics themselves.

## Decision

Mirror the LSP seam shape (`Service Definition / Provider / Consumer`),
aligned to the entheai `crates/ternary` quantizer as the single source of
truth (`scale_g = max(mean(|w| over group), 1e-7)`, code
`round(clamp(w/scale, −1, +1))` in `{-1, 0, +1}`).

- `@deepseek-ai/dsh-quant` (Service Definition, `ctx.quant`): provider
  registry keyed by branded backend id, order-independent selection,
  three operations (`quantize` / `gemm` / `capabilities`), closed result
  union, `QuantError` taxonomy.
- `@deepseek-ai/dsh-quant-reference` (Provider): pure-software quantize +
  dense ternary GEMM matching the entheai formula exactly, with
  `maxOutputBytes` bound (`QUANT_RESULT_TOO_LARGE`). This is the parity
  target every future hardware provider must reproduce.
- `@deepseek-ai/dsh-tool-quant` (Consumer): the opt-in model-facing
  `quant_ternary` tool (summary output — codes/scales stay out of the result
  to bound tokens).
- **Core placement**: seam + reference provider mounted in the `dsh-base`
  bundle (zero model-visible surface). The tool stays opt-in until a hardware
  backend passes the audit-checklist evidence gate (8× memory vs FP16,
  PPL ≤ +0.05, >350 GB/s sustained) — per the evidence rule for public
  defaults.

## Verification

- Seam 7/7, provider 12/12, tool 7/7 (26/26 in `packages/quant`); host
  `tsc -b tsconfig.host.json` clean; `verify-package-invariants` 238 conform;
  `verify-cordis-config` 125 config files pass; base bundle tests 2/2;
  translation pairing consistent.
- Headless core boot with `quant` + `quant-reference` mounted exits 0.
- Worked-example parity: weights `[3.0, -1.0, 0.2, -0.4]` group 4 → scale
  1.15, codes `[1, -1, 0, 0]` (matches entheai formula); round-trip
  dequantize error ≤ 1e-3; ternary gemm vs dense ≤ 1e-3.

## Engineering notes

- The `Quant` service must not use `#private` methods: Cordis's traceable
  context proxy re-invokes methods with a shadow proxy as `this`, so a
  private-method call through `ctx.quant.execute` throws. `defaultProviderId`
  is a module-level function instead.
- The new `quant` group needed `tsconfig.base.json` source wildcards and its
  own `packages/README.md` group row.

## Alternatives considered

- **Adding `quantize`/`gemm` as tool calls without a seam** — rejected: the
  repo's capability-seam rule requires Service Definition / Provider /
  Consumer roles so a hardware backend swap never changes the model contract.
- **Shipping the tool in core defaults** — rejected: no hardware backend has
  passed the audit-checklist evidence gate yet.

## Deferred work

- `dsh-quant-entheai` (napi-rs binding of `crates/ternary`, parity-checked
  against the reference provider).
- `dsh-quant-hwultra` (MLX-QUANT Metal / NEON / `agx_doorbell` provider behind
  a config flag + safe fallback), gated on the audit checklist.
- Extend the eval-entheai sweep with a kernel-level quant benchmark once a
  hardware provider lands.
