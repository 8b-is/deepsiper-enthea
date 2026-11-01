# Agent Note: Authenticated proxies prove configuration access per request

Status: implemented

English | [中文](2026-11-01-authenticated-proxy-settings.zh.md)

## Problem

A browser behind an authenticated public reverse proxy has a non-loopback hostname. Restricting every settings request and preference store by that hostname prevents legitimate configuration, while treating a trusted hostname as authentication would expose settings to unauthenticated deployments.

## Decision

[Connection](../../../../packages/client/connection/README.md) accepts an explicit authenticated-proxy configuration: one canonical HTTPS origin and a private token file. The upstream binds only to loopback. A proxy that authenticates all public routes replaces an internal proof header; Connection verifies the real peer, authority, browser provenance, and secret before dispatching administrator operations. The proof is stripped before RPC consumers receive requests. Native desktop operations remain loopback-only.

The [browser-trust decision](2026-07-28-api-browser-trust-boundary.md) remains active: its Host/Origin and media-type checks protect all requests independently of authentication. This note supplies the separate proxy-authentication mechanism; it does not broaden `trustedHosts` into an authorization list.

The browser reads request-derived permissions from a noncacheable Connection endpoint. Permissions belong to a connection generation, not a static boot flag. Settings stores await a grant, load authoritative host values when granted, and discard stale publications after revocation. In-memory preferences are never silently migrated to persistent configuration.

## Alternatives considered

**Authorize every `trustedHosts` entry.** Rejected because the list exists for DNS-rebinding defense and includes deployments without authentication.

**Rewrite public Host and Origin to localhost.** Rejected because it destroys the browser-origin evidence and falsely grants desktop access.

**Trust a proxy header without a secret or loopback peer.** Rejected because an externally supplied header would manufacture administrator access.

**Add user login and accounts inside Connection.** Deferred because the existing proxy owns authentication; this capability grants a trusted administrator connection, not multi-user isolation.

## Consequences

The proxy must authenticate the complete application, replace the internal header, preserve browser provenance, and keep the token private. Rotation requires coordinated reloads and fails closed during disagreement. Credentials and model discovery are administrator capabilities, including host-side endpoint probing. Host tests verify denial paths and authorization before shared interceptors; browser lifecycle tests cover grants, revocation, and late responses. The mechanism does not identify individual users or sandbox their tools.
