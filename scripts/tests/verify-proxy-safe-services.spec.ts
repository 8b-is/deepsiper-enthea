/**
 * Tests for the proxy-safe-services gate: the pure `scanServiceClasses` check flags a `#private`
 * member on a Cordis `Service` subclass or a class assigned to a `ctx.` slot, and leaves ordinary
 * classes alone.
 */

import { describe, expect, it } from 'vitest'
import { scanServiceClasses } from '../verify-proxy-safe-services.ts'

const SERVICE_PRIVATE = `
import { Service } from '@deepseek-ai/cordis'
export class Bad extends Service {
  #secret = 1
  read() { return this.#secret }
}
`

const CTX_ASSIGNED_PRIVATE = `
class Helper {
  #state = 0
  get() { return this.#state }
}
const svc = new Helper()
ctx.quant = svc
`

const PLAIN_PRIVATE_OK = `
class Helper {
  #state = 0
  get() { return this.#state }
}
export function make() { return new Helper() }
`

const SERVICE_NO_PRIVATE_OK = `
import { Service } from '@deepseek-ai/cordis'
export class Good extends Service {
  private state = 1
  read() { return this.state }
}
`

describe('scanServiceClasses', () => {
  it('flags #private on a Service subclass', () => {
    const violations = scanServiceClasses(SERVICE_PRIVATE, 'bad.ts')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.className).toBe('Bad')
    expect(violations[0]?.message).toMatch(/proxy-unsafe/)
  })

  it('flags #private when an instance is assigned to a ctx slot', () => {
    const violations = scanServiceClasses(CTX_ASSIGNED_PRIVATE, 'assigned.ts')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.className).toBe('Helper')
  })

  it('leaves an ordinary class with #private alone', () => {
    expect(scanServiceClasses(PLAIN_PRIVATE_OK, 'plain.ts')).toHaveLength(0)
  })

  it('leaves a Service subclass with TS private (non-#) alone', () => {
    expect(scanServiceClasses(SERVICE_NO_PRIVATE_OK, 'good.ts')).toHaveLength(0)
  })
})
