/**
 * Model-facing `voice_speak` tool: speak bounded text through a local TTS binary.
 * The host binary is the sole speech authority (`say` on macOS, `espeak-ng` on
 * Linux, or any configured command that accepts the text as its last argument).
 * The tool owns the schema, the process call, the bounded result, and the UI
 * presentation; it never synthesizes audio itself.
 * @module @deepseek-ai/dsh-tool-voice
 */

import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export const name = 'tool-voice'
export const inject = ['tools']

/** Bounded input length; a security invariant rather than a tunable. */
export const DEFAULT_MAX_TEXT_CHARS = 4000

/** Plugin configuration; every field is changeable from `cordis.yml`. */
export interface Config {
  /** TTS binary; defaults to `say` on macOS and `espeak-ng` on Linux. */
  binary?: string
  /** Default voice name passed to the binary. */
  voice?: string
  /** Default words-per-minute rate passed to the binary. */
  rate?: number
  /** Maximum accepted text length (default 4000). */
  maxTextChars?: number
}

export const Config: z<Config> = z.object({
  binary: z.string(),
  voice: z.string(),
  rate: z.number().step(1).min(1).max(1000),
  maxTextChars: z.number().step(1).min(1).default(DEFAULT_MAX_TEXT_CHARS),
})

/** Validated `voice_speak` arguments. */
export interface VoiceSpeakArgs {
  /** Text to speak; trimmed and bounded by `maxTextChars`. */
  readonly text: string
  /** Voice name for this call, overriding the configured default. */
  readonly voice?: string
  /** Words-per-minute rate for this call, overriding the configured default. */
  readonly rate?: number
}

/** The compact value returned to the model. */
export interface VoiceSpeakValue {
  readonly binary: string
  readonly characters: number
  readonly voice?: string
}

/** One speech request after configuration defaults are applied. */
export interface VoiceSpeakRequest {
  readonly text: string
  readonly voice?: string
  readonly rate?: number
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    binary: { type: 'string', required: true },
    characters: { type: 'integer', required: true },
    voice: { type: 'string' },
  },
} as const

/**
 * The platform's default TTS binary.
 * @param platform - the Node platform to resolve for.
 * @returns the default binary name.
 * @throws Error when the platform has no default; the deployment must set `binary`.
 */
export function platformBinary(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return 'say'
  if (platform === 'linux') return 'espeak-ng'
  throw new Error(`tool-voice: no default text-to-speech binary for platform ${platform}; set the binary config field`)
}

/**
 * Build the argv for one speech request. `say` and `espeak` take different
 * rate flags; any other command receives the text as its last argument.
 * @param binary - the configured TTS binary.
 * @param request - the resolved speech request.
 * @returns the argument vector, never a shell string.
 */
export function speakArgs(binary: string, request: VoiceSpeakRequest): string[] {
  const flags: string[] = []
  if (request.voice !== undefined) flags.push('-v', request.voice)
  const base = basename(binary)
  if (base === 'say') {
    if (request.rate !== undefined) flags.push('-r', String(request.rate))
  } else if (base === 'espeak-ng' || base === 'espeak') {
    if (request.rate !== undefined) flags.push('-s', String(request.rate))
  }
  return [...flags, request.text]
}

/** The subset of `spawn` this tool uses; injectable for tests. */
export type SpawnFn = typeof spawn

/**
 * Speak one request and resolve when the process exits successfully.
 * @param binary - the TTS binary.
 * @param request - the resolved speech request.
 * @param signal - caller cancellation; the child is killed on abort.
 * @param spawnFn - process launcher, defaulting to Node's `spawn`.
 * @returns a promise settled by the child's exit.
 * @throws Error on spawn failure or a non-zero exit.
 */
export async function runSpeak(
  binary: string,
  request: VoiceSpeakRequest,
  signal?: AbortSignal,
  spawnFn: SpawnFn = spawn,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnFn(binary, speakArgs(binary, request), {
      stdio: 'ignore',
      ...signal === undefined ? {} : { signal },
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT'
        ? new Error(`tool-voice: text-to-speech binary ${JSON.stringify(binary)} was not found`)
        : error)
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tool-voice: ${binary} exited with status ${String(code)}`))
    })
  })
}

/**
 * Render the spoken summary for the model and UI.
 * @param _args - the raw tool arguments (unused).
 * @param value - the validated summary value.
 * @returns one text block.
 */
export function renderVoiceSpeak(_args: VoiceSpeakArgs, value: VoiceSpeakValue): ContentBlock[] {
  const voice = value.voice === undefined ? '' : ` in voice ${JSON.stringify(value.voice)}`
  return [{ type: 'text', text: `Spoke ${value.characters} characters${voice} with ${value.binary}.` }]
}

/**
 * UI presentation for a pending `voice_speak` call.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export function presentVoiceCall(args: VoiceSpeakArgs): GenericCallView {
  return {
    card: 'generic',
    kind: 'other',
    title: `Speak ${args.text.trim().length} characters`,
  }
}

/**
 * Register the `voice_speak` tool.
 * @param ctx - the plugin context (must inject `tools`).
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const maxTextChars = config.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS
  ctx.tools.register(defineTool({
    name: 'voice_speak',
    description: 'Speak text aloud through the host text-to-speech binary. Use for voice output when the session is on a machine with audio.',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to speak; trimmed and bounded.' },
      voice: { type: 'string', description: 'Voice name, overriding the configured default.' },
      rate: { type: 'integer', description: 'Words per minute, overriding the configured default.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: renderVoiceSpeak,
    },
    async execute(args, exec) {
      const text = args.text.trim()
      if (text.length === 0) throw new Error('voice_speak: text must be non-empty')
      if (text.length > maxTextChars) {
        throw new Error(`voice_speak: text is ${text.length} characters, over the ${maxTextChars} limit`)
      }
      const binary = config.binary ?? platformBinary()
      const voice = args.voice ?? config.voice
      const rate = args.rate ?? config.rate
      const request: VoiceSpeakRequest = {
        text,
        ...voice === undefined ? {} : { voice },
        ...rate === undefined ? {} : { rate },
      }
      try {
        await runSpeak(binary, request, exec.signal)
      } catch (error) {
        if (exec.signal.aborted) {
          const aborted = new HarnessError('tool call aborted', TOOL_ABORTED)
          aborted.name = 'AbortError'
          throw aborted
        }
        throw error
      }
      return { binary, characters: text.length, ...voice === undefined ? {} : { voice } }
    },
    presentCall: presentVoiceCall,
  }))
}
