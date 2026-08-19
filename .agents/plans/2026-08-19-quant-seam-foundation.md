# Spec — `quant` capability seam: low-bit quantization foundation in core

Status: spec (pending implementation)
Date: 2026-08-19
Owner: deepsiper-enthea (8b-is/deepsiper-enthea)
Process: learn-harness-engineering — capability seam (Service Definition / Provider / Consumer), evidence-gated defaults

## 1. Problem (brainstorm)

The stack already ships three layers of low-bit inference foundation — the
harness (TypeScript), the entheai Rust engine (`crates/ternary` with
`quantize.rs` / `gemm.rs`), and the MLX-QUANT hardware layer (Metal, NEON
SIMD, `agx_doorbell` bare-metal dispatch) — but the harness has **no seam** for
them. There is no normalized "quantize ternary weights / run quantized GEMM"
capability on `ctx`, no provider registry a hardware or engine backend can
slot into, and no keyless correctness gate for the b1.58 semantics. The
benchmark sweep grades a model-facing `BitLinear {-1, 0, +1}` quantizer task,
but nothing verifies the kernel/engine quantize semantics themselves.

## 2. Design

Mirror the proven LSP seam shape (`@deepseek-ai/dsh-lsp` + `lsp-stdio` +
`tool-lsp`): a Service Definition registry, providers that reserve a branded
id exclusively, and a model-facing consumer that stays **opt-in** until the
hardware numbers are earned (evidence rule: no shipped default without the
audit-checklist proof).

### 2.1 `@deepseek-ai/dsh-quant` — Service Definition (`ctx.quant`)

- `QuantProviderId` brand (mirror `LspProviderId`).
- Normalized vocabulary, **aligned to entheai ternary semantics** (single
  source of truth): group-based symmetric ternary quantization,
  `scale_g = max(mean(|w| over group), 1e-7)`, code `round(clamp(w/scale, −1, +1))`
  ∈ `{-1, 0, +1}`; `groupSize` is a query field (default 128).
- Operations: `quantize` (weights → `{ codes: Int8Matrix, scale: number[] }`
  with `bitsPerWeight`), `gemm` (dense activation × ternary weights →
  float output), `capabilities` (backend-reported: bit widths, SIMD/device,
  and **unverified** throughput claims surfaced as claims, not facts).
- Closed result union (`quantized` | `gemm` | `capabilities`); consumers
  `switch` to exhaustiveness.
- `registerProvider(provider)` validates id + exclusive backend reservation,
  all-or-nothing, disposer releases together (mirror LSP `registerProvider`).
- `quantize(request, signal?)` / `gemm(request, signal?)` select by backend id
  (or the single registered default) and fail `QUANT_UNAVAILABLE` otherwise.
- `QuantError` extends `HarnessError` with codes `QUANT_INVALID_PROVIDER`,
  `QUANT_CONFLICT`, `QUANT_UNAVAILABLE`, `QUANT_DISPOSED`,
  `QUANT_UNSUPPORTED_OPERATION`, `QUANT_MALFORMED_RESPONSE`.
- `./invariant` companion with a `No runtime invariant:` reason (seam has no
  owned event/data relation yet; the registry conflict rules are unit-tested).

### 2.2 `@deepseek-ai/dsh-quant-reference` — Service Provider (software fallback)

- Pure-TS, no deps beyond the seam: group ternary `quantize` matching the
  entheai `quantize.rs` formula exactly (`max(mean(|w|), 1e-7)` scale,
  round-clamp to `{-1, 0, +1}`), and a dense ternary `gemm`
  (`X @ (W_quant * scale)`), bounded with `maxOutputBytes` (default 16 MiB).
- Registers as backend `reference`.
- This is the **parity reference** for the entheai crate and the target for
  future NEON/Metal providers: every hardware provider must reproduce its
  quantize output for the same input.

### 2.3 `@deepseek-ai/dsh-tool-quant` — Consumer (opt-in, NOT in core defaults)

- Model-facing `quant_ternary` tool: input a weight matrix (JSON 2-D array),
  output `{ codes, scales, bits_per_weight, memory_ratio_vs_fp16 }`.
- Opt-in only: not mounted in `dsh-base`. Profiles/presets enable it once the
  audit-checklist gate passes on a hardware backend.

### 2.4 Core placement

- Mount `dsh-quant` (seam) + `dsh-quant-reference` (provider) in
  `packages/bundle/base/cordis.patch.yml` — zero model-visible surface, zero
  token effect, capability available to every profile. The tool stays opt-in.
- Add the two workspace deps to `packages/bundle/base/package.json`.

### 2.5 Future providers (documented, not built this cycle)

- `dsh-quant-entheai`: napi-rs binding of `crates/ternary` (in-process),
  parity-checked against `dsh-quant-reference`.
- `dsh-quant-hwultra`: MLX-QUANT Metal / NEON / `agx_doorbell` provider behind
  a config flag + safe fallback to reference; **must reproduce reference
  quantize output** and pass the audit checklist (8× memory vs FP16,
  PPL ≤ +0.05, >350 GB/s sustained) before it may ship as a default.

## 3. Acceptance (verification)

1. Seam unit tests: registration conflict / invalid id / exclusivity fail
   loud all-or-nothing; disposer releases reservations; HMR-safety disposal
   test; `QUANT_UNAVAILABLE` on unknown backend.
2. Reference provider tests: quantize matches the entheai formula on the
   skill's worked example; round-trip `dequantize(quantize(w))` tolerance
   ≤ 1e-3; ternary `gemm` vs dense `mx.matmul` tolerance ≤ 1e-3; oversized
   output rejected (bound test).
3. Tool consumer test: `quant_ternary` renders `bits_per_weight` and
   `memory_ratio_vs_fp16` (1.58 bpp → ~10.1× vs FP16), opt-in.
4. `verify-cordis-config` passes with the base-mount rows + deps; base bundle
   tests pass; headless core boot (seam + reference mounted) exits 0.
5. `tsc -b` + package invariants + README model-experience + export-jsdoc
   clean for the three new packages.
6. No model-visible default change: tool not in base; the sweep's 5 benchmark
   tasks still 100%.

## 4. Scope

- In: the three packages, base-bundle mount (seam + reference only), package
  READMEs (Model Experience + Known Limitations), Agent Note, release bump.
- Out: entheai/hw-ultra providers, NEON kernel benchmark, audit-checklist gate
  run, tool in core defaults — all documented as follow-ups in the notes.
