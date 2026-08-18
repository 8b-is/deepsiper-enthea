# @deepseek-ai/dsh-tool-everos

Model-facing memory tools over a local [EverOS](https://github.com/EverMind-AI/EverOS) server (md-first memory extraction: Markdown truth + SQLite state + LanceDB indexes). Registers `everos_memory_add`, `everos_memory_flush`, and `everos_memory_search`, which store conversation messages in the server's session buffer, force boundary extraction for a session, and retrieve episodes, profiles, agent cases, and agent skills. The server runs out-of-process and speaks the EverOS `/api/v2` dialect; this plugin owns only the model-facing tools, the wire client, and the deployment configuration.

## Configuration

```ts
export interface Config {
  baseURL: string    // EverOS server base URL, e.g. http://127.0.0.1:8000 (required)
  appId?: string     // default app scope, "default"
  projectId?: string // default project scope, "default"
  timeoutMs?: number // per-request timeout, 15000
}
```

Example:

```yaml
- insert:
    - id: tool-everos
      name: '@deepseek-ai/dsh-tool-everos'
      config:
        baseURL: http://127.0.0.1:8000
        appId: default
        projectId: default
```

## Model Experience

### everos_memory_add tool schema

#### What the model sees

The model sees the generated [`everos_memory_add` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-everos): `session_id`, the `messages` array (1..500 messages with `sender_id`, `role`, epoch-milliseconds `timestamp`, and string or multimodal `content`), optional `app_id` / `project_id` overrides, and `defer_extraction`. The description explains the accumulate-then-extract model and when to call `everos_memory_flush`.

#### Token effect

Fixed schema cost on every request where the tool is visible. The `messages` array is bounded at 500 entries; no result content is echoed back beyond the message count and status.

#### KV Cache effect

Prefix-stable while the definition is unchanged; deployment config (default app/project scope, timeout) does not change the schema.

### everos_memory_flush tool schema

#### What the model sees

The model sees the generated [`everos_memory_flush` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-everos): `session_id` with optional scope overrides. The description directs the model to flush at natural conversation ends so content becomes searchable; the result is the fixed shape `{ request_id, status }` with `status` `extracted` or `no_extraction`.

#### Token effect

Fixed schema cost; result is two short fields.

#### KV Cache effect

Prefix-stable while the definition is unchanged.

### everos_memory_search tool schema

#### What the model sees

The model sees the generated [`everos_memory_search` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-everos): exactly one of `user_id` (episodes, profiles) or `agent_id` (cases, skills), `query`, `method` (`keyword` | `vector` | `hybrid` | `agentic`), `top_k`, `radius`, `min_score`, `include_profile`, `enable_llm_rerank`, an `filters` DSL object, and optional scope overrides. The result carries the typed hit arrays; the rendered summary lists up to 10 hits with scores.

#### Token effect

Fixed schema cost; result size scales with the number of returned hits (bounded by `top_k`, which the server caps at 100).

#### KV Cache effect

Prefix-stable while the definition is unchanged.

### Stored memory and search outcome

#### What the model sees

Stored messages become searchable episodes and agent cases/skills only after boundary extraction (automatic or via flush); `everos_memory_search` returns what the server extracted, including `unprocessed_messages` for in-flight buffers when filtered by session.

#### Token effect

Search results carry summaries verbatim from the server; the rendered text is capped at 10 hit lines plus a remainder count.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Requires a reachable EverOS server** — the tools fail loud with the HTTP status at the first call when `baseURL` is unreachable or not an EverOS server; provisioning and supervising the server (including its optional OpenRouter key for LLM-assisted extraction and rerank) are outside this package.
- **No wiki tooling** — EverOS knowledge-wiki CRUD and topic search are not exposed; only the three memory endpoints are wired.
- **Keyless Tier-1 only** — `keyword` search and buffer operations work without server credentials; `vector` and `hybrid` need the server's own embedding configuration, and `enable_llm_rerank` needs its LLM configuration.
- **Plain-fetch transport** — no retries, backoff, or connection pooling beyond the single request timeout; long extraction runs on `flush` surface only as a timeout error.