/** `settings.theme` namespace dictionaries (the Appearance row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
  'appearance.wave': '波浪主题',
  'appearance.palette.classic': '经典',
  'appearance.palette.ocean': '深海',
  'appearance.palette.dra-starlight': '星光玫瑰',
  'appearance.palette.phoenix-lattice': '凤凰晶格',
  'appearance.palette.emerald-matrix': '翡翠矩阵',
  'appearance.palette.parchment-zen': '暖纸禅意',
  'appearance.palette.cyberpunk-neon': '赛博霓虹',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'appearance.wave': 'Wave theme',
  'appearance.palette.classic': 'Classic',
  'appearance.palette.ocean': 'Ocean',
  'appearance.palette.dra-starlight': 'Dra Starlight',
  'appearance.palette.phoenix-lattice': 'Phoenix Lattice',
  'appearance.palette.emerald-matrix': 'Emerald Matrix',
  'appearance.palette.parchment-zen': 'Parchment Zen',
  'appearance.palette.cyberpunk-neon': 'Cyberpunk Neon',
} satisfies Record<ThemeKey, string>
