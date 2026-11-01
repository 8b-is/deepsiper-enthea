# Osaurus Backend (hf-mac)

[`@deepseek-ai/dsh-llm-osarous`](../../packages/llm/llm-osarous/README.md) is the provider seam between Deepsiper Enthea and [hf-mac](https://github.com/8b-is/hf-mac). hf-mac owns the weights, the MLX runtime, and the local HTTP server; the harness owns the agent loop, tools, and the session log. The split is deliberate: the native macOS app stays a thin front-end, and the harness never embeds a model runtime.

## Topology

```
hf-mac (SwiftUI, macOS)  →  Osaurus MLX server  →  http://127.0.0.1:1337
                                                        │
                                        llm-osarous provider seam
                                                        │
                                        Deepsiper Enthea agent loop
```

Osaurus speaks the OpenAI-compatible `/v1/chat/completions` surface, so the adapter maps harness requests to that wire format and translates SSE chunks back into harness content blocks.

## Configuration

```yaml
plugins:
  "@deepseek-ai/dsh-llm-osarous":
    baseURL: "http://127.0.0.1:1337"
    autoStart: true
    defaultContextWindow: 262144
    streamIdleTimeoutMs: 300000
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `http://127.0.0.1:1337` | Osaurus sidecar endpoint |
| `autoStart` | `true` | Spawn `osaurus serve` when the endpoint is unreachable |
| `defaultContextWindow` | `262144` | Context capacity when a model advertises none |
| `models` | local catalog | Advisory model list for discovery consumers |
| `streamIdleTimeoutMs` | `300000` | Maximum provider idle time during one stream read |

Requests are not restricted to the advisory catalog; the endpoint accepts any model id it serves. Settings for this provider live under the `llm-osarous` namespace.

## Run end to end

1. Install and launch [hf.app](https://hf.8b.is/) and start Osaurus on `localhost:1337`.
2. Pull a model in Osaurus and confirm it appears in hf.app's **Run** tab.
3. Start a harness session with the provider selected:

```sh
pnpm dsh --profile headless --provider osarous "list the files in this repo"
```

`autoStart: true` is enough when the `osaurus` binary is on `PATH`; otherwise start the sidecar yourself and leave `autoStart` off.

## Known limitations

- `tool_choice` is not mapped.
- Requests use raw `fetch`, not `@cordisjs/plugin-http`.
- User and tool-result content flatten to text blocks; empty tool output crosses the wire as `(no output)`.
- The advisory `models` catalog is not authoritative.
