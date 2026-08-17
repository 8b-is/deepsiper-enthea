/**
 * In-memory exact-match memoization over the `llm/stream` waterfall. An
 * identical request (same provider, model, messages, tools, and sampling
 * knobs) replays its previously streamed chunks instead of dispatching the
 * adapter again, with no persistence, no cross-request state beyond the
 * bounded cache, and no change to the chunks a caller observes — every
 * `llm/stream` listener closer to the root still sees the replayed stream
 * exactly as it saw the first one.
 *
 * The cache is opt-in (`enabled` defaults to false) and bounded by entry
 * count and estimated bytes, evicting least-recently-used entries. Only a
 * terminal successful finish (`stop`, `tool-calls`, or `max-tokens`) is
 * cached; a stream that errors, aborts, or is abandoned mid-iteration leaves
 * nothing behind. Requests carrying image content bypass the cache: their
 * attachment references are not a stable text key.
 *
 * ```yaml
 * - id: llm-memo
 *   name: '@deepseek-ai/dsh-llm-memo'
 *   config:
 *     enabled: true
 *     maxEntries: 128
 *     maxBytes: 4194304
 * ```
 *
 * @module @deepseek-ai/dsh-llm-memo
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

export const name = 'llm-memo'
export const inject = ['llm']

/** Default maximum number of cached responses. */
export const DEFAULT_MAX_ENTRIES = 128

/** Default maximum total estimated bytes across cached responses (4 MiB). */
export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024

/**
 * Plugin config. Every field is optional; `enabled` defaults to false so a
 * deployment opts into caching explicitly.
 */
export interface Config {
  /** Enable memoization; absent or false mounts the plugin as a no-op. */
  enabled?: boolean
  /** Maximum cached responses (default 128); LRU evicts beyond it. */
  maxEntries?: number
  /** Maximum total estimated bytes across cached responses (default 4 MiB). */
  maxBytes?: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  maxEntries: z.number().step(1).min(1).default(DEFAULT_MAX_ENTRIES),
  maxBytes: z.number().step(1).min(1).default(DEFAULT_MAX_BYTES),
})

/** One cached response and its estimated size, kept together so eviction never re-measures. */
interface CachedEntry {
  readonly chunks: readonly StreamChunk[]
  readonly size: number
}

/** Estimated byte size of a chunk sequence, for the byte budget only. */
function sizeOf(chunks: readonly StreamChunk[]): number {
  return JSON.stringify(chunks).length
}

/** A bounded least-recently-used store of response chunks keyed by request fingerprint. */
class MemoCache {
  private readonly entries = new Map<string, CachedEntry>()
  private bytes = 0

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  /** Fetch and refresh a cached response, or `undefined` on miss. */
  get(key: string): readonly StreamChunk[] | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.chunks
  }

  /** Store a response, then evict least-recently-used entries until both bounds hold. */
  set(key: string, chunks: readonly StreamChunk[]): void {
    const size = sizeOf(chunks)
    const existing = this.entries.get(key)
    if (existing !== undefined) {
      this.bytes -= existing.size
      this.entries.delete(key)
    }
    this.entries.set(key, { chunks, size })
    this.bytes += size
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) break
      const oldest = this.entries.get(oldestKey)
      if (oldest !== undefined) this.bytes -= oldest.size
      this.entries.delete(oldestKey)
    }
  }
}

/**
 * A stable text key for one request, or `undefined` when the request must not
 * be cached. The key covers exactly what determines the response on the wire:
 * provider, model, reasoning effort, system prompt, sampling knobs, stop
 * sequences, purpose, tools, and message role/content. `signal` (per-call
 * cancellation) and `sessionId` (model-hidden transport metadata) are excluded
 * so identical requests share one entry across sessions and calls.
 * @param options - the fully-assembled request.
 * @returns a canonical JSON key, or `undefined` to bypass the cache.
 */
function fingerprint(options: GenerateOptions): string | undefined {
  if (options.messages.some(message => message.content.some(block => block.type === 'image'))) {
    return undefined
  }
  // `JSON.stringify` omits undefined-valued keys, so optional sampling knobs
  // drop from the key exactly as they drop from the wire request.
  return JSON.stringify({
    provider: options.provider,
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    system: options.system,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    stop: options.stop,
    purpose: options.purpose,
    tools: options.tools ?? [],
    messages: options.messages.map(({ role, content }) => ({ role, content })),
  })
}

/** Terminal finish kinds whose response is a success worth caching. */
const CACHEABLE_FINISH_KINDS: ReadonlySet<string> = new Set(['stop', 'tool-calls', 'max-tokens'])

/** Whether a terminal chunk is a successful response worth caching. */
function isCacheableFinish(chunk: StreamChunk): boolean {
  return chunk.type === 'finish' && CACHEABLE_FINISH_KINDS.has(chunk.reason.kind)
}

/** Replay cached chunks, stopping early if the caller's signal aborts. */
function * replay(chunks: readonly StreamChunk[], signal?: AbortSignal): Generator<StreamChunk> {
  for (const chunk of chunks) {
    if (signal?.aborted) return
    yield chunk
  }
}

/** Adapt a sync iterable to an async iterable (for-await compatible). */
function toAsyncIterable<T>(iterable: Iterable<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = iterable[Symbol.iterator]()
      return {
        next() {
          return Promise.resolve(iterator.next())
        },
        return(value?: T) {
          if (iterator.return) {
            return Promise.resolve(iterator.return(value))
          }
          return Promise.resolve({ done: true, value: value as T })
        },
        throw(e: unknown) {
          if (iterator.throw) {
            return Promise.resolve(iterator.throw(e))
          }
          return Promise.reject(e instanceof Error ? e : new Error(String(e)))
        },
        [Symbol.asyncIterator]() {
          return this
        },
      }
    },
  }
}

/** Pass the stream through while buffering it, caching only a successful terminal finish. */
async function * teeAndCache(
  key: string,
  stream: AsyncIterable<StreamChunk>,
  cache: MemoCache,
): AsyncGenerator<StreamChunk> {
  const buffer: StreamChunk[] = []
  for await (const chunk of stream) {
    buffer.push(chunk)
    yield chunk
  }
  const last = buffer.at(-1)
  if (last !== undefined && isCacheableFinish(last)) {
    cache.set(key, buffer)
  }
}

/**
 * One `llm/stream` interception: replay on a cache hit, tee-and-cache on a
 * miss. The listener is registered without `prepend`, so it sits innermost —
 * every outer listener (stream validation, session titling, checkpoint
 * policy) still observes the replayed stream, and only the adapter dispatch is
 * skipped.
 * @param options - the assembled request.
 * @param next - the composed downstream, terminating in the adapter dispatch.
 * @param cache - the bounded response cache.
 * @returns the (possibly replayed) chunk stream.
 */
function memoize(
  options: GenerateOptions,
  next: () => AsyncIterable<StreamChunk>,
  cache: MemoCache,
): AsyncIterable<StreamChunk> {
  const key = fingerprint(options)
  if (key === undefined) return next()
  if (options.signal?.aborted) return next()
  const hit = cache.get(key)
  if (hit !== undefined) return toAsyncIterable(replay(hit, options.signal))
  return teeAndCache(key, next(), cache)
}

export function apply(ctx: Context, config: Config): void {
  const enabled = config.enabled ?? false
  if (!enabled) return
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error(`llm-memo: maxEntries must be a positive integer, got ${String(maxEntries)}`)
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error(`llm-memo: maxBytes must be a positive integer, got ${String(maxBytes)}`)
  }
  const cache = new MemoCache(maxEntries, maxBytes)
  ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) =>
    memoize(options, next, cache))
}
