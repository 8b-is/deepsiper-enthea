# @deepseek-ai/dsh-skill-crabcc

Integrates the [crabcc](https://github.com/8b-is/crabcc) code index CLI into the
harness as three agent tools plus a bundled skill:

| Tool | crabcc command | Purpose |
|------|----------------|---------|
| `code_search` | `lookup fuzzy` | Fuzzy symbol lookup with optional reference counts |
| `goto_definition` | `lookup sym` | Locate a symbol's definition (file, line, signature) |
| `find_references` | `lookup refs` | All usages of a symbol with line/column and snippet |

The bundled `crabcc` skill teaches the model when and how to use the three
tools for code navigation.

## Installation

```bash
pnpm add @deepseek-ai/dsh-skill-crabcc
```

Requires the `crabcc` binary (6.x) on `PATH` and an indexed repository
(`crabcc index`). The plugin declares `inject = ['skills']` and registers its
three tools through the tool runtime when one is present.

## Configuration

```ts
export interface Config {
  crabccBin?: string    // default: 'crabcc'
  defaultRoot?: string  // default: process.cwd()
  providerName?: string // default: 'crabcc'
}
```

Each tool also accepts a per-call `root` override; queries default to
`defaultRoot`.

## API

- `apply(ctx, config)` — registers the tools and the `crabcc` skill provider.
- `runCrabcc(bin, args, options)` — spawns crabcc and JSON-parses stdout
  (`options.text` returns raw text for `--version`-style probes).
- `isCrabccAvailable(bin, root)` — availability probe.

## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated schemas for [`code_search`, `goto_definition`, and `find_references`](../../../docs/tool-catalog.md#deepseek-aidsh-skill-crabcc). `code_search` takes `query`, `limit`, `includeRefs`, and `root`; the other two take a symbol name plus optional `limit`/`root`. Results are the crabcc wire fields (`line_start` maps to `line`, `col` maps to `column`, snippets included when the CLI provides them).

#### Token effect

Fixed schema cost on every request where the tools are visible. Result size scales with `limit` and, for `code_search`, with `includeRefs` (one extra `lookup refs` call per hit).

#### KV Cache effect

Prefix-stable while the tool definitions and their visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from these schemas.

### Skill content

#### What the model sees

The bundled `crabcc` skill contributes stable prose owned by this package: the three tools, JSON invocation examples, and the workflow tips ("start broad with `code_search`, drill down with `goto_definition`, understand impact with `find_references`"). The content is served only when the crabcc binary answers `--version`.

#### Token effect

Fixed cost when the skill is loaded; zero when the skill is not retrieved.

#### KV Cache effect

Does not invalidate: the skill text is a stable literal appended to the request; provider cache availability and eviction remain outside the package contract.

## Known Limitations and Deferred Work

- **crabcc binary required** — when `crabcc` is not on `PATH`, `list()`/`get()`
  return no candidates (the skill silently disappears) and the three tools
  fail with a spawn error. The maintainer constraint is a host install of
  crabcc 6.x plus an indexed repository; CI lanes exercising the tools must
  install crabcc first.
- **Index freshness** — lookups reflect the crabcc index as of the last
  `crabcc index`; edits after that point are invisible until re-indexed.
- **Fuzzy matching semantics** — `code_search` is fuzzy, not regex or exact
  substring; exact-name queries should use `goto_definition`. `includeRefs`
  costs one extra `lookup refs` call per hit and is off by default.
- **Host-side execution** — the tools spawn a crabcc subprocess with the
  operator's privileges; this package provides no sandbox layer.
