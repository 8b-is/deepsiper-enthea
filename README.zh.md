# Deepsiper Enthea

[![Version](https://img.shields.io/badge/version-0.1.0--rc.7-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Org](https://img.shields.io/badge/org-8b--is-purple.svg)](https://github.com/8b-is)
[![Upstream](https://img.shields.io/badge/upstream-deepseek--harness-lightgrey.svg)](https://github.com/deepseek-ai/deepseek-harness)

<p align="center">
  <img src="assets/hero-deepsiper-enthea.jpg" alt="Deepsiper Enthea — 主权 LLM 评估 Harness" width="100%">
</p>

[English](README.md) | 中文

**Deepsiper Enthea** (`deepsiper-enthea`) 是一个基于 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) (`dsh` 0.1.0-rc.7) 分叉的主权、智能体驱动型 LLM 评估 Harness。它为现代大语言模型评测工作流提供了多模型编排、私有主权后端集成、Cordis 插件管道与 JSON-RPC 自动化支持。

---

## Fork 核心特性

- **主权后端**: 原生集成 [EntheAI](https://github.com/8b-is) 与自托管推理节点，保障数据完全驻留与零泄漏。
- **评测插件系统**: 可插拔的评测套件，支持 `tool-eval`、`eval-entheai` 以及自定义基准评测。
- **OpenCode 桥接与 JSON-RPC SDK**: 支持通过 OpenCode 或外部编排系统以编程式驱动评测与智能体循环。
- **多模型统一编排**: 统一支持 DeepSeek、Gemini、本地部署模型及任意 OpenAI 兼容接口。
- **细粒度沙箱与遥测**: 原生 Landlock 隔离机制、确定性重放与结构化会话持久化。

---

## 架构与技术栈

Deepsiper Enthea 核心遵循 **一切皆插件** 的 [Cordis](https://github.com/cordiverse/cordis) 架构。

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
        │     主权后端       │ │   评测插件   │ │    沙箱工具隔离    │
        │  (EntheAI / Local) │ │ (tool-eval) │ │ (Landlock / Bash)   │
        └────────────────────┘ └─────────────┘ └─────────────────────┘
```

- **运行时与语言:** Node.js `>=22.19.0` 或 `>=24.0.0`, TypeScript 6 (严格 ESM 模式)
- **打包与构建:** `tsdown` / `rolldown` + `tsc` 工程引用
- **测试与代码质量:** Vitest 4, Oxlint, JSCPD 重复检测
- **插件内核:** 内置 Cordis 框架（时空可组合性范式）

---

## 快速上手

### 环境准备
- Node.js `^22.19.0 || >=24.0.0`
- `pnpm >= 11.0.0`

### 安装与构建

```sh
# 克隆仓库
git clone https://github.com/8b-is/deepsiper-enthea.git
cd deepsiper-enthea

# 安装依赖并构建
pnpm install
pnpm build
```

### 运行任务

```sh
# 无头模式下执行任务
pnpm dsh --profile headless "分析仓库安全态势并评估工具覆盖度"

# 启动交互式 Web 控制台与面板
pnpm dsh web
```

---

## 文档

- [快速入门](docs/getting-started.md)
- [架构与插件体系](docs/architecture.md)
- [开发自定义插件](docs/plugins/writing-plugins.md)
- [JSON-RPC SDK](docs/sdk/json-rpc.md)
- [主权后端设置 (EntheAI)](docs/backends/entheai.md)
- [设计系统规范](docs/design-system.md)

---

## 社区与生态

- **Fork 地址:** [8b-is/deepsiper-enthea](https://github.com/8b-is/deepsiper-enthea)
- **上游仓库:** [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **组织:** [8b-is](https://github.com/8b-is)

---

## 🌐 主权星系 (The Sovereign Constellation)

- **Axiom Quant (数学专著与证明):** [`https://axiomquant.org`](https://axiomquant.org)
- **Classroom SOTA Training (长者议会蒸馏):** [`https://github.com/8b-is/classroom-sota-training`](https://github.com/8b-is/classroom-sota-training)
- **Honest-IRC / EtherHive (后量子密码去中心化通信):** [`https://github.com/peterlodri-sec/etherhive`](https://github.com/peterlodri-sec/etherhive) · [`https://etherhive.vaked.dev`](https://etherhive.vaked.dev)
- **Lovetta Lane 主权星系总入口:** [`https://vaked.dev`](https://vaked.dev)
- **个人主页:** [`https://peterl.dev`](https://peterl.dev)
- **Bluesky:** [`@0xp3t3rl.bsky.social`](https://bsky.app/profile/0xp3t3rl.bsky.social)

---

## 许可证

[MIT](LICENSE) © 8b-is & DeepSeek AI 贡献者。第三方依赖许可说明参见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

Genesis Seal: `7c242080f5f821e5eaf563fe2208d60632c451687baf65f4fe8e4a0d226e3ecf` · `WE. {-1, 0, +1}. <3`

