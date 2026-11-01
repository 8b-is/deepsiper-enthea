# Agent Note: OpenRouter as a default catalog route

Status: implemented

[English](2026-11-01-openrouter-default-route.md) | 中文

## Problem

OpenRouter 之前只能通过手写 `llm-pi-ai:` 设置节才能使用，因此全新安装没有可选的 OpenRouter provider，尽管已安装的 pi-ai 目录已经提供该路由、其端点、276 个模型以及 `openrouter` 推理方言。该 fork 应当提供这个 provider，而不是再发明一个 OpenAI 兼容适配器。

## Decision

基础 bundle 的 `llm-pi-ai` 行提供一个受环境变量控制的路由：`providers: !!js "(process.env.OPENROUTER_API_KEY ? { openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY' } } : {})"`。

该路由只声明凭据引用。端点（`https://openrouter.ai/api/v1`）、线协议（`openai-completions`）、模型列表与 `thinkingFormat: openrouter` 都通过 `resolveRouteModels` 来自已安装的 pi-ai 目录。

当 `OPENROUTER_API_KEY` 缺失时路由保持休眠，因此无密钥的 profile 与 CI 保持原有的选择器。`llm-pi-ai:` 设置节仍会替换组合基础层，这与 Web Models 页面写入的路径相同。

`docs/backends/openrouter.md` 记录了密钥、显式设置形式、通过 `agent-default-model` 选择模型，以及推理映射。`packages/llm/llm-pi-ai/tests/openrouter.spec.ts` 针对已安装的 pi-ai 版本固定了目录解析。

## Alternatives considered

**独立的 `llm-openrouter` 包。** 否决：它会为 pi-ai 已编目的端点复制 OpenAI 兼容适配器，违背仓库的维护依赖规则。

**带空密钥的常驻路由。** 否决：每次无密钥运行都会在选择器中展示 276 个不可达模型，且只在请求时才失败。

**仅文档。** 否决：请求的是产品中的支持，而手写设置节正是本变更应消除的工作。

**在 bundle 中硬编码端点与模型列表。** 否决：目录已经拥有它们，复制列表会与已安装的 pi-ai 版本漂移。

## Consequences

`OPENROUTER_API_KEY=... dsh ...` 现在无需编辑设置即可暴露 `openrouter`，而没有该密钥的同一二进制行为与之前完全一致。

模型 id 绑定到已安装的 pi-ai 版本；目录不认识的 slug 会在路由解析时被拒绝。

由 Web Models 页面或手写产生的设置会完全替换该基础层，因此声明 `llm-pi-ai.providers` 的用户必须重新声明 `openrouter` 才能保留它。
