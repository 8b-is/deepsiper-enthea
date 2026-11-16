# Agent Note: Qwave studio palettes stay beside light and dark

Status: implemented

English | [中文](2026-11-01-qwave-studio-palettes.zh.md)

## Problem

DeepSiper's Appearance row can follow the operating system, but it has no named visual studios. Qwave already names six dark-leaning studios — ocean, Dra starlight, phoenix lattice, emerald matrix, parchment zen, and cyberpunk neon — and moves a wave behind the page. Copying that motion into every feature stylesheet would scatter colors and ignore reduced motion.

## Decision

[ui-theme](../../../../packages/client/ui-theme/README.md) stores `palette` in the same Host settings section as `preference`. `classic` is the default and leaves the base sheets unchanged. The six studios are first-party ids, not third-party theme registrations. [wave-palettes.css](../../../../packages/client/ui-theme/src/styles/wave-palettes.css) overrides shared aliases on `body[data-dsh-wave]` for both color schemes. The index bootstrap and [ThemePresenter](../../../../packages/client/ui-layout/src/client/theme-presenter.ts) write that attribute. Drift animation runs only inside `prefers-reduced-motion: no-preference`; parchment stays still. The Appearance row keeps Light, Dark, and System, and adds a wave-theme chip row.

The palette values come from Qwave's studio presets: ocean `#6ef7f7`, Dra starlight `#ff9edb`, phoenix `#ff7b39`, emerald `#00ff9f`, parchment `#ebcb8b`, and cyberpunk `#00f5d4`. Light schemes use darker accents so text stays readable.

## Alternatives considered

**Replace Light, Dark, and System with the six studios.** That would drop the operating-system preference and make every studio a dark-only theme. The studios are identities, not a substitute for the scheme control.

**Register the studios as third-party themes.** Those ids do not cross the settings schema, so a public browser would lose the choice on reload. The studios are product settings, so they use the existing preference write.

**A WebGL wave behind the application.** Qwave's shader is a page studio, not an agent-shell dependency. A CSS background drift gives the motion without a second GPU consumer, and reduced motion removes it.

## Consequences

Shared alias overrides recolor the shell, sidebar, and primary controls. A feature that still paints a literal color does not pick up the studio. Emerald switches the UI font to a monospace stack; parchment uses a serif stack. Existing settings documents gain `palette: classic` from the schema default. The choice persists anywhere the Host settings write already works, including an authenticated public browser.
