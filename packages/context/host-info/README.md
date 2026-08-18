# @deepseek-ai/dsh-host-info

Model-facing host hardware context contributed from the Neon sysinfo addon
(`@deepseek-ai/node-addon-hardware-info`). Mounting it adds one ordered
runtime-context block naming the host's operating system, CPU, and memory so
the model can reason about platform-constrained work without asking. On hosts
where the native addon is unsupported (or its binary is absent), the plugin
renders nothing — the same composition stays mounted across the whole fleet.

## Config

No configuration. The addon's own `probe()` gates availability at render time;
a deployment that must not expose host details simply omits this plugin from
its composition.

## Contribution

The plugin registers one dynamic context named `host:info` at order `5` —
immediately after the deployment persona, before tool guidance. Its text is
re-evaluated at each assembly (once per model request), so available memory
stays current. The assembled runtime-context snapshot is projected as a durable
`user/message` whenever its joined text changes, satisfying the harness's
model-visible-to-logged contract; the snapshot's source carries each named
contribution, including the `host:info` section.

The `./invariant` companion validates that every durable runtime snapshot
contains at most one `host:info` section and that its text matches the pinned
format.

## Model Experience

### Host hardware context

#### What the model sees

```markdown
Host hardware:
- System: <name>[ (<osVersion>)][, kernel <kernelVersion>][, <cpuArch>]
- CPU: <brand>[, <logicalCores> logical / <physicalCores> physical cores][, @ <frequencyMhz> MHz]
- Memory: <total> total, <available> available
```

Fields the platform cannot report are dropped rather than emitted empty;
`frequencyMhz` is omitted at `0` (unavailable). Byte counts use one-decimal GiB,
whole MiB, or raw bytes.

#### Token effect

One block per request while the addon is supported; no context on unsupported
hosts. The block is a small, stable prefix contribution — it grows the reusable
prompt prefix rather than per-turn history.

#### KV Cache effect

Static within a request and append-only across requests; the block does not
invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Snapshot, not a live curve** — CPU frequency and available memory are
  sampled once per assembly (per request); there is no subscription or
  per-core detail.
- **Gated by the addon binary** — a host whose `lib/index.node` is missing or
  unbuilt reports `unsupported` and contributes nothing; there is no install-time
  build fallback.
- **macOS model quirks surface** — `sysinfo` reports `cpu.name` as a per-core
  index on macOS; the block intentionally omits it and renders the processor
  `brand` instead.
- **Private package** — the addon dependency is workspace-private until a
  native release sequence publishes it; consuming the block requires the
  workspace (or a future published tarball).
