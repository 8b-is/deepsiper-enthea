/**
 * REST client for a local EverOS server. Thin typed wrapper over the
 * `/api/v2/memory/{add,flush,search}` endpoints: builds the wire payload,
 * enforces the per-request timeout, and validates the response envelope at
 * the wire boundary with zod. `fetch` is injectable for tests.
 * @module @deepseek-ai/dsh-tool-everos/client
 */

import z from 'zod'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type {
  EverosAddResult,
  EverosConfig,
  EverosFlushResult,
  EverosMessage,
  EverosSearchRequest,
  EverosSearchResult,
} from './types.ts'

/** Error raised for any non-200 EverOS response or invalid response payload. */
export class EverosError extends Error {
  /** HTTP status of the failing response, or `null` for invalid payloads. */
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'EverosError'
    this.status = status
  }
}

/** Wire schema of `response.data` of `POST /api/v2/memory/add`. */
const addDataSchema = z.object({
  message_count: z.number().int().nonnegative(),
  status: z.enum(['accumulated', 'extracted']),
})

/** Wire schema of `response.data` of `POST /api/v2/memory/flush`. */
const flushDataSchema = z.object({
  status: z.enum(['extracted', 'no_extraction']),
})

/** Wire schema of one episode hit of `POST /api/v2/memory/search`. */
const episodeSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  app_id: z.string(),
  project_id: z.string(),
  session_id: z.string().nullable(),
  timestamp: z.string(),
  sender_ids: z.array(z.string()),
  summary: z.string(),
  subject: z.string(),
  episode: z.string(),
  type: z.literal('Conversation'),
  score: z.number(),
  atomic_facts: z.array(z.object({
    id: z.string(),
    content: z.string(),
    score: z.number(),
  })),
})

/** Wire schema of one profile hit of `POST /api/v2/memory/search`. */
const profileSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  app_id: z.string(),
  project_id: z.string(),
  profile_data: z.record(z.string(), z.unknown()) as z.ZodType<Record<string, JsonValue>>,
  score: z.number().nullable(),
})

/** Wire schema of one agent case hit of `POST /api/v2/memory/search`. */
const agentCaseSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  app_id: z.string(),
  project_id: z.string(),
  session_id: z.string(),
  task_intent: z.string(),
  approach: z.string(),
  quality_score: z.number(),
  key_insight: z.string().nullable(),
  timestamp: z.string(),
  score: z.number(),
})

/** Wire schema of one agent skill hit of `POST /api/v2/memory/search`. */
const agentSkillSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  app_id: z.string(),
  project_id: z.string(),
  name: z.string(),
  description: z.string(),
  content: z.string(),
  confidence: z.number(),
  maturity_score: z.number(),
  source_case_ids: z.array(z.string()),
  score: z.number(),
})

/** Wire schema of one unprocessed message of `POST /api/v2/memory/search`. */
const unprocessedMessageSchema = z.object({
  id: z.string(),
  app_id: z.string(),
  project_id: z.string(),
  session_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string().nullable(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]) as z.ZodType<string | JsonValue[]>,
  timestamp: z.string(),
  tool_calls: z.array(z.unknown()).nullable() as z.ZodType<JsonValue[] | null>,
  tool_call_id: z.string().nullable(),
})

/** Wire schema of `response.data` of `POST /api/v2/memory/search`. */
const searchDataSchema = z.object({
  episodes: z.array(episodeSchema),
  profiles: z.array(profileSchema),
  agent_cases: z.array(agentCaseSchema),
  agent_skills: z.array(agentSkillSchema),
  unprocessed_messages: z.array(unprocessedMessageSchema),
})

/** Wire schema of the shared `{ request_id, data }` success envelope. */
const envelopeSchema = <T extends z.ZodType>(data: T) =>
  z.object({ request_id: z.string(), data })

/**
 * Parse a response payload against a wire schema, mapping failures to {@link EverosError}.
 * @param path - API path the payload came from, for the error message.
 * @param schema - wire schema of the payload.
 * @param payload - parsed JSON response body.
 * @returns the validated payload, statically typed by the schema.
 */
function parseEnvelope<T>(path: string, schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    const detail = result.error.issues.map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')
    throw new EverosError(`everos ${path} returned an invalid response: ${detail}`, null)
  }
  return result.data
}

/**
 * REST client over the EverOS `/api/v2` memory endpoints.
 *
 * All methods reject with {@link EverosError} on non-200 statuses or invalid
 * response payloads; an aborted or timed-out request rejects with the
 * underlying `AbortError`.
 */
export class EverosClient {
  readonly #baseURL: string
  readonly #defaultAppId: string
  readonly #defaultProjectId: string
  readonly #timeoutMs: number
  readonly #fetchImpl: typeof fetch

  /**
   * @param config - base URL, default app/project scope, and timeout.
   * @param fetchImpl - fetch implementation; defaults to the global fetch.
   */
  constructor(config: EverosConfig, fetchImpl: typeof fetch = globalThis.fetch) {
    this.#baseURL = config.baseURL.replace(/\/+$/, '')
    this.#defaultAppId = config.appId
    this.#defaultProjectId = config.projectId
    this.#timeoutMs = config.timeoutMs
    this.#fetchImpl = fetchImpl
  }

  /**
   * Issue one `POST /api/v2/memory/<path>` request.
   * @param path - API path below `/api/v2`.
   * @param body - JSON request payload.
   * @param signal - caller cancellation signal, combined with the timeout.
   * @returns the parsed JSON response.
   */
  async #post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    const onAbort = (): void => { controller.abort(signal.reason) }
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(() => { controller.abort(new Error(`everos ${path} timed out after ${this.#timeoutMs}ms`)) }, this.#timeoutMs)
    try {
      const response = await this.#fetchImpl(`${this.#baseURL}/api/v2/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) {
        throw new EverosError(`everos ${path} failed: HTTP ${response.status} ${text.slice(0, 512)}`, response.status)
      }
      return JSON.parse(text)
    } catch (error) {
      if (error instanceof EverosError) throw error
      if (error instanceof SyntaxError) {
        throw new EverosError(`everos ${path} returned an invalid response: ${error.message}`, null)
      }
      throw error
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
  }

  /**
   * Store messages via `POST /api/v2/memory/add`.
   * @param sessionId - the session whose buffer receives the messages.
   * @param messages - messages to store (1..500).
   * @param options - app/project scope overrides and defer-extraction flag.
   * @param signal - caller cancellation signal.
   * @returns the message count and extraction status.
   */
  async add(
    sessionId: string,
    messages: EverosMessage[],
    options: { appId?: string; projectId?: string; deferExtraction?: boolean } = {},
    signal: AbortSignal,
  ): Promise<EverosAddResult> {
    const payload = await this.#post('memory/add', {
      session_id: sessionId,
      app_id: options.appId ?? this.#defaultAppId,
      project_id: options.projectId ?? this.#defaultProjectId,
      messages,
      ...options.deferExtraction === undefined ? {} : { defer_extraction: options.deferExtraction },
    }, signal)
    const envelope = parseEnvelope('memory/add', envelopeSchema(addDataSchema), payload)
    return { request_id: envelope.request_id, ...envelope.data }
  }

  /**
   * Force boundary detection for a session via `POST /api/v2/memory/flush`.
   * @param sessionId - the session whose buffer is committed.
   * @param options - app/project scope overrides.
   * @param signal - caller cancellation signal.
   * @returns whether extraction ran (`extracted`) or the buffer was empty (`no_extraction`).
   */
  async flush(
    sessionId: string,
    options: { appId?: string; projectId?: string } = {},
    signal: AbortSignal,
  ): Promise<EverosFlushResult> {
    const payload = await this.#post('memory/flush', {
      session_id: sessionId,
      app_id: options.appId ?? this.#defaultAppId,
      project_id: options.projectId ?? this.#defaultProjectId,
    }, signal)
    const envelope = parseEnvelope('memory/flush', envelopeSchema(flushDataSchema), payload)
    return { request_id: envelope.request_id, ...envelope.data }
  }

  /**
   * Hybrid retrieval via `POST /api/v2/memory/search`.
   * @param owner - the memory owner: exactly one of `userId` / `agentId` is set.
   * @param request - search query, method, ranking bounds, and filters.
   * @param options - app/project scope overrides.
   * @param signal - caller cancellation signal.
   * @returns the typed search data (episodes, profiles, agent cases/skills).
   */
  async search(
    owner: { userId?: string; agentId?: string },
    request: EverosSearchRequest,
    options: { appId?: string; projectId?: string } = {},
    signal: AbortSignal,
  ): Promise<EverosSearchResult> {
    const userId = owner.userId
    const agentId = owner.agentId
    if ((userId === undefined) === (agentId === undefined)) {
      throw new Error('everos memory/search: exactly one of `user_id` / `agent_id` must be provided')
    }
    const payload = await this.#post('memory/search', {
      ...userId !== undefined ? { user_id: userId } : {},
      ...agentId !== undefined ? { agent_id: agentId } : {},
      app_id: options.appId ?? this.#defaultAppId,
      project_id: options.projectId ?? this.#defaultProjectId,
      query: request.query,
      method: request.method ?? 'hybrid',
      top_k: request.top_k ?? -1,
      ...request.radius === undefined ? {} : { radius: request.radius },
      ...request.min_score === undefined ? {} : { min_score: request.min_score },
      include_profile: request.include_profile ?? false,
      enable_llm_rerank: request.enable_llm_rerank ?? false,
      ...request.filters === undefined ? {} : { filters: request.filters },
    }, signal)
    const envelope = parseEnvelope('memory/search', envelopeSchema(searchDataSchema), payload)
    return { request_id: envelope.request_id, data: envelope.data }
  }
}
