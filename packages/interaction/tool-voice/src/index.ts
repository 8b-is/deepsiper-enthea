/**
 * Model-facing voice tools over `ctx.voice`: `voice_speak` and
 * `voice_transcribe`. The seam owns provider selection and the host binary; this
 * consumer owns the schemas, bounds, and presentation.
 * @module @deepseek-ai/dsh-tool-voice
 */

import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-voice'

export const name = 'tool-voice'
export const inject = ['tools', 'voice']

/** Bounded spoken-input length. */
export const DEFAULT_MAX_TEXT_CHARS = 4000
/** Bounded transcript result length. */
export const DEFAULT_MAX_TRANSCRIPT_CHARS = 8000

/** Plugin configuration. */
export interface Config {
  /** Maximum accepted `voice_speak` text (default 4000). */
  maxTextChars?: number
  /** Maximum emitted `voice_transcribe` text (default 8000). */
  maxTranscriptChars?: number
}

export const Config: z<Config> = z.object({
  maxTextChars: z.number().step(1).min(1).default(DEFAULT_MAX_TEXT_CHARS),
  maxTranscriptChars: z.number().step(1).min(1).default(DEFAULT_MAX_TRANSCRIPT_CHARS),
})

/** Validated `voice_speak` arguments. */
export interface VoiceSpeakArgs {
  readonly text: string
  readonly voice?: string
  readonly rate?: number
}

/** The compact `voice_speak` value. */
export interface VoiceSpeakValue {
  readonly provider: string
  readonly characters: number
  readonly voice?: string
}

/** Validated `voice_transcribe` arguments. */
export interface VoiceTranscribeArgs {
  readonly path: string
  readonly language?: string
}

/** The bounded `voice_transcribe` value. */
export interface VoiceTranscribeValue {
  readonly provider: string
  readonly text: string
  readonly truncated: boolean
}

const SPEAK_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { type: 'string', required: true },
    characters: { type: 'integer', required: true },
    voice: { type: 'string' },
  },
} as const

const TRANSCRIBE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { type: 'string', required: true },
    text: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
} as const

/**
 * Render the spoken summary.
 * @param _args - the raw arguments (unused).
 * @param value - the validated value.
 * @returns one text block.
 */
export function renderVoiceSpeak(_args: VoiceSpeakArgs, value: VoiceSpeakValue): ContentBlock[] {
  const voice = value.voice === undefined ? '' : ` in voice ${JSON.stringify(value.voice)}`
  return [{ type: 'text', text: `Spoke ${value.characters} characters${voice} via ${value.provider}.` }]
}

/**
 * Render the transcript, naming truncation when it happened.
 * @param _args - the raw arguments (unused).
 * @param value - the bounded value.
 * @returns one text block.
 */
export function renderVoiceTranscribe(_args: VoiceTranscribeArgs, value: VoiceTranscribeValue): ContentBlock[] {
  return [{ type: 'text', text: value.text }]
}

/**
 * UI presentation for a pending `voice_speak` call.
 * @param args - the raw arguments.
 * @returns the generic call view.
 */
export function presentVoiceCall(args: VoiceSpeakArgs): GenericCallView {
  return { card: 'generic', kind: 'other', title: `Speak ${args.text.trim().length} characters` }
}

/**
 * UI presentation for a pending `voice_transcribe` call.
 * @param args - the raw arguments.
 * @returns the generic call view.
 */
export function presentTranscribeCall(args: VoiceTranscribeArgs): GenericCallView {
  return { card: 'generic', kind: 'other', title: `Transcribe ${basename(args.path)}` }
}

/**
 * Bound one transcript to the configured maximum, including the marker.
 * @param text - the complete transcript.
 * @param maxChars - the maximum emitted length.
 * @returns the bounded text and whether it was cut.
 */
export function truncateTranscript(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  const suffix = '\n[truncated]'
  if (maxChars <= suffix.length) return { text: text.slice(0, maxChars), truncated: true }
  return { text: text.slice(0, maxChars - suffix.length) + suffix, truncated: true }
}

/** Map an aborted provider call onto the registry's cancellation contract. */
function rethrowAborted(signal: AbortSignal, error: unknown): never {
  if (signal.aborted) {
    const aborted = new HarnessError('tool call aborted', TOOL_ABORTED)
    aborted.name = 'AbortError'
    throw aborted
  }
  throw error
}

/**
 * Register `voice_speak` and `voice_transcribe`.
 * @param ctx - the plugin context (must inject `tools` and `voice`).
 * @param config - the resolved configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const maxTextChars = config.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS
  const maxTranscriptChars = config.maxTranscriptChars ?? DEFAULT_MAX_TRANSCRIPT_CHARS

  ctx.tools.register(defineTool({
    name: 'voice_speak',
    description: 'Speak text aloud through the session voice provider. Use for voice output when the session is on a machine with audio.',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to speak; trimmed and bounded.' },
      voice: { type: 'string', description: 'Provider voice name.' },
      rate: { type: 'integer', description: 'Provider rate (words per minute, or its documented speed knob).' },
    },
    output: { schema: SPEAK_OUTPUT_SCHEMA, render: renderVoiceSpeak },
    async execute(args, exec) {
      const text = args.text.trim()
      if (text.length === 0) throw new Error('voice_speak: text must be non-empty')
      if (text.length > maxTextChars) {
        throw new Error(`voice_speak: text is ${text.length} characters, over the ${maxTextChars} limit`)
      }
      try {
        const result = await ctx.voice.speak({
          operation: 'speak',
          text,
          ...args.voice === undefined ? {} : { voice: args.voice },
          ...args.rate === undefined ? {} : { rate: args.rate },
        }, exec.signal)
        return {
          provider: result.provider,
          characters: result.characters,
          ...result.voice === undefined ? {} : { voice: result.voice },
        }
      } catch (error) {
        return rethrowAborted(exec.signal, error)
      }
    },
    presentCall: presentVoiceCall,
  }))

  ctx.tools.register(defineTool({
    name: 'voice_transcribe',
    description: 'Transcribe a local audio file to text through the session voice provider. Use when the user points at a recording and asks what it says.',
    parameters: {
      path: { type: 'string', required: true, description: 'Audio file path readable by the provider.' },
      language: { type: 'string', description: 'Language hint, or auto.' },
    },
    output: { schema: TRANSCRIBE_OUTPUT_SCHEMA, render: renderVoiceTranscribe },
    async execute(args, exec) {
      try {
        const result = await ctx.voice.transcribe({
          operation: 'transcribe',
          audio: { path: args.path },
          ...args.language === undefined ? {} : { language: args.language },
        }, exec.signal)
        const bounded = truncateTranscript(result.text, maxTranscriptChars)
        return { provider: result.provider, ...bounded }
      } catch (error) {
        return rethrowAborted(exec.signal, error)
      }
    },
    presentCall: presentTranscribeCall,
  }))
}
