import { describe, expect, it } from 'vitest'
import * as cordis from '@deepseek-ai/cordis'

describe('probe3', () => {
  it('dumps export names', () => {
    console.log('EXPORTS:', Object.keys(cordis).sort().join(','))
    expect(true).toBe(true)
  })
})
