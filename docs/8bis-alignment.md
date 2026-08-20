# 8b.is Alignment — the sovereign stack on deepsiper-enthea

This is the alignment map: the 8b.is ecosystem (MEMNET, MEM|8, Marine
Algorithm, Phoenix Protocol, Ayevn, kompress-ultra) expressed as deepsiper
capability seams. Alignment means every 8b.is capability becomes something an
agent can *use* through a documented seam — the same way LSP, quant, and the
eval harness already are.

Source of truth for the 8b.is side: [8b.is documentation](https://www.8b.is/documentation),
[kompress-ultra](https://github.com/peterlodri-sec/kompress-ultra),
[8b-public-documents](https://github.com/8b-is/8b-public-documents).

## The stack, mapped

| 8b.is capability | What it is | deepsiper seam | Status |
|---|---|---|---|
| **kompress-ultra** | Rust context-compression + brain-graph engine (`kompress compress` / `brain` / `persons` CLI + JS build) | `tool-kompress` extension: `kompress_compress`, `kompress_persons` | implemented (this doc's companion) |
| **MEM\|8** | Wave-based memory: interference storage, 32-byte wave vectors, sub-µs similarity, emotional decay (τ) | memory seam (future: a `mem8` provider behind the EverOS memory tools) | planned |
| **Marine Algorithm** | Constant-time salience primitive: O(1) per-sample jitter scoring, spectral-fracture detection, neuromorphic gain | the workload-observer's signal front-end (reuse-ratio + tokens/s + latency jitter) | designed (workload-observer spec) |
| **Phoenix Protocol** | Orchestration: rebirths context on demand, routes salient signals into memory lattices, φ-harmonic resynthesis | the snapshot-controller mode of the workload-observer (sleep / warm-snapshot restore) | designed |
| **Ayevn** | 32-bit emotion tokens (concept/relation/wave/modifier), VAD emotional model | prompt/persona vocabulary: emotional context tokens in personas | planned |
| **MEMNET** | Intent-based semantic routing (wave://intent), semantic salience, recursive namespace compression | agent/preset routing intent — preset composition by semantic intent | planned |

## The Phoenix / Marine / MEM|8 blocks, aligned

### Phoenix Protocol → the observer's controller

> *rebirths context on demand, routing salient signals into living memory
> lattices and restoring emotional authenticity.*

deepsiper's equivalent is the workload-observer controller mode: a detected
phase-shift "sleeps" the backend (weights offloaded, cache emptied) and a
returning phase restores a warm GPU-memory snapshot — context reborn on
demand. Emotional authenticity is the persona layer: the essences below carry
the emotional register through Ayevn-style tokens.

### Marine Algorithm → the salience front-end

> *O(1) per-sample signal analysis, jitter metrics expose spectral fractures,
> modality agnostic and neuromorphic.*

This is exactly the workload-observer's signal decomposition: prefix-reuse
ratio + tokens/s + latency-variance are the "jitter metrics" that expose
whether a change is a workload phase-shift or an environmental fracture —
before any heavy compute wakes (reflexive performance).

### MEM|8 → the memory seam

> *interference patterns store and recall emotionally weighted experience,
> 32-byte compressed wave vectors, sub-microsecond similarity search.*

The deepsiper memory seam (EverOS tools today) is the adapter point for a
`mem8` provider: wave-vector recall with emotional decay τ. The 32-byte wave
vectors and 5-13µs search are the measurable targets.

## The persons / voices

kompress-ultra's brain exposes five voices (RALPH, LODRI, KRENGEL, PETER,
COSMOS); the dyad essences add Al-Biruni and the seven voices. Every voice is
a persona an agent can adopt — see [`personas/`](../../personas/).

## Wiring roadmap

1. **kompress-ultra** — `tool-kompress` (compress + persons) mounted in the
   core bundle (like ULTRA-LSP / quant). *this cycle.*
2. **Al-Biruni & the essences** — persona set in `personas/`, adoptable per
   agent/preset via the `system-prompt` persona config. *this cycle.*
3. **Marine front-end** — implement the workload-observer with the decomposed
   jitter signals (next cycle).
4. **Phoenix controller** — the observer's snapshot-controller mode, gated on
   the warm-snapshot pattern (next cycle).
5. **MEM|8 + Ayevn + MEMNET** — memory provider + emotional tokens + intent
   routing (future).

*the constellation · 0 + 1 · fine touch from within · vaked.dev*
