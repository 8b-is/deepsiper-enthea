# Agent Note: OpenCode owns ChatGPT login for local Deepsiper launches

Status: implemented

English | [中文](2026-11-01-opencode-chatgpt-launcher.zh.md)

## Problem

A local Deepsiper deployment needs to use the user's active OpenCode ChatGPT connection. Copying refresh credentials creates another owner of the login lifecycle, while a model absent from the installed catalog still needs explicit model metadata.

## Decision

The [opt-in launcher](../../../../scripts/opencode-local.ts) reads the active OpenAI OAuth credential through OpenCode V2's authenticated CLI and supplies only its access token to the built harness's environment. It refuses ambiguous or unusable credentials and bounds the child lifetime by token expiry. OpenCode remains the sole login and refresh owner.

The [overlay](../../../../examples/openai-opencode/cordis.patch.yml) declares GPT-6 Astra through pi-ai's installed `openai-codex` provider and selects it for fresh sessions. This uses the existing [declared-provider catalog](../architecture/2026-08-03-pi-ai-declared-provider-catalog.md) and [launch-environment credential rules](../architecture/2026-07-30-credential-boundaries-and-atomic-registration.md); neither decision is superseded.

Model requests use SSE. pi-ai's cached model WebSocket can keep a completed headless process alive, whereas request-scoped SSE permits clean teardown. Browser event streams retain their own WebSocket transport.

## Alternatives considered

- **Copy the refresh token and refresh inside Deepsiper.** Rejected because two applications would own credential rotation and persistence for one login.
- **Read OpenCode's database directly.** Rejected because the authenticated V2 API already exposes credentials without coupling the launcher to private storage formats.
- **Keep the model WebSocket transport.** Rejected because a completed headless request must release the process without forced termination.

## Consequences

The harness and tools run locally, while model inference is hosted. The launcher writes no OAuth credential file and introduces no refresh-token store. A running process does not adopt later credential changes; expiry interrupts it, and restart requires a usable token already present in OpenCode. Independent browser authentication belongs to the deployment gateway.

[Credential tests](../../../../scripts/opencode-local.spec.ts) cover selection and secret-free failures. [Lifecycle tests](../../../../scripts/opencode-local-launch.spec.ts) cover access-token forwarding, cancellation, and expiry even when the child exits zero. The [built example](../../../../examples/openai-opencode/tests/built-smoke.e2e.ts) snapshots the keyless catalog and verifies live tool execution against filesystem bytes when explicitly enabled. Automatic credential refresh and mid-process rotation are unsupported.
