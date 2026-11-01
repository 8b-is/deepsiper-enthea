/**
 * Kokoro voice provider for `ctx.voice` ([8b-is/kokoro-tiny](https://github.com/8b-is/kokoro-tiny)).
 * Wraps the `kokoro-speak` CLI: `say` for TTS and `stt` for speech-to-text. The
 * CLI owns model download, voices, and audio playback; this provider owns the
 * process call and the seam mapping.
 * @module @deepseek-ai/dsh-voice-kokoro
 */

import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { VoiceProviderId } from '@deepseek-ai/dsh-voice'
import type {
  VoiceProvider,
  VoiceSpeakRequest,
  VoiceSpokenResult,
  VoiceTranscribeRequest,
  VoiceTranscribedResult,
} from '@deepseek-ai/dsh-voice'

export const name = 'voice-kokoro'
export const inject = ['voice']

/** Plugin configuration. */
export interface Config {
  /** `kokoro-speak` binary name or path (default `kokoro-speak`). */
  binary?: string
  /** Default Kokoro voice (e.g. `af_sky`, `hu_mariska`). */
  voice?: string
  /** Default speaking speed (0.5 to 2.0). */
  speed?: number
  /** Default language code (`auto`, `en`, `hu`). */
  language?: string
}

export const Config: z<Config> = z.object({
  binary: z.string(),
  voice: z.string(),
  speed: z.number().min(0.5).max(4),
  language: z.string(),
})

/** The subset of `spawn` this provider uses; injectable for tests. */
export type SpawnFn = typeof spawn

/** One captured process result. */
export interface ProcessOutput {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * Build the argv for one speak request.
 * @param request - the speak request.
 * @param config - provider defaults.
 * @returns the argument vector for `kokoro-speak`.
 */
export function speakArgs(request: VoiceSpeakRequest, config: Config): string[] {
  const args = ['say', request.text]
  const voice = request.voice ?? config.voice
  const speed = request.rate ?? config.speed
  const language = request.language ?? config.language
  if (voice !== undefined) args.push('-V', voice)
  if (speed !== undefined) args.push('-s', String(speed))
  if (language !== undefined) args.push('-L', language)
  return args
}

/**
 * Build the argv for one transcribe request.
 * @param request - the transcribe request.
 * @param config - provider defaults.
 * @returns the argument vector for `kokoro-speak stt`.
 */
export function transcribeArgs(request: VoiceTranscribeRequest, config: Config): string[] {
  const language = request.language ?? config.language ?? 'auto'
  return ['stt', request.audio.path, '--lang', language]
}

/**
 * Run a process and capture its output.
 * @param binary - the executable.
 * @param args - the argument vector.
 * @param signal - caller cancellation.
 * @param spawnFn - process launcher.
 * @returns the captured result.
 */
export async function runCapture(
  binary: string,
  args: readonly string[],
  signal?: AbortSignal,
  spawnFn: SpawnFn = spawn,
): Promise<ProcessOutput> {
  return await new Promise<ProcessOutput>((resolve, reject) => {
    const child = spawnFn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], ...signal === undefined ? {} : { signal } })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer | string) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr += String(chunk) })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT'
        ? new Error(`voice-kokoro: binary ${JSON.stringify(binary)} was not found`)
        : error)
    })
    child.on('close', (code) => { resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

/** The Kokoro voice provider. */
export class KokoroVoiceProvider implements VoiceProvider {
  readonly id = VoiceProviderId('kokoro')
  readonly capabilities = ['speak', 'transcribe'] as const

  constructor(private readonly config: Config, private readonly spawnFn: SpawnFn = spawn) {}

  async speak(request: VoiceSpeakRequest, signal?: AbortSignal): Promise<VoiceSpokenResult> {
    const binary = this.config.binary ?? 'kokoro-speak'
    const output = await runCapture(binary, speakArgs(request, this.config), signal, this.spawnFn)
    if (output.code !== 0) throw new Error(`voice-kokoro: ${binary} exited with status ${String(output.code)}: ${output.stderr.trim()}`)
    const voice = request.voice ?? this.config.voice
    return { kind: 'spoken', provider: this.id, characters: request.text.length, ...voice === undefined ? {} : { voice } }
  }

  async transcribe(request: VoiceTranscribeRequest, signal?: AbortSignal): Promise<VoiceTranscribedResult> {
    const binary = this.config.binary ?? 'kokoro-speak'
    const output = await runCapture(binary, transcribeArgs(request, this.config), signal, this.spawnFn)
    if (output.code !== 0) throw new Error(`voice-kokoro: ${binary} exited with status ${String(output.code)}: ${output.stderr.trim()}`)
    return { kind: 'transcribed', provider: this.id, text: output.stdout.trim() }
  }
}

/**
 * Register the `kokoro` voice provider.
 * @param ctx - the plugin context carrying `voice`.
 * @param config - the resolved configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.voice.registerProvider(new KokoroVoiceProvider(config))
}
