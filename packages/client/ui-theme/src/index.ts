/** Host registration for the browser theme preference and pre-plugin palette. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { injectBootTheme } from './boot-theme.ts'
import {
  DEFAULT_PALETTE, DEFAULT_PREFERENCE, THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema,
  isThemePreference, isWavePalette, type ThemePreference, type ThemeSettings, type WavePalette,
} from './theme-settings.ts'

export {
  DEFAULT_PALETTE, DEFAULT_PREFERENCE, THEME_PALETTE_FIELD, THEME_PREFERENCE_FIELD,
  THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE, WAVE_ATTRIBUTE, WAVE_PALETTES,
  isWavePalette, type ThemePreference, type ThemeSettings, type WavePalette,
} from './theme-settings.ts'

const THEME_NAMESPACE = settingsNamespace(THEME_SETTINGS_NAMESPACE)

/** Boot values embedded in one index response. */
interface ThemeBoot {
  /** Built-in light/dark/system preference. */
  preference: ThemePreference
  /** Built-in wave palette. */
  palette: WavePalette
}

/** Read the registered theme section or use schema defaults without a settings provider. */
function readBoot(ctx: Context): ThemeBoot {
  const settings = ctx.get('settings')
  const section = settings?.get(THEME_NAMESPACE) as Partial<ThemeSettings> | undefined
  return {
    preference: isThemePreference(section?.preference) ? section.preference : DEFAULT_PREFERENCE,
    palette: isWavePalette(section?.palette) ? section.palette : DEFAULT_PALETTE,
  }
}

/**
 * Register the durable theme section and initial-theme index transform when
 * their optional Host services are composed.
 * @param ctx - Host context that may acquire settings and HTTP services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, ThemeSettingsSchema)
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectBootTheme(html, readBoot(ctx))),
      'client-ui-theme: initial theme bootstrap',
    )
  })
}
