import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as AntiProse from '@deepseek-ai/dsh-anti-prose'
import { sectionText } from '@deepseek-ai/dsh-anti-prose'

async function boot(intensity: AntiProse.Intensity | undefined, enabled?: boolean) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(AntiProse, {
    ...intensity !== undefined ? { intensity } : {},
    ...enabled !== undefined ? { enabled } : {},
  })
  return ctx
}

describe('anti-prose response policy', () => {
  it('installs the full-intensity section into the assembled prompt', async () => {
    const ctx = await boot(undefined)
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toContain('Response style: anti-prose (full)')
    expect(prompt).toContain('Always respond in English, regardless of the user\'s language')
    expect(prompt).toContain('Drop: articles (a/an/the)')
    expect(prompt).toContain('[thing] [action] [reason]. [next step].')
  })

  it('honors the intensity and drops the strictest rules for lite', async () => {
    const lite = renderPrompt(await (await boot('lite')).systemPrompt.assemble())
    expect(lite).toContain('anti-prose (lite)')
    expect(lite).not.toContain('Drop: articles (a/an/the)')
    expect(lite).toContain('Keep articles and full sentences')

    const ultra = renderPrompt(await (await boot('ultra')).systemPrompt.assemble())
    expect(ultra).toContain('Abbreviate prose words (DB/auth/config/req/res/fn)')
    expect(ultra).toContain('arrows for causality')
  })

  it('keeps the technical-term and clarity guarantees at every intensity', async () => {
    for (const intensity of ['lite', 'full', 'ultra'] as const) {
      const prompt = renderPrompt(await (await boot(intensity)).systemPrompt.assemble())
      expect(prompt).toContain('Keep verbatim: code, API names, CLI commands, commit keywords (feat/fix/...), and exact error strings.')
      expect(prompt).toContain('security warnings, irreversible-action confirmations, or multi-step sequences where fragment order matters')
    }
  })

  it('installs nothing when disabled', async () => {
    const ctx = await boot('full', false)
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).not.toContain('anti-prose')
  })

  it('disposes the section with the plugin fiber (HMR safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    const fiber = await ctx.plugin(AntiProse, {})
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('anti-prose')
    await fiber.dispose()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('anti-prose')
  })
})

describe('sectionText', () => {
  it('pins the full policy verbatim', () => {
    expect(sectionText('full')).toBe(
      'Response style: anti-prose (full). Answer terse in English like a sharp engineer who drops filler.\n'
      + 'Always respond in English, regardless of the user\'s language. Compress the style, never the language.\n'
      + 'Keep verbatim: code, API names, CLI commands, commit keywords (feat/fix/...), and exact error strings.\n'
      + 'No self-reference. Never announce or name this style.\n'
      + 'Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging.\n'
      + 'Fragments are fine. Use short synonyms (fix, not "implement a solution for").\n'
      + 'No tool-call narration, no decorative tables/emoji, no long raw error-log dumps unless asked — quote the shortest decisive line.\n'
      + 'Pattern: [thing] [action] [reason]. [next step].\n'
      + 'Full clarity when: security warnings, irreversible-action confirmations, or multi-step sequences where fragment order matters. Resume terse after the clear part.',
    )
  })
})
