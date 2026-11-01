# Agent Note: Host-owned saved MCP connections

Status: implemented

English | [中文](2026-11-01-host-mcp-settings.zh.md)

## Problem

Browser configuration must manage MCP servers on the DSH Host, not the browser's machine or a new process for every session. Persisted credentials need redaction, and editing a local memory server must not create overlapping writers. A connection test must not invoke arbitrary tools.

## Decision

The opt-in `@deepseek-ai/dsh-mcp-client/settings` entry provides one Host `mcpServers` service and the `mcp-servers` settings namespace. Saved entries are disabled by default. The manager uses the existing [MCP bridge](../feature/2026-07-07-mcp-client-plugin.md) and [reconnection supervisor](../feature/2026-08-06-mcp-client-auto-reconnect.md), retaining their namespace and tool execution rules.

Changes serialize per server. Replacement waits for confirmed transport shutdown; incomplete shutdown retains the name reservation and refuses another writer. Unrelated servers keep their connections. Discovery tests reuse an existing connection or open a temporary client, read all tool-list pages under a deadline, and close without invoking tools. API diagnostics expose names, states, counts, and value-free errors, not saved secrets or raw server failures.

Settings use flat transport fields so the existing structural redactor reaches environment values and HTTP headers even while that transport is inactive. Runtime configuration selects only the active transport. Administrator API authorization follows the [Connection proxy decision](2026-11-01-authenticated-proxy-settings.md).

An explicit Smart Tree memory policy targets only its raw `memory` tool. `off` hides it; `read-only` advertises and independently enforces exactly `operation: find`; `read-write` allows the server's advertised operations. Omitting this policy preserves generic MCP behavior. This policy is not a sandbox for other Smart Tree tools. Recall can update server access metadata, and connecting does not automatically save chat messages.

## Alternatives considered

**One memory process per session.** Rejected because shared durable files may lack multi-writer coordination.

**Restrict only the advertised tool schema.** Rejected because executor authorization must also reject forged or stale calls.

**Put credentials into transport-specific schema unions.** Rejected because settings redaction does not traverse those union alternatives.

**Install a memory provider or advertise MEM16 automatically.** Rejected because configuration must not download software or imply a working protocol adapter that does not exist.

## Consequences

The manager is an optional Host composition entry, not a default third-party connection or browser-side process. Operators choose executables, endpoints, credentials, and storage placement. Existing MCP and reconnection notes remain active because their protocol and recovery decisions are unchanged. A future browser editor can use the settings namespace and discovery API without owning connection lifetimes.
