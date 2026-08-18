# Agent Note: `appendSystemPrompt` deployment tail + identity fine-tune

Status: implemented

English | [中文](2026-08-18-append-system-prompt-tail.zh.md)

## Problem

Operators had no way to append guidance to the END of the system prompt
without writing a plugin: the deployment persona sits at order `0` and tool
guidance owns `100–199`, so "add one more instruction the model should weigh
last" meant registering a custom section. [Voyager](https://github.com/Nagi-ovo/voyager)
solves the same need for Gemini/Claude/ChatGPT by injecting saved prompts into
the input box from a browser extension. The harness wanted that capability
in-process: a way to append a saved prompt directly into the system prompt
instead of relying on an extension or a plugin.

## Decision

**`system-prompt` gains a `Config.appendSystemPrompt` string.** When set and
non-empty, the registry registers an `deployment:append` section at order
`1000` — after every tool-guidance band — with that exact text, interpolated
strictly like any other section (`{{variable}}` references apply). Empty or
omitted registers nothing. The section is static and model-visible, so it is
reconstructable from the existing durable `request/header.system` snapshot; no
new session event.

**The harness identity text was fine-tuned.** `harness:identity` is now
"You are an AI agent powered by DeepSeek Harness, an extensible
plugin-based agent runtime." — adding the plugin-based runtime fact the
harness's own docs already state, without behavioural claims that would
overlap the persona or tool guidance.

**The Voyager reference is the mechanism, not the surface.** Voyager injects
prompts into the user input from a vault; the harness's config-driven
registry is the equivalent "saved prompt" slot, and appending to the system
prompt is the deployment-side form of the same idea. A per-session prompt
vault with a UI is deferred (see consequences).

## Alternatives considered

**Expose `append-system-prompt` only as a CLI flag / web setting.** Rejected
for this change: the registry is the single composition surface, and a
config string is the smallest form that reaches every deployment mode
(cordis.yml, preset, bundle) without a new transport or persistence path.

**Ship a browser-extension-style prompt vault.** Rejected: a vault needs
per-session state, storage, and UI, none of which a system-prompt section
requires; the deployment tail is the correct first cut, and a vault would
duplicate settings/storage machinery.

**Change the identity to a longer persona-style block.** Rejected: identity
stays one factual line; behaviour lives in persona and tool guidance, and
longer identity text would drift into another section's ownership.

## Consequences

Deployments can now append tail guidance via `appendSystemPrompt` with no
plugin and no extension; it renders last, after tool guidance, and is logged
in the durable header. The identity line is slightly longer and now states
the runtime's plugin architecture; every pinned snapshot and unit-test
constant was updated in the same change. A per-session prompt vault (Voyager
Prompt Manager equivalent) with storage and UI remains a future surface and
is explicitly out of scope for this note.
