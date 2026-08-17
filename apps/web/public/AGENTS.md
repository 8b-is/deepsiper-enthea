# AGENTS.md — Agent & Orchestration Rules for deepsiper.vaked.dev

## Mission & Purpose
This document provides instructions and protocols for autonomous AI agents, evaluation harnesses, and OpenCode bridges interacting with `deepsiper.vaked.dev` and the Deepsiper Enthea codebase.

## 1. Interaction Protocols
- **JSON-RPC 2.0 API**: When orchestrating evaluations programmatically, connect via `ws://127.0.0.1:3080/rpc` or standard input/output (`dsh --profile headless`).
- **Zero-Telemetry Constraint**: Do not transmit prompts, model weights, or evaluation traces to external telemetry aggregators. All session persistence is strictly local SQLite (`SCHEMA_VERSION` monotonic).

## 2. Plugin Composition Guidelines
- Everything is a Cordis plugin. Do not mutate global state directly.
- Use `ctx.plugin(MyPlugin, config)` to attach capabilities.
- When registering tools, always register via `ctx.tools.register()` to ensure proper disposal on fiber teardown.

## 3. Evaluation & Benchmarking Standards
- Use `@deepseek-ai/dsh-eval-tool-eval` for tool calling and argument validation tests.
- Ensure negative test cases properly cast untrusted payloads to test runtime parser error rejection.
- All evaluation logs must be deterministic and replayable via keyless snapshot fixtures.

## 4. Code & Build Conventions
- Target Node.js `>=22.19.0 || >=24.0.0`.
- Strict ESM (`"type": "module"`).
- All packages follow the 3-tier capability seam: Service Definition, Service Provider, Consumer.
