# dsh-nu-sandbox

English | [中文](README.zh.md)

Sandbox-consuming implementation of the nushell executor seam. Extends
`LocalNuExecutor`, wrapping the exact resolved nushell argv
(`<nuPath> --no-config-file -c <command>`) through `ctx.sandbox`, so the
sandbox runner confines the same deterministic Nix store-path binary
`nu-local` resolves.

## Model Experience

Each command runs confined by the calling session's policy. A blocked file
operation is reported as `[sandbox: file access denied under <mode> mode]` —
a policy denial, not a command bug. Runner failures (the sandbox itself
failing to launch) surface as `SANDBOX_UNAVAILABLE` for foreground calls and
`runnerFailed` facts on background processes. `result.sandbox` reports the
mode, enforcement, and denial facts actually applied.

## Configuration

Same config as `nu-local` (inherited verbatim). The sandbox default mode and
workspace root live on `ctx.sandboxPolicy`, not here.

## Known Limitations and Deferred Work

- `start()` inherits `nu-local`'s resolution-warmup constraint.
- Real-provider integration (Landlock/Seatbelt) follows the bash lane's e2e
  pattern and is not yet written for this package.
- Bilingual README sync is deferred to the repository doc-sync pass.
