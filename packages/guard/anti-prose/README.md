# dsh-anti-prose

English | [中文](README.zh.md)

Core anti-prose (caveman-style) response policy. A pure policy plugin: it
installs an ordered system-prompt section instructing the model to answer
terse **in English**, like a sharp engineer who drops filler, while keeping
every technical term, code symbol, command, and error string verbatim.
Adapted from the workspace's caveman skill, customized into the harness core
with an English-only rule.

## Model Experience

The model's replies are compressed at the configured intensity. It drops
articles, filler, pleasantries, and hedging; uses fragments and short
synonyms; and never narrates tool calls or dumps long error logs. Code, API
names, CLI commands, commit keywords, and exact error strings stay verbatim.
The style never gets announced or self-referenced, and full clarity returns
automatically for security warnings, irreversible-action confirmations, and
multi-step sequences where fragment order matters.

## Configuration

| Key | Default | Meaning |
|-----|---------|---------|
| `intensity` | `full` | `lite` (full sentences, keep articles), `full` (drop filler/articles, fragments), `ultra` (abbreviate prose words, arrows for causality) |
| `enabled` | `true` | `false` mounts the plugin without installing the policy section |

Mount it wherever `ctx.systemPrompt` exists (e.g. the base bundle or a
session preset):

```yaml
- from: @deepseek-ai/dsh-anti-prose
  config:
    intensity: ultra
```

## Known Limitations and Deferred Work

- Policy is prompt-only: it shapes output, never rewrites or vetoes messages.
  There is no post-hoc prose detector; enforcement is the model honoring the
  section.
- The English-only rule is fixed by design per the package contract; the
  upstream skill's preserve-user-language behavior is deliberately not ported.
- Bilingual README sync is deferred to the repository doc-sync pass.
