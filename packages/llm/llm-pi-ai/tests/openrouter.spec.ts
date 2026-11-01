/**
 * The OpenRouter route as the base composition mounts it: the installed pi-ai
 * catalog owns the endpoint, the model list, and the `openrouter` reasoning
 * dialect, so a profile states only its credential reference.
 */

import { describe, expect, it } from 'vitest'
import { resolveProfiles } from '../src/config.ts'

describe('OpenRouter catalog route', () => {
  it('resolves the base composition default entirely from the catalog', () => {
    const profiles = resolveProfiles({ openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY' } })
    const profile = profiles.get('openrouter')
    expect(profile?.apiKeyEnv).toBe('OPENROUTER_API_KEY')
    expect(profile?.displayName).toBe('openrouter')

    const models = profile?.piProvider.getModels() ?? []
    expect(models.length).toBeGreaterThan(100)
    const sonnet = models.find(model => model.id === 'anthropic/claude-sonnet-4.5')
    expect(sonnet?.api).toBe('openai-completions')
    expect(sonnet?.baseUrl).toBe('https://openrouter.ai/api/v1')
    const compat = sonnet?.compat as { thinkingFormat?: string } | undefined
    expect(compat?.thinkingFormat).toBe('openrouter')
  })
})
