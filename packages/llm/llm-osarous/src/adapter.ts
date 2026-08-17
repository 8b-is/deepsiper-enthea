/**
 * `OsarousAdapter`: fetch + SSE against an osarous (Apple Silicon MLX) server
 * speaking the OpenAI-compatible chat-completions protocol, emitting harness
 * StreamChunks. The adapter is transport-plus-lifecycle: connection facts
 * arrive through a thunk resolved once per operation, and the sidecar process
 * is started (and stopped) through the owning plugin's process policy, never
 * inside a stream.
 *
 * Allocation budget: one request payload string per stream, one headers object
 * per stream, one watchdog per stream, and zero per-chunk heap objects beyond
 * the wire deltas themselves — SSE framing is piped through a decoder rather
 * than accumulated, and translated chunks are emitted in arrival order without
 * intermediate copies.
 *
 * @module dsh-llm-osarous/adapter
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { serializeRequest } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = 262_144
/** The sidecar's default listening endpoint. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:1337'
/** The wire port the sidecar process is spawned on; must match {@link DEFAULT_BASE_URL}. */
const DEFAULT_PORT = 1337
/** How long a spawn may take before the health check gives up. */
const SPAWN_SETTLE_MS = 5_000
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'

/** One optional model entry advertised by the osarous adapter. */
export interface OsarousCatalogModel {
  /** Wire model id accepted by the sidecar. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when the sidecar reports none. */
  contextWindow?: number
}

/**
 * Validated connection facts for one operation, resolved once by the plugin.
 * The adapter re-reads them per operation, so a configuration change reaches
 * the next request without re-registration.
 */
export interface OsarousConnectionOptions {
  /** Sidecar endpoint base; `/chat/completions` is appended. */
  baseURL: string
  /** Sidecar process start policy: spawn when unreachable (`true`) or fail loud (`false`). */
  autoStart: boolean
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly OsarousCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
}

/** Constructor options for {@link OsarousAdapter}: the operation-local resolution hooks the plugin owns. */
export interface OsarousAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => OsarousConnectionOptions
}

function modelInfo(provider: string, model: OsarousCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: ['text'],
  }
}

/**
 * Poll the sidecar health endpoint until it answers or `timeoutMs` elapses.
 * The health check doubles as the spawn handshake: osarous's HTTP server is
 * up before its first model is served, so an answering `/v1/models` is the
 * readiness signal the spawn wait needs. One abort listener per call, removed
 * on return.
 * @param baseURL - sidecar endpoint base.
 * @param signal - abort the poll (caller cancellation or settle timeout).
 * @param timeoutMs - overall settle budget.
 * @returns whether the sidecar answered within the budget.
 */
async function waitHealthy(baseURL: string, signal: AbortSignal, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const url = new URL('/v1/models', baseURL)
  let settle: (() => void) | undefined
  const onAbort = (): void => {
    // Resolve a pending poll sleep so the loop can observe `signal.aborted`
    // and return promptly; cancelling the timer without resolving strands it.
    settle?.()
    settle = undefined
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (signal.aborted) return false
      try {
        const resp = await fetch(url, { method: 'GET', signal })
        if (resp.ok) return true
      } catch {
        // Connection refused is the expected pre-spawn answer; keep polling.
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) return false
      await new Promise<void>((resolve) => {
        settle = resolve
        setTimeout(resolve, Math.min(250, remaining))
      })
      settle = undefined
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/**
 * The osarous `LlmAdapter`. One instance serves every model name it was
 * registered under (the harness model name IS the wire model name).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class OsarousAdapter extends LlmAdapter {
  /** The spawned sidecar process, owned by the registering plugin's fiber. */
  private serverProcess: ChildProcess | undefined

  constructor(private readonly config: OsarousAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Osarous' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const configured = connection.models.find(entry => entry.id === model)
    return Promise.resolve({
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow: configured?.contextWindow ?? connection.defaultContextWindow },
    })
  }

  /**
   * Ensure the sidecar answers, starting it when the connection says to and
   * recording the process for the plugin's dispose fiber.
   * @returns whether the sidecar is reachable; a false answer is a fail-loud
   *   outcome for the caller, never a silent fallback.
   */
  async ensureSidecar(): Promise<boolean> {
    const connection = this.config.options()
    if (!connection.autoStart) {
      return waitHealthy(connection.baseURL, AbortSignal.timeout(SPAWN_SETTLE_MS), SPAWN_SETTLE_MS)
    }
    if (await waitHealthy(connection.baseURL, AbortSignal.timeout(SPAWN_SETTLE_MS), SPAWN_SETTLE_MS)) return true
    if (this.serverProcess !== undefined && !this.serverProcess.killed) return false
    const env = {
      ...process.env,
      OSAROUS_PORT: String(DEFAULT_PORT),
    }
    // spawn's stream type is deliberately wider than the stored handle: the
    // sidecar's stdout/stderr are ignored, so only exit/kill matter.
    const child = spawn('osarous', ['serve', '--port', String(DEFAULT_PORT)], {
      env,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    this.serverProcess = child
    child.on('exit', () => {
      // The process may exit between spawn and the first healthy poll; the
      // next operation re-spawns it. The plugin's dispose fiber also calls
      // stop(), which is a no-op for an already-exited process.
      if (this.serverProcess === child) this.serverProcess = undefined
    })
    return waitHealthy(connection.baseURL, AbortSignal.timeout(SPAWN_SETTLE_MS), SPAWN_SETTLE_MS)
  }

  /** Stop the sidecar process this adapter started; a no-op when none is running. */
  stop(): void {
    const child = this.serverProcess
    if (child === undefined || child.killed) return
    child.kill('SIGTERM')
    this.serverProcess = undefined
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // One resolution per stream call: connection facts freeze here and hold
    // for this whole request, so an in-flight stream never observes a
    // configuration change and the next call re-resolves.
    const connection = this.config.options()
    if (!await this.ensureSidecar()) {
      throw new LlmError(
        `Osarous sidecar unreachable at ${connection.baseURL}; start it (osarous serve) or enable autoStart`,
        'TRANSPORT',
      )
    }
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      () => { watchdog.pulse() },
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `Osarous stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Osarous request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Osarous API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('Osarous stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: OsarousConnectionOptions,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const body = serializeRequest(options)
    // Prepared outside the try so the TRANSPORT label below covers exactly the
    // transport boundary, never a serialization failure.
    const payload = JSON.stringify(body)
    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      // The outer stream distinguishes caller cancellation and watchdog expiry.
      if (signal.aborted) throw error
      throw new LlmError(
        `Osarous API request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `Osarous API error (HTTP ${response.status})`
      try {
        const parsed = await response.json() as { error?: { message?: string } }
        if (parsed.error?.message) message = parsed.error.message
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the
        // failure, so malformed sidecar JSON must not mask it.
      }
      throw new LlmError(message, 'SERVER', { status: response.status })
    }
    if (!response.body) {
      throw new LlmError('Osarous API returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body, onComment))
  }
}
