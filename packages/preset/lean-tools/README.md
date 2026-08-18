# @deepseek-ai/dsh-lean-tools

Per-agent tool restriction preset. Mounting it calls `agent.ctx.tools.restrict()`
for every agent as it is created, denying the configured heavy orchestration
tools so the assembled tool-schema footprint shrinks for ordinary sessions. The
restriction is per-agent and scoped: the denied tools vanish from that agent's
prompt AND refuse to execute, without affecting other agents or the global
registry.

## Config

```yaml
- id: lean-tools
  name: '@deepseek-ai/dsh-lean-tools'
  config:
    deny: [ralph, subagent_fork, workflow]   # default
```

| Key | Default | Meaning |
|---|---|---|
| `deny` | `['ralph', 'subagent_fork', 'workflow']` | Tool names denied for every agent. |

## Semantics

The restriction applies at `agent/created`; agents created before the preset
loads are unaffected (mount it before the agent factory). Re-allow a denied
tool for one profile by a later patch layer that overrides `deny` (or mounts a
narrower restriction) — `restrict` is additive, so `deny` a profile explicitly
wants removed stays removed unless the composition re-allows.

## Model Experience

Denied tools disappear from the model's schema list, shrinking the system
prompt's tool section; execution of a denied tool is refused with an
unknown-tool error.

## Known Limitations and Deferred Work

- **Applies to every agent** — the preset has no per-agent allowlist; use a
  scoped patch layer for per-profile tool sets.
- **Additive restriction** — a later `restrict({ allow })` does not undo an
  earlier `deny`; re-allow requires a profile that does not mount the lean
  preset.
- **Creation-time only** — agents created before load are not retroactively
  restricted.
