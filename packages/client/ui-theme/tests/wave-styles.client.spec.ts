/** Wave palette sheet contract: every named studio has a body rule, and motion is opt-in. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WAVE_PALETTES } from '../src/wave-palettes.ts'

const css = readFileSync(fileURLToPath(new URL('../src/styles/wave-palettes.css', import.meta.url)), 'utf8')

describe('wave palette stylesheet', () => {
  it('declares a body rule for every named studio and keeps classic out of that attribute', () => {
    for (const palette of WAVE_PALETTES) {
      const selector = `body[data-dsh-wave='${palette}']`
      if (palette === 'classic') expect(css).not.toContain(selector)
      else expect(css).toContain(selector)
    }
  })

  it('animates only when reduced motion is not requested, and parchment stays still', () => {
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
    const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'))
    expect(motion).toContain("body[data-dsh-wave='ocean']")
    expect(motion).not.toContain('parchment-zen')
  })
})
