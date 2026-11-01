/** Credential selection failures must not expose any part of an OpenCode secret. */
import { describe, expect, it } from 'vitest'
import { selectOpenCodeAccess } from './opencode-local.ts'

const now = 1_800_000_000_000
const token = 'private-access-token'
const refresh = 'private-refresh-token'
const active = {
  integrationID: 'openai',
  active: true,
  value: { type: 'oauth', access: token, refresh, expires: now + 120_000 },
}

describe('OpenCode local credential selection', () => {
  it('uses only the active OpenAI access token and omits refresh material', () => {
    expect(selectOpenCodeAccess({ data: [
      { ...active, integrationID: 'another-provider' },
      { ...active, active: false },
      active,
    ] }, now)).toEqual({ access: token, expires: now + 120_000 })
  })

  it.each([
    null,
    { data: {} },
    { data: [] },
    { data: [active, active] },
    { data: [{ ...active, active: false }] },
    { data: [{ ...active, value: { ...active.value, type: 'key' } }] },
    { data: [{ ...active, value: { ...active.value, access: '' } }] },
    { data: [{ ...active, value: { ...active.value, access: token + '\n' } }] },
    ...[now - 1, now + 60_000, Number.MAX_SAFE_INTEGER + 1, 'tomorrow'].map(expires => ({
      data: [{ ...active, value: { ...active.value, expires } }],
    })),
  ])('rejects unusable credentials without echoing access or refresh tokens (%#)', (response) => {
    expect(() => selectOpenCodeAccess(response, now)).toThrow()
    try {
      selectOpenCodeAccess(response, now)
    } catch (error) {
      expect(String(error)).not.toContain(token)
      expect(String(error)).not.toContain(refresh)
    }
  })
})
