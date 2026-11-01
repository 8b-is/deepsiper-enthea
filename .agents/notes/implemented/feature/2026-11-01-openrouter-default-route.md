# Agent Note: OpenRouter as a default catalog route

Status: implemented

English | [中文](2026-11-01-openrouter-default-route.zh.md)

## Problem

OpenRouter was reachable only by hand-writing a `llm-pi-ai:` settings section, so a fresh install had no OpenRouter provider to select even though the installed pi-ai catalog already ships the route, its endpoint, 276 models, and the `openrouter` reasoning dialect. The fork should offer the provider without inventing a second OpenAI-compatible adapter.

## Decision

The base bundle's `llm-pi-ai` row supplies one env-gated route: `providers: !!js "(process.env.OPENROUTER_API_KEY ? { openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY' } } : {})"`.

The route states only its credential reference. The endpoint (`https://openrouter.ai/api/v1`), wire protocol (`openai-completions`), model list, and `thinkingFormat: openrouter` all come from the installed pi-ai catalog through `resolveRouteModels`.

The route is dormant when `OPENROUTER_API_KEY` is absent, so keyless profiles and CI keep the picker they had. A `llm-pi-ai:` settings section still replaces the composition base, which is the same path the web Models page writes.

`docs/backends/openrouter.md` documents the key, the explicit settings form, model selection through `agent-default-model`, and the reasoning mapping. `packages/llm/llm-pi-ai/tests/openrouter.spec.ts` pins the catalog resolution against the installed pi-ai version.

## Alternatives considered

**A dedicated `llm-openrouter` package.** Rejected: it would duplicate the OpenAI-compatible adapter for an endpoint pi-ai already catalogs, against the repository's maintained-dependency rule.

**An always-on route with an empty key.** Rejected: every keyless run would advertise 276 unreachable models in the picker and fail only at request time.

**Documentation only.** Rejected: the request was support in the product, and a hand-written settings section is the work the change should remove.

**Hardcoding the endpoint and model list in the bundle.** Rejected: the catalog already owns them, and a copied list drifts from the installed pi-ai version.

## Consequences

`OPENROUTER_API_KEY=... dsh ...` now exposes `openrouter` with no settings edit, while the same binary without the key behaves exactly as before.

Model ids are pinned to the installed pi-ai version; a slug the catalog does not know is rejected while the route resolves.

Settings written by the web Models page or by hand replace this base entirely, so a user who declares `llm-pi-ai.providers` must restate `openrouter` to keep it.
