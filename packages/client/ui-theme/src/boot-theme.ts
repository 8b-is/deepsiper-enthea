/**
 * Host-rendered theme bootstrap for the browser's pre-plugin interval. Each
 * index response embeds the current durable built-in preference and wave
 * palette; the browser resolves only `system`, then writes the same DOM fields
 * ui-layout's ThemePresenter owns after the client plugin tree activates.
 */

import { DEFAULT_PALETTE, DEFAULT_PREFERENCE, WAVE_ATTRIBUTE, type ThemePreference, type WavePalette } from './theme-settings.ts'

/** Preference and palette embedded in one index response. */
export interface ThemeBoot {
  /** Built-in light/dark/system preference. */
  preference: ThemePreference
  /** Built-in wave palette. */
  palette: WavePalette
}

/** Build the inline script for one schema-validated built-in preference and palette. */
function bootThemeScript(boot: ThemeBoot): string {
  return `<script>(() => {
  const preference = ${JSON.stringify(boot.preference)}
  const palette = ${JSON.stringify(boot.palette)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  if (palette === 'classic') document.body.removeAttribute(${JSON.stringify(WAVE_ATTRIBUTE)})
  else document.body.setAttribute(${JSON.stringify(WAVE_ATTRIBUTE)}, palette)
})()</script>`
}

/**
 * Insert the theme bootstrap immediately after the opening body tag, before
 * the shell mount and module script. Body-less fragments receive it at the
 * end, where the HTML parser has already synthesized a body.
 * @param html - Raw application index HTML.
 * @param boot - Current Host-backed preference and palette, or a bare preference from older callers.
 * @returns HTML containing the theme bootstrap.
 */
export function injectBootTheme(
  html: string,
  boot: ThemeBoot | ThemePreference = { preference: DEFAULT_PREFERENCE, palette: DEFAULT_PALETTE },
): string {
  const script = bootThemeScript(typeof boot === 'string' ? { preference: boot, palette: DEFAULT_PALETTE } : boot)
  const body = /<body(?:\s[^>]*)?>/i.exec(html)
  if (body === null) return `${html}${script}`
  const at = body.index + body[0].length
  return `${html.slice(0, at)}${script}${html.slice(at)}`
}
