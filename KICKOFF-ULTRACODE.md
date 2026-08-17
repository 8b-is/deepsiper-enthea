# Kickoff: Client-Side UI/UX — deepsiper-enthea

## What you are building

You are building the **public-facing UI/UX layer** for **deepsiper-enthea** — a sovereign, agent-driven LLM evaluation harness forked from `deepseek-ai/deepseek-harness` (dsh 0.1.0-rc.7). This is the fork's identity layer: how users discover, understand, and interact with the project.

**Fork origin:** `8b-is/deepsiper-enthea` (public GitHub)
**Upstream:** `deepseek-ai/deepseek-harness` (the official dsh repo)

## Deliverables (in order)

### 1. README.md (replace the upstream README)

Replace the existing `README.md` (which is the upstream deepseek-harness README) with a fork-specific README that:

- **Names the project:** "Deepsiper Enthea" (or "deepsiper-enthea") — a sovereign agent harness for LLM evaluation
- **Explains the fork:** what it adds over upstream (sovereign backend, entheai integration, eval plugins, opencode bridge)
- **Shows the stack:** pnpm + TypeScript 6 + tsdown/rolldown + vitest 4 + oxlint + Cordis plugin architecture
- **Quick start:** `pnpm install && pnpm build && pnpm dsh --profile headless "task"`
- **Links:** to the docs site, the upstream repo, the 8b-is org
- **Badges:** GitHub Actions (if any), license (MIT), version (0.1.0-rc.7)
- **Keep it short:** < 150 lines. Developers scan, not read.

Bilingual: English primary, link to `README.zh.md` (create if missing, use upstream's translation pair pattern).

### 2. Landing page (`apps/web/` — the Web UI)

The `apps/web/` directory is the Vite + React web frontend. Currently it's the upstream's minimal shell. You need to build a **landing page / dashboard** that:

- **Hero section:** project name, tagline ("Sovereign agent harness for LLM evaluation"), CTA buttons (Get Started, View on GitHub)
- **Feature grid:** 4-6 cards highlighting the key capabilities:
  - Plugin architecture (everything is a Cordis plugin)
  - Sovereign backend (entheai, self-hosted inference)
  - Eval plugins (tool-eval, eval-entheai)
  - Multi-model support (DeepSeek, Gemini, any OpenAI-compatible)
  - JSON-RPC SDK (drive from opencode/any orchestrator)
  - SOTA build stack (TypeScript 6, rolldown, vitest)
- **Architecture diagram:** simple visual of the plugin system ( Cordis → plugins → LLM backends → eval)
- **Footer:** links to docs, GitHub, 8b-is org

**Tech constraints:**
- Vite 6 + React 18 (already in `apps/web/package.json`)
- Use `@deepseek-ai/dsh-client-web-react` (workspace dep) for any harness-specific React components
- Tailwind CSS or CSS modules (your choice — pick one, be consistent)
- No external CDN deps (everything bundled)
- Responsive (mobile-first)
- Dark mode (match the upstream's dark aesthetic)

### 3. Documentation site (`website/` — VitePress)

The `website/` directory is VitePress. Build a docs structure:

```
website/
  docs/
    getting-started.md    — install, build, run
    architecture.md       — Cordis plugin system, capability seams
    plugins/
      writing-plugins.md  — how to author a custom plugin
      tool-eval.md        — the eval_case tool
      eval-entheai.md     — the entheai backend leaf
    sdk/
      json-rpc.md         — JSON-RPC SDK usage
      headless.md         — headless CLI mode
    backends/
      entheai.md          — sovereign backend setup
      openai-compatible.md — any OpenAI-compatible endpoint
    deployment.md         — nix, docker, bare metal
```

**Tech constraints:**
- VitePress (already in `website/package.json`)
- Use the existing `docs.ts` manifest to register pages
- Keep canonical prose in `docs/` tier, project through `website/` (per `website/AGENTS.md`)
- Bilingual structure: English primary, zh-CN later

### 4. Design system

Define a minimal, consistent design system across the landing page + docs:

- **Typography:** system font stack (Inter or similar if you want to bundle one)
- **Colors:** dark primary (near-black `#0a0a0a` background, `#e5e5e5` text), accent color (DeepSeek blue `#3b82f6` or a custom enthea accent), semantic colors (success green, warning amber, error red)
- **Spacing:** 4px base unit (Tailwind default if using Tailwind)
- **Components:** button (primary/secondary/ghost), card, badge, code block, navigation
- **Motion:** minimal — fade-in on scroll, hover states, no heavy animations
- **Icons:** Lucide React or similar (bundle, don't CDN)

Document the design system in a `docs/design-system.md` or inline in the README.

## File locations

| Deliverable | Path | Notes |
|-------------|------|-------|
| README | `./README.md` | Replace upstream README |
| README.zh.md | `./README.zh.md` | Create if missing |
| Web UI / landing | `apps/web/src/` | Vite + React |
| Web entry | `apps/web/index.html` | Vite entry point |
| Web config | `apps/web/vite.config.ts` | Already exists |
| Docs site | `website/` | VitePress |
| Docs content | `docs/` (root) | Canonical prose |
| Design system | `docs/design-system.md` or inline | Minimal spec |

## Conventions

- **ESM everywhere** (`"type": "module"`)
- **TypeScript strict** (`strict: true`, `noImplicitAny`)
- **Package names:** `@deepseek-ai/dsh-*` (follow the workspace pattern)
- **No external CDN deps** — bundle everything
- **Responsive** — mobile-first, works at 320px+
- **Accessible** — semantic HTML, ARIA labels, keyboard navigation
- **Dark mode** — default, with light mode toggle if you build one
- **No emojis in code** — okay in README/docs prose

## What NOT to change

- `packages/` — the harness core is untouched by this work
- `vendor/` — vendored Cordis source is sacred
- `tsdown.config.ts`, `vitest.config.ts` — build/test configs are untouched
- `.github/` — CI workflows are untouched
- `AGENTS.md` — repo instructions are untouched

## Design direction

Think: **Vercel meets developer tools.** Clean, fast, minimal. The harness is a power tool — the UI should feel precise, not marketing-heavy. Reference: Vercel's landing page, Railway's dashboard, Linear's docs.

Key aesthetic principles:
- **Density over decoration** — show information, not fluff
- **Code-first** — show code snippets, config examples, architecture diagrams
- **Dark by default** — this is a developer tool
- **Fast** — no heavy JS bundles, lazy-load everything non-critical

## Success criteria

- [ ] README.md replaces upstream with fork-specific content (< 150 lines)
- [ ] Landing page renders at `localhost:5173` (or Vite default port)
- [ ] Landing page is responsive (works on mobile)
- [ ] Docs site builds (`pnpm run website:build`)
- [ ] At least 3 docs pages exist (getting-started, architecture, writing-plugins)
- [ ] Design system is consistent across landing + docs
- [ ] No broken links in README or docs
- [ ] All files are ESM, TypeScript strict, no `any` types

## How to run

```sh
# From the repo root
pnpm install
pnpm build                    # build the harness
pnpm --filter @deepseek-ai/dsh-web-frontend run dev   # landing page dev server
pnpm --filter @deepseek-ai/website run dev             # docs site dev server
```

## First steps

1. Read `apps/web/src/` to understand the current web shell
2. Read `website/docs.ts` to understand the docs manifest
3. Read `packages/client/README.md` to understand the client-side packages
4. Read the upstream README to understand what to replace
5. Start with the README (fastest win), then the landing page, then docs

---

*This prompt was generated by the orchestrator for the `8b-is/deepsiper-enthea` fork. Execute it in ultracode/claude/opencode to build the client-side UI/UX layer.*
