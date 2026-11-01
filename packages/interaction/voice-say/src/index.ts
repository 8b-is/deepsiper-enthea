/**
 * Local text-to-speech provider for `ctx.voice`: `say` on macOS and `espeak-ng`
 * on Linux (or any configured command that accepts the text as its last
 * argument). The host binary is the sole speech authority.
 * @module @deepseek-ai/dsh-voice-say
 */

import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { VoiceProviderId } from '@deepseek-ai/dsh-voice'
import type { VoiceProvider, VoiceSpeakRequest, VoiceSpokenResult } from '@deepseek-ai/dsh-voice'

export const name = 'voice-say'
export const inject = ['voice']

/** Plugin configuration. */
export interface Config {
  /** TTS binary; defaults to `say` on macOS and `espeak-ng` on Linux. */
  binary?: string
  /** Default voice name. */
  voice?: string
  /** Default words-per-minute rate. */
  rate?: number
}

export const Config: z<Config> = z.object({
  binary: z.string(),
  voice: z.string(),
  rate: z.number().step(1).min(1).max(1000),
})

/** The subset of `spawn` this provider uses; injectable for tests. */
export type SpawnFn = typeof spawn

/**
 * The platform's default TTS binary.
 * @param platform - the Node platform to resolve for.
 * @returns the default binary name.
 * @throws Error when the platform has no default.
 */
export function platformBinary(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return 'say'
  if (platform === 'linux') return 'espeak-ng'
  throw new Error(`voice-say: no default text-to-speech binary for platform ${platform}; set the binary config field`)
}

/**
 * Build the argv for one speech request.
 * @param binary - the configured TTS binary.
 * @param request - the speak request.
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

/**
 * Run the binary to completion.
 * @param binary - the TTS binary.
 * @param args - the argument vector.
 * @param signal - caller cancellation.
 * @param spawnFn - process launcher.
 * @returns a promise settled by the child's exit.
 */
export async function runSay(
  binary: string,
  args: readonly string[],
  signal?: AbortSignal,
  spawnFn: SpawnFn = spawn,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawnFn(binary, args, { stdio: 'ignore', ...signal === undefined ? {} : { signal } })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT'
        ? new Error(`voice-say: text-to-speech binary ${JSON.stringify(binary)} was not found`)
        : error)
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`voice-say: ${binary} exited with status ${String(code)}`))
    })
  })
}

/** The `say` voice provider. */
export class SayVoiceProvider implements VoiceProvider {
  readonly id = VoiceProviderId('say')
  readonly capabilities = ['speak'] as const

  constructor(private readonly config: Config, private readonly spawnFn: SpawnFn = spawn) {}

  async speak(request: VoiceSpeakRequest, signal?: AbortSignal): Promise<VoiceSpokenResult> {
    const binary = this.config.binary ?? platformBinary()
    const voice = request.voice ?? this.config.voice
    const rate = request.rate ?? this.config.rate
    const resolved: VoiceSpeakRequest = {
      ...request,
      ...voice === undefined ? {} : { voice },
      ...rate === undefined ? {} : { rate },
    }
    await runSay(binary, speakArgs(binary, resolved), signal, this.spawnFn)
    return { kind: 'spoken', provider: this.id, characters: request.text.length, ...voice === undefined ? {} : { voice } }
  }
}

/**
 * Register the `say` voice provider.
 * @param ctx - the plugin context carrying `voice`.
 * @param config - the resolved configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.voice.registerProvider(new SayVoiceProvider(config))
}
