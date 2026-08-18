# @deepseek-ai/node-addon-hardware-info

A [Neon](https://neon-rs.dev) addon exposing [`sysinfo`](https://crates.io/crates/sysinfo) hardware
introspection to Node.js: one synchronous snapshot of system identity, CPU, and memory, delivered
from Rust across a minimal Neon boundary. Gateable to **apple-silicon (darwin-arm64)** and
**linux** hosts, with an explicit availability probe so unsupported hosts fail closed instead of
crashing at import time.

## Install

```sh
npm install @deepseek-ai/node-addon-hardware-info
```

## Usage

```js
import { hardwareInfo, probe } from '@deepseek-ai/node-addon-hardware-info';

if (probe() === 'supported') {
  const { system, cpu, memory } = hardwareInfo();
  console.log(system.name, cpu.brand, memory.totalBytes);
}
```

The public API is intentionally small:

- `probe()`: `'supported' | 'unsupported'` — whether this host loaded the native addon.
- `hardwareInfo()`: the snapshot, or `null` on unsupported hosts. Fields the platform cannot
  report (for example vendor identifiers in virtualized environments) are omitted rather than
  emitted as empty strings.

Snapshot shape:

```text
system:  { name, osVersion?, kernelVersion?, hostName?, cpuArch }
cpu:     { brand?, name?, vendorId?, logicalCores, physicalCores, frequencyMhz }
memory:  { totalBytes, availableBytes }
```

## Support

- **Supported:** darwin-arm64 (apple-silicon), linux (any arch). Building requires a Rust
  toolchain (`rustc` ≥ 1.95 for sysinfo) plus `cargo-cp-artifact` (a devDependency).
- **Unsupported:** every other platform — `probe()` reports `unsupported` and `hardwareInfo()`
  returns `null`. There is no install-time build fallback on purpose: the probe is the
  availability signal.

## Development

```sh
pnpm build          # debug build -> lib/index.node
pnpm run build:release
pnpm test           # node:test; adaptive to the host platform
```

## Model Experience

None — this is host-side introspection plumbing; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Frequency is a snapshot, not a live curve** — `frequencyMhz` reports the current operating
  frequency of the first logical CPU; per-core curves and turbo ceilings are out of scope.
- **No install-time build fallback** — a host without a prebuilt binary reports `unsupported`;
  consumers wanting cross-platform coverage must prebuild per platform (the landlock-run
  prebuilds flow is the template for that).
- **Snapshot-only API** — no incremental refreshes or subscriptions; consumers needing live
  curves should poll `hardwareInfo()` on their own cadence.