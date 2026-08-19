# dsh-tool-nu

English | [中文](README.zh.md)

Model-facing nushell Consumer of the `ctx.shell` capability seam. Foreground
and `run_in_background` execution, the managed `DSH_*` environment through the
shared `shell-env` registry, per-call sandbox policy resolution with the
same-turn escalation surface (`sandbox_permissions` + `justification` through
`ctx.approval`), and the bash/pwsh marker-truncation rendering story.

## Model Experience

The tool runs `nu --no-config-file -c <command>` through `ctx.shell`. Read
environment variables with `$env.NAME`; use nushell pipelines (`|`) and
built-in commands (`ls`, `open`, `get`). Non-zero exits are reported as
`[exit code: N]`, not errored. A killed process settles as
`[killed by signal: <signal>]`. Long output is truncated to its tail with the
full-output spill path reported. Under a confining executor, a blocked file
operation is a `[sandbox: file access denied under <mode> mode]` denial —
escalate the exact command once with `sandbox_permissions` when a wider mode
would let it succeed.

## Configuration

| Key | Default | Meaning |
|-----|---------|---------|
| `enableRunInBackground` | `true` | Expose `run_in_background` (disabled calls are also rejected) |

## Known Limitations and Deferred Work

- Background jobs require `@deepseek-ai/dsh-jobs` + `@deepseek-ai/dsh-tool-jobs`
  mounted; otherwise `run_in_background` fails loud.
- The sandbox escalation note is intentionally nushell-agnostic (no
  platform-specific confinement clauses, unlike the pwsh tool's Windows
  contract).
- Bilingual README sync is deferred to the repository doc-sync pass.
