import { describe, expect, it } from 'vitest'
import * as cordis from '@deepseek-ai/cordis'

describe('probe2', () => {
  it('lists cordis exports', () => {
    const names = Object.keys(cordis).sort()
    console.log('has FiberState:', 'FiberState' in cordis)
    console.log('fiber-ish:', names.filter(n => /Fiber|State|Inject|Registry/.test(n)))
    console.log('total exports:', names.length)
    expect(true).toBe(true)
  })
})
