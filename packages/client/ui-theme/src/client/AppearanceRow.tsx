/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import {
  IconDarkOutline16, IconFollowsystemOutline16, IconLightOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemePreference, WavePalette } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Switch the Qwave studio palette. */
  setPalette: (id: WavePalette) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutline16 }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

/** Palette chip order. Labels stay in the locale dictionaries; colors stay in the wave sheet. */
const PALETTES: readonly { id: WavePalette; labelKey: ThemeKey }[] = [
  { id: 'classic', labelKey: 'appearance.palette.classic' },
  { id: 'ocean', labelKey: 'appearance.palette.ocean' },
  { id: 'dra-starlight', labelKey: 'appearance.palette.dra-starlight' },
  { id: 'phoenix-lattice', labelKey: 'appearance.palette.phoenix-lattice' },
  { id: 'emerald-matrix', labelKey: 'appearance.palette.emerald-matrix' },
  { id: 'parchment-zen', labelKey: 'appearance.palette.parchment-zen' },
  { id: 'cyberpunk-neon', labelKey: 'appearance.palette.cyberpunk-neon' },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setPalette, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  const palette = useStore(s => s.palette)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, preference === id && css.selected)}
            aria-pressed={preference === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.waveTitle}>{t('appearance.wave')}</div>
      <div className={css.chipRow} role="group" aria-label={t('appearance.wave')}>
        {PALETTES.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.chip, palette === id && css.selected)}
            data-dsh-wave-swatch={id}
            aria-pressed={palette === id}
            onClick={() => { setPalette(id) }}
          >
            <span className={css.swatch} aria-hidden="true" />
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
