import { defineConfig } from 'tsdown'

/** Shared chunks keep namespace reservations common to explicit clients and the settings manager. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/settings.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
