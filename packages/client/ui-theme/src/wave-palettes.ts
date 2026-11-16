/** First-party Qwave studio palettes stored beside the light/dark preference. */

/** Body attribute selecting a named wave palette. `classic` removes it. */
export const WAVE_ATTRIBUTE = 'data-dsh-wave'

/** Built-in wave palettes accepted by settings and the Appearance row. */
export const WAVE_PALETTES = [
  'classic',
  'ocean',
  'dra-starlight',
  'phoenix-lattice',
  'emerald-matrix',
  'parchment-zen',
  'cyberpunk-neon',
] as const

/** One persisted wave palette id. */
export type WavePalette = typeof WAVE_PALETTES[number]

/** Palette used when the user-settings document has no override. */
export const DEFAULT_PALETTE: WavePalette = 'classic'

/** Settings field carrying the selected wave palette. */
export const THEME_PALETTE_FIELD = 'palette'

/**
 * Narrow one wire or registry value to a persistable wave palette.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in wave palette.
 */
export function isWavePalette(value: unknown): value is WavePalette {
  return WAVE_PALETTES.some(palette => palette === value)
}
