/**
 * Core anti-prose (caveman-style) response policy. Installs an ordered
 * system-prompt section instructing the model to answer terse in English —
 * compressed like a smart engineer who drops filler — while keeping every
 * technical term, code symbol, command, and error string verbatim. Adapted
 * from the workspace's caveman skill, customized into the harness core with
 * three intensity levels and an English-only rule.
 *
 * This is a pure policy plugin: it shapes model output through the prompt,
 * never by rewriting or vetoing messages. Configuration and chain semantics
 * live in the package README.
 * @module @deepseek-ai/dsh-anti-prose
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Anti-prose intensity levels, mirroring the caveman skill's core three. */
export type Intensity = 'lite' | 'full' | 'ultra'

export const name = 'anti-prose'
export const inject = ['systemPrompt'] as const

/**
 * Plugin config. `enabled: false` keeps the plugin mountable in compositions
 * that want the option but not the default policy.
 */
export interface Config {
  /** Compression intensity (default `full`). */
  intensity?: Intensity
  /** Install the policy section (default true). */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  intensity: z.union([z.const('lite'), z.const('full'), z.const('ultra')]).default('full'),
  enabled: z.boolean().default(true),
})

/** Response-policy sections must land after tool contracts and before the deployment append. */
const SECTION_ORDER = 950

/**
 * The rules common to every intensity, pinned in English per the package
 * contract: the compression applies to the style, never to the language.
 */
const COMMON_RULES = [
  'Always respond in English, regardless of the user\'s language. Compress the style, never the language.',
  'Keep verbatim: code, API names, CLI commands, commit keywords (feat/fix/...), and exact error strings.',
  'No self-reference. Never announce or name this style.',
]

/** `full` and `ultra` add the strictest compression rules; `lite` keeps articles and full sentences. */
const STRICT_RULES = [
  'Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging.',
  'Fragments are fine. Use short synonyms (fix, not "implement a solution for").',
  'No tool-call narration, no decorative tables/emoji, no long raw error-log dumps unless asked — quote the shortest decisive line.',
]

/** `ultra` only: abbreviate prose words, never code symbols, function names, API names, or error strings. */
const ULTRA_RULES = [
  'Abbreviate prose words (DB/auth/config/req/res/fn) — prose only, never real code symbols or function names.',
  'Strip conjunctions; use arrows for causality (X → Y); one word when one word enough.',
]

const INTENSITY_RULES: Record<Intensity, readonly string[]> = {
  lite: ['Drop filler and hedging. Keep articles and full sentences. Professional but tight.'],
  full: STRICT_RULES,
  ultra: [...STRICT_RULES, ...ULTRA_RULES],
}

/** Every intensity drops caveman when clarity outweighs compression. */
const CLARITY_RULES = [
  'Pattern: [thing] [action] [reason]. [next step].',
  'Full clarity when: security warnings, irreversible-action confirmations, or multi-step sequences where fragment order matters. Resume terse after the clear part.',
]

/**
 * Build the model-facing policy section for one intensity.
 * @param intensity - the configured compression level.
 * @returns the ordered rule lines joined into the section text.
 */
export function sectionText(intensity: Intensity): string {
  return [
    `Response style: anti-prose (${intensity}). Answer terse in English like a sharp engineer who drops filler.`,
    ...COMMON_RULES,
    ...INTENSITY_RULES[intensity],
    ...CLARITY_RULES,
  ].join('\n')
}

/**
 * Install the anti-prose response policy section.
 * @param ctx - plugin context; the section is scoped to it and disposed with it.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled === false) return
  ctx.systemPrompt.section({
    name: 'response-style:anti-prose',
    order: SECTION_ORDER,
    text: sectionText(config.intensity as Intensity),
  })
}
