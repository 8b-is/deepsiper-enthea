# @deepseek-ai/dsh-llm-osarous

OpenAI-compatible chat-completions provider adapter for the Osaurus endpoint
([https://github.com/8b-is/hf-mac](https://github.com/8b-is/hf-mac)). Registers
the `osarous` provider on the `dsh-llm` service with display name `Osarous`,
default base URL `http://127.0.0.1:1337`, and an advisory model catalog that
discovery consumers may list while requests remain unrestricted.

## Configuration

```ts
export interface Config {
  baseURL?: string                // sidecar endpoint base; default http://127.0.0.1:1337
  autoStart?: boolean             // spawn the sidecar when unreachable; default true
  defaultContextWindow?: number   // context capacity when the model has no exact value; default 262144
  models?: OsarousCatalogModel[]  // advisory catalog; default catalog in adapter.ts
  streamIdleTimeoutMs?: number    // max provider idle time while one stream read is outstanding; default five minutes
}
```

The sidecar endpoint defaults to the local default port; an omitted model
catalog advertises the local default entry, and requests remain unrestricted.

## API

- `apply(ctx, config)` — registers the `osarous` provider on the `dsh-llm`
  service under settings namespace `llm-osarous`.
- Adapter internals (`adapter.ts`, `sse.ts`, `translate.ts`, `serialize.ts`)
  implement the OpenAI-compatible request/response mapping, SSE parsing, and
  content-block translation.

## Model Experience

### Osarous request

#### What the model sees

The selected model receives the harness system prompt, message history, tool schemas, stop sequences, and call config translated to an OpenAI-compatible `/chat/completions` body without adapter-authored prompt prose. User and tool-result content flatten to text blocks; core image content is rejected before flattening can erase it.

#### Token effect

Provider tokenization governs exact input. Reasoning/content passback follows the OpenAI-compatible response shape (see Osarous response).

#### KV Cache effect

An unchanged assembled prefix is eligible for endpoint-side cache reuse; changing the provider route, model, or any prompt/schema/history token may prevent reuse from the first changed token.

### Osarous response

#### What the model sees

Reasoning, text, and tool-call fragments from the SSE stream are translated into harness chunks for the loop to log and assemble.

#### Token effect

Generated tokens follow the request's logged reasoning effort and `maxTokens`; only loop-retained blocks affect later input.

#### KV Cache effect

Loop-retained response blocks append to the next request and preserve its earlier reusable prefix; dropped blocks have no later cache effect.

## Known Limitations and Deferred Work

- **`tool_choice` is not mapped** — not part of the core vocabulary (MVP cut,
  shared with the pi-ai twin).
- **Requests use raw `fetch`, not `@cordisjs/plugin-http`** — no shared
  proxy/interception configuration; adoption is deferred until a second
  adapter wants it.
- **Serialization flattens user and tool-result content to text blocks** —
  plugin-added block types are skipped, and empty tool output crosses the wire
  as the literal `(no output)`.
- **The advisory `models` catalog is not authoritative** — the endpoint accepts
  any model id; the list only feeds discovery consumers.
