# @deepseek-ai/dsh-client-connection

English | [中文](README.zh.md)

Browser transport and Host HTTP bridge. `ctx.connection` provides the API client, truthful page-hostname `isLoopback` state, generation-scoped `access` and `hostDescription` observables, and a single-consumer stream-loop starter. HTTP POST carries unary requests and replies; separate downlink-only WebSockets carry session and Host events. The Host owns `/api`, authorizes requests before shared RPC interceptors, then dispatches unclaimed methods to API Proxy.

## Browser trust and configuration access

Every `/api` request and WebSocket upgrade passes the [Host/Origin fence](src/api-request-trust.ts). `Host` must be loopback or match `trustedHosts`: explicit ports match exactly; port-less entries accept any port. Attached `Origin` must match the Host authority, and cross-site Fetch Metadata is refused. Canonically malformed configured authorities fail activation. Unmarked requests receive no exemption, because browser reads over plain HTTP can omit both Origin and Fetch Metadata. Denials return HTTP 403 before dispatch.

`trustedHosts` protects against DNS rebinding; it is not authentication. Configuration reads and writes, credential management, model discovery, and preset authoring default to loopback-only. Ordinary model catalog and preset roster/selection calls remain available to trusted authorities. Native desktop operations (`host.pickDirectory`, `host.openPath`, `settings.openDocument`, `agentPreset.openDocument`) always remain loopback-only.

## Authenticated reverse proxy

A deployment may explicitly grant administrator configuration access through a separately authenticated HTTPS reverse proxy. The upstream must bind to `127.0.0.1`. Configure the Connection row, retaining its serving authorities:

```yaml
- id: connection
  config:
    trustedHosts: ['harness.example']
    authenticatedProxy:
      origin: https://harness.example
      tokenFile: /private/path/proxy.token
```

The private file contains 32 random bytes encoded as 64 lowercase hexadecimal characters, optionally followed by one newline. Both the harness and proxy accounts need read access; no other account should. Connection reads it at activation, so token rotation requires coordinated reloads. Missing or malformed files fail activation without displaying their contents.

The proxy must authenticate every externally accessible application route, including APIs and WebSockets, then **replace** the `X-DSH-Authenticated-Proxy` upstream header with the file contents. Never let a browser choose or receive this value. For Caddy, retain authentication before `reverse_proxy` and use `header_up X-DSH-Authenticated-Proxy {file./private/path/proxy.token}`. Preserve browser Origin and Fetch Metadata instead of manufacturing trusted headers.

Proxy authorization requires the real socket peer to be loopback, an exact public Host match, a constant-time secret match, and the configured HTTPS Origin. An originless GET additionally requires `Sec-Fetch-Site: same-origin`; originless writes are rejected. The existing browser-trust fence still applies. The proof header is removed before RPC dispatch. This grants trusted administrator access to settings, credentials, model discovery, and preset management; it does not create per-user isolation or grant native desktop access.

`GET /api/access` returns only request-derived `{ settings, native }` booleans with `Cache-Control: no-store`. Browser scopes wait for a settings grant before host persistence, reload host state when granted, and suppress new writes and stale response publication after revocation. Temporary preferences are not automatically copied to the host. See the [proxy authorization decision](../../../.agents/notes/implemented/architecture/2026-11-01-authenticated-proxy-settings.md).

## WebSocket downlinks

`/api/events.mux` and `/api/events.host` accept WebSocket upgrades and send their corresponding `ServerRequest` messages; browsers send no application data on these sockets. Readiness requires both streams, `host.describe`, and access discovery. Access and description publish before connected callbacks and clear on generation loss or stop. If either stream ends, both reconnect. Teardown terminates sockets, aborts sources, and waits for cleanup. Ordinary GETs to these stream paths return 426; the API Proxy SSE codec serves only the in-process carrier.

## Model Experience

None, as this package transports already-composed messages without adding model-visible content.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **No built-in remote login or user isolation.** The proxy owns authentication and must protect every public route. The shared proof identifies a trusted proxy, not an individual user.
- **History resumes an unattached session.** Opening history can create its host-side agent and add latency; there is no persistence-only read path.
- **Request bodies are buffered.** `maxRequestBodyBytes` defaults to 160 MiB, covering the default 100 MiB image allowance after base64 expansion and envelope overhead. Reducing resident memory without reducing the image allowance requires streaming bodies.
