# Deepsiper Enthea Design System

The Deepsiper Enthea design system delivers a high-density, precise, developer-first interface for sovereign agent orchestration and evaluation.

## 1. Principles

1. **Density over Decoration:** Every element provides high signal-to-noise ratio. Avoid ornamental fluff.
2. **Code-First Legibility:** Code blocks, configuration schemas, logs, and metrics are first-class citizens.
3. **Dark Mode Sovereign Aesthetic:** Near-black `#0a0a0a` foundation paired with high-contrast neutral zinc and precise electric accents.
4. **Instant Responsiveness:** Lightweight, zero-CDN runtime with fluid responsive behavior across mobile, tablet, and ultra-wide displays.

---

## 2. Color Tokens

| Token | Hex Value | Semantic Role |
|-------|-----------|---------------|
| `--de-bg-canvas` | `#0a0a0a` | Global canvas background |
| `--de-bg-surface` | `#121214` | Secondary surface / container panels |
| `--de-bg-elevated` | `#18181b` | Cards, popovers, dropdowns |
| `--de-bg-subtle` | `#27272a` | Hover states, inner wells |
| `--de-border-base` | `rgba(255, 255, 255, 0.08)` | Default card and panel borders |
| `--de-border-hover` | `rgba(255, 255, 255, 0.18)` | Interactive element hover border |
| `--de-text-primary` | `#f4f4f5` | Headings, primary content |
| `--de-text-secondary` | `#a1a1aa` | Body prose, labels, secondary info |
| `--de-text-muted` | `#71717a` | Captions, timestamps, disabled items |
| `--de-accent-blue` | `#3b82f6` | Primary action buttons, active tabs |
| `--de-accent-cyan` | `#38bdf8` | Highlight badges, metric callouts |
| `--de-accent-purple` | `#818cf8` | Sovereign backend indicators |
| `--de-success` | `#22c55e` | Passing tests, active connections |
| `--de-warning` | `#f59e0b` | Warnings, rate limits, yellow alerts |
| `--de-danger` | `#ef4444` | Errors, test failures, critical alerts |

---

## 3. Typography

- **Interface Font Stack:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace Stack:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### Type Scale

| Scale | Size | Line Height | Tracking | Weight |
|-------|------|-------------|----------|--------|
| `text-display` | 48px / 3rem | 1.1 | -0.03em | 700 |
| `text-h1` | 32px / 2rem | 1.2 | -0.025em | 600 |
| `text-h2` | 24px / 1.5rem | 1.3 | -0.02em | 600 |
| `text-h3` | 18px / 1.125rem | 1.4 | -0.01em | 600 |
| `text-body` | 15px / 0.9375rem | 1.6 | normal | 400 |
| `text-sm` | 13px / 0.8125rem | 1.5 | normal | 400 |
| `text-code` | 13px / 0.8125rem | 1.5 | normal | 500 |

---

## 4. Layout & Spacing

Base unit: `4px` grid (`4`, `8`, `12`, `16`, `24`, `32`, `48`, `64`).

- **Max Container Width:** `1280px`
- **Content Padding:** `16px` (mobile), `32px` (tablet/desktop)
- **Grid Gaps:** `16px` – `24px`

---

## 5. UI Primitives

### Buttons
- **Primary:** Background `var(--de-accent-blue)`, text white, `border-radius: 6px`, subtle glow on hover.
- **Secondary:** Background `var(--de-bg-elevated)`, border `var(--de-border-base)`, text `var(--de-text-primary)`.
- **Ghost:** Background transparent, text `var(--de-text-secondary)`, hover background `var(--de-bg-subtle)`.

### Cards
- Background: `var(--de-bg-surface)`
- Border: `1px solid var(--de-border-base)`
- Border Radius: `8px`
- Padding: `20px`

### Badges
- Pill format: `padding: 2px 8px`, `border-radius: 9999px`, `font-size: 11px`, `font-weight: 500`.

### Code Blocks
- Background: `#09090b`
- Border: `1px solid var(--de-border-base)`
- Top Header: Language badge + interactive copy button
- Syntax styling: JetBrains Mono with highlight tokens.
