# dsh-nu-local

English | [中文](README.zh.md)

Local nushell executor for the `ctx.shell` capability seam, provisioned from a
**Nix store path** for deterministic execution.

## Model Experience

Commands run as `nu --no-config-file -c <command>` in a managed process group
through `ctx.subprocess`. Every host runs the identical nushell from the same
nixpkgs pin: the binary is resolved once per process via
`nix build --no-link <flake>#nushell` and cached as a content-addressed store
path, so there is no per-command Nix overhead. `nuBin` overrides the
resolution with an explicit path.

The model sees stdout, a marked `[stderr]` section, truncation notices with
the full-output spill path, and exit-status markers (`[exit code: N]`,
`[killed by signal: <signal>]`, `[timed out after <ms>]`).

## Configuration

| Key | Default | Meaning |
|-----|---------|---------|
| `cwd` | `process.cwd()` | Default working directory |
| `timeoutMs` | `120_000` | Foreground timeout |
| `maxTimeoutMs` | `600_000` | Upper bound for per-call timeouts |
| `maxOutputBytes` | `64_000` | Per-stream in-memory cap (overflow spills) |
| `maxSpillBytes` | `64 MiB` | Spill-file cap |
| `graceMs` | `3_000` | SIGTERM→SIGKILL grace |
| `nuBin` | — | Explicit nushell path; bypasses Nix resolution |
| `nixpkgsFlake` | `nixpkgs` | Flake ref whose `#nushell` is built |
| `nixBinary` | `nix` | The `nix` executable |

## Known Limitations and Deferred Work

- `start()` (background) requires the nushell path to be resolved first — a
  foreground `run()` (or `ensureNu()`) warms the cache. This is documented in
  the throw message and enforced at the executor boundary.
- Nix resolution is network/registry dependent on first use; `nuBin` is the
  offline escape hatch.
- Bilingual README sync (`README.zh.md` / `README.i18n.yaml`) is deferred to
  the repository doc-sync pass.
