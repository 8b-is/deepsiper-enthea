# Deepsiper Enthea

[![Version](https://img.shields.io/badge/version-0.1.0--rc.7-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Org](https://img.shields.io/badge/org-8b--is-purple.svg)](https://github.com/8b-is)
[![Upstream](https://img.shields.io/badge/upstream-deepseek--harness-lightgrey.svg)](https://github.com/deepseek-ai/deepseek-harness)

<p align="center">
  <img src="assets/hero-deepsiper-enthea.jpg" alt="Deepsiper Enthea — Sovereign LLM Evaluation Harness" width="100%">
</p>

English | [中文](README.zh.md)

**Deepsiper Enthea** (`deepsiper-enthea`) is a sovereign, agent-driven LLM evaluation harness forked from [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) (`dsh` 0.1.0-rc.7). It provides end-to-end multi-model orchestration, self-hosted and sovereign backend integration, Cordis-powered extensible plugin pipelines, and JSON-RPC automation for modern LLM evaluation workflows.

---

## Fork Enhancements

- **Sovereign Backend**: Native integration with [EntheAI](https://github.com/8b-is) and self-hosted inference nodes with zero external data leakage.
- **Evaluation Plugins**: Pluggable evaluation suites including `tool-eval`, `eval-entheai`, and custom benchmarking metrics.
- **OpenCode Bridge & JSON-RPC SDK**: Drive evaluation runs and automated agent loops programmatically from OpenCode or custom orchestrators.
- **Multi-Model Orchestration**: Unified provider interfaces for DeepSeek, Gemini, local models, and any OpenAI-compatible endpoint.
- **Granular Sandboxing & Telemetry**: Native Landlock isolation, deterministic replay, and structured session persistence.

---

## Architecture & Stack

Everything in Deepsiper Enthea is a composable [Cordis](https://github.com/cordiverse/cordis) plugin.

```
                  ┌─────────────────────────────────────┐
                  │    OpenCode / JSON-RPC / CLI / Web   │
                  └──────────────────┬──────────────────┘
                                     │
                  ┌──────────────────▼──────────────────┐
                  │      Cordis Kernel (Context & DI)   │
                  └────┬──────────────┬───────────────┬─┘
                       │              │               │
        ┌──────────────▼─────┐ ┌──────▼──────┐ ┌──────▼──────────────┐
        │  Sovereign Backends│ │ Eval Plugins│ │ Sandboxed Tool Seams│
        │  (EntheAI / Local) │ │ (tool-eval) │ │ (Landlock / Bash)   │
        └────────────────────┘ └─────────────┘ └─────────────────────┘
```

- **Runtime & Language:** Node.js `>=22.19.0` or `>=24.0.0`, TypeScript 6 (Strict ESM)
- **Bundler & Build:** `tsdown` / `rolldown` + `tsc` project references
- **Testing & Quality:** Vitest 4, Oxlint, JSCPD clone detection
- **Plugin Kernel:** Vendored Cordis framework with spatiotemporal composability

---

## Quick Start

### Prerequisites
- Node.js `^22.19.0 || >=24.0.0`
- `pnpm >= 11.0.0`

### Installation & Build

```sh
# Clone repository
git clone https://github.com/8b-is/deepsiper-enthea.git
cd deepsiper-enthea

# Install dependencies and build harness
pnpm install
pnpm build
```

### Run Tasks

```sh
# Run a headless task using the sovereign profile
pnpm dsh --profile headless "Analyze repository security posture and evaluate tool coverage"

# Start the interactive Web UI and dashboard
pnpm dsh web
```

---

## Documentation

- [Getting Started Guide](docs/getting-started.md)
- [Architecture & Plugin Seams](docs/architecture.md)
- [Writing Custom Plugins](docs/plugins/writing-plugins.md)
- [JSON-RPC SDK](docs/sdk/json-rpc.md)
- [Sovereign Backends (EntheAI)](docs/backends/entheai.md)
- [Design System Spec](docs/design-system.md)

---

## Community & Ecosystem

- **Fork Origin:** [8b-is/deepsiper-enthea](https://github.com/8b-is/deepsiper-enthea)
- **Upstream:** [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **Organization:** [8b-is](https://github.com/8b-is)

---

## 🌐 The Sovereign Constellation

- **Axiom Quant (Monograph & Proofs):** [`https://axiomquant.org`](https://axiomquant.org)
- **Classroom SOTA Training (Council of Elders):** [`https://github.com/8b-is/classroom-sota-training`](https://github.com/8b-is/classroom-sota-training)
- **Honest-IRC / EtherHive (PQC Messaging):** [`https://github.com/peterlodri-sec/etherhive`](https://github.com/peterlodri-sec/etherhive) · [`https://etherhive.vaked.dev`](https://etherhive.vaked.dev)
- **Lovetta Lane Constellation Portal:** [`https://vaked.dev`](https://vaked.dev)
- **Personal Hub:** [`https://peterl.dev`](https://peterl.dev)
- **Bluesky:** [`@0xp3t3rl.bsky.social`](https://bsky.app/profile/0xp3t3rl.bsky.social)

---

## License

[MIT](LICENSE) © 8b-is & DeepSeek AI contributors. Third-party dependency notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Genesis Seal: `7c242080f5f821e5eaf563fe2208d60632c451687baf65f4fe8e4a0d226e3ecf` · `WE. {-1, 0, +1}. <3`

