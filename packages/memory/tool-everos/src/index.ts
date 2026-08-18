/**
 * Model-facing EverOS memory plugin: registers `everos_memory_add`,
 * `everos_memory_flush`, and `everos_memory_search`, which store conversation
 * messages in a local EverOS server, force boundary extraction for a session,
 * and retrieve episodes, profiles, agent cases, and agent skills. All requests
 * go through {@link EverosClient}; the server base URL, default app/project
 * scope, and request timeout are deployment config.
 * @module @deepseek-ai/dsh-tool-everos
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { EverosClient, EverosError } from './client.ts'
import type {
  EverosConfig,
  EverosMessage,
  EverosSearchRenderValue,
} from './types.ts'

export const name = 'tool-everos'
export const inject = ['tools']

/**
 * Deployment configuration of the EverOS memory tools. `baseURL` is
 * required (there is no safe default host); app/project scope and the
 * per-request timeout have defaults.
 */
export const Config: z<EverosConfig> = z.object({
  baseURL: z.string().required(),
  appId: z.string().default('default'),
  projectId: z.string().default('default'),
  timeoutMs: z.natural().min(1).default(15000),
})

/** Fixed bound on the `messages` array of `everos_memory_add` (EverOS wire limit). */
const MAX_MESSAGES = 500

/** Fixed bound on the number of render lines of `everos_memory_search`. */
const MAX_RENDER_ITEMS = 10

/**
 * Validate a wire-bound constraint the tool schema cannot express and return
 * the canonical message content: non-empty `sender_id`, positive epoch
 * milliseconds `timestamp`, and a non-empty content value. The registry has
 * already enforced the union and enum shapes; the checks below reject values
 * that would make an EverOS `messages` payload fail server-side.
 * @param messages - the model-supplied messages, already schema-checked.
 * @returns the validated messages.
 */
function toEverosMessages(messages: EverosMessage[]): EverosMessage[] {
  if (messages.length === 0) {
    throw new Error('everos_memory_add: `messages` must contain at least one message')
  }
  if (messages.length > MAX_MESSAGES) {
    throw new Error(`everos_memory_add: at most ${MAX_MESSAGES} messages per call (got ${messages.length})`)
  }
  for (const message of messages) {
    if (message.sender_id.trim().length === 0) {
      throw new Error('everos_memory_add: every `sender_id` must be a non-empty string')
    }
    if (!Number.isInteger(message.timestamp) || message.timestamp <= 0) {
      throw new Error('everos_memory_add: every `timestamp` must be a positive integer (Unix epoch milliseconds)')
    }
    if (typeof message.content === 'string' && message.content.trim().length === 0) {
      throw new Error('everos_memory_add: every message `content` must be a non-empty string')
    }
  }
  return messages
}

/**
 * Validate the search ranking bounds the tool schema cannot express: `top_k`
 * is `-1` or in `1..100`, and `radius` / `min_score` stay in `[0, 1]`.
 * @param args - the model-supplied search args, already schema-checked.
 */
function validateSearchBounds(args: { top_k?: number; radius?: number; min_score?: number }): void {
  const { top_k, radius, min_score } = args
  if (top_k !== undefined && top_k !== -1 && (top_k < 1 || top_k > 100)) {
    throw new Error('everos_memory_search: `top_k` must be -1 (all) or an integer in 1..100')
  }
  for (const [key, value] of [['radius', radius], ['min_score', min_score]] as const) {
    if (value !== undefined && (value < 0 || value > 1)) {
      throw new Error(`everos_memory_search: \`${key}\` must be a number in 0..1`)
    }
  }
}

/**
 * Map an operation failure to the registry's canonical tool-call error
 * vocabulary: aborts surface as the canonical cancellation classification,
 * every other failure as a plain error with the EverOS detail.
 * @param error - the failure raised by the client or caller signal.
 * @throws the error to propagate from the tool executor.
 */
function toToolError(error: unknown): never {
  if (error instanceof Error && error.name === 'AbortError') {
    const aborted = new HarnessError('tool call aborted', TOOL_ABORTED)
    aborted.name = 'AbortError'
    throw aborted
  }
  if (error instanceof EverosError || error instanceof Error) {
    throw error
  }
  throw new Error(String(error))
}

/**
 * Register the `everos_memory_add`, `everos_memory_flush`, and
 * `everos_memory_search` tools on `ctx.tools`. All requests target the
 * configured EverOS server; a deployment pointing at an unreachable or
 * non-EverOS base URL fails loud at the first call.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - the deployment's EverOS server configuration.
 */
export function apply(ctx: Context, config: EverosConfig): void {
  const client = new EverosClient(config)

  ctx.tools.register(defineTool({
    name: 'everos_memory_add',
    description: 'Store conversation messages in the local EverOS memory server. '
      + 'Messages accumulate in the session buffer until boundary detection extracts them; '
      + 'call everos_memory_flush to force extraction. Store the CURRENT conversation turn '
      + 'here when it contains durable facts, preferences, or decisions worth remembering. '
      + '`defer_extraction: true` persists the buffer without extracting — useful for a '
      + 'still-open conversation you do not want carved into episodes yet.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'The conversation session the messages belong to.',
      },
      messages: {
        type: 'array',
        required: true,
        description: '1..500 messages to store, in chronological order. `timestamp` is Unix epoch in milliseconds; `sender_id` identifies the speaker (e.g. a user id or the agent name).',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sender_id: { type: 'string', required: true, description: 'Who sent the message; also becomes the memory owner for user-memory searches.' },
            sender_name: { type: 'string', description: 'Display name of the sender.' },
            role: { type: 'string', required: true, enum: ['user', 'assistant', 'tool'], description: 'user | assistant | tool.' },
            timestamp: { type: 'integer', required: true, description: 'Message time as Unix epoch milliseconds.' },
            content: {
              oneOf: [
                { type: 'string', description: 'Plain-text message content.' },
                { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                  type: { type: 'string', required: true, enum: ['text', 'image', 'audio', 'doc', 'pdf', 'html', 'email'], description: 'Content piece kind.' },
                  text: { type: 'string', description: 'Text payload.' },
                  uri: { type: 'string', description: 'Reference URI for non-text pieces.' },
                  base64: { type: 'string', description: 'Inline base64 payload.' },
                  ext: { type: 'string', description: 'File extension hint.' },
                  name: { type: 'string', description: 'Piece name.' },
                } }, description: 'Multimodal content pieces.' },
              ],
              required: true,
              description: 'Message text, or multimodal content pieces.',
            },
            tool_calls: {
              type: 'array',
              items: { type: 'object', additionalProperties: false, properties: {
                id: { type: 'string', required: true },
                type: { type: 'string' },
                function: { type: 'object', additionalProperties: false, required: true, properties: {
                  name: { type: 'string', required: true },
                  arguments: { type: 'string', required: true, description: 'Arguments as a JSON string.' },
                } },
              } },
              description: 'Function calls made by an assistant message.',
            },
            tool_call_id: { type: 'string', description: 'The tool call this tool-result message answers.' },
          },
        },
      },
      app_id: { type: 'string', description: 'Overrides the configured default app scope.' },
      project_id: { type: 'string', description: 'Overrides the configured default project scope.' },
      defer_extraction: { type: 'boolean', description: 'Persist to the buffer without running boundary detection or extraction.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          request_id: { type: 'string', required: true },
          message_count: { type: 'integer', required: true },
          status: { type: 'string', required: true, enum: ['accumulated', 'extracted'] },
        },
      },
      render: (_args, value: { request_id: string; message_count: number; status: string }) => [{
        type: 'text',
        text: `Stored ${value.message_count} message(s): ${value.status === 'extracted' ? 'extracted into memory' : 'accumulated in buffer'}.`,
      }],
    },
    async execute(args: {
      session_id: string
      messages: EverosMessage[]
      app_id?: string
      project_id?: string
      defer_extraction?: boolean
    }, exec) {
      return client.add(
        args.session_id,
        toEverosMessages(args.messages),
        {
          ...args.app_id !== undefined ? { appId: args.app_id } : {},
          ...args.project_id !== undefined ? { projectId: args.project_id } : {},
          ...args.defer_extraction !== undefined ? { deferExtraction: args.defer_extraction } : {},
        },
        exec.signal,
      ).catch(toToolError)
    },
    presentCall: (args: { session_id: string; messages: unknown[] }) => ({
      card: 'generic',
      title: 'Store messages in EverOS memory',
      kind: 'other',
      rawInput: { session_id: args.session_id, message_count: args.messages.length },
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'everos_memory_flush',
    description: 'Force boundary detection over a session buffer in the local EverOS memory server. '
      + 'Extracts durable facts, episodes, and agent cases from the accumulated messages and commits '
      + 'them to Markdown. Call it when a conversation has reached a natural end (task finished, '
      + 'session closing) so its content becomes searchable; a session without accumulated messages '
      + 'reports `no_extraction`.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'The conversation session to flush.',
      },
      app_id: { type: 'string', description: 'Overrides the configured default app scope.' },
      project_id: { type: 'string', description: 'Overrides the configured default project scope.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          request_id: { type: 'string', required: true },
          status: { type: 'string', required: true, enum: ['extracted', 'no_extraction'] },
        },
      },
      render: (_args, value: { request_id: string; status: string }) => [{
        type: 'text',
        text: `Flushed session: ${value.status === 'extracted' ? 'extracted into memory' : 'no extraction (buffer was empty)'}.`,
      }],
    },
    async execute(args: { session_id: string; app_id?: string; project_id?: string }, exec) {
      return client.flush(
        args.session_id,
        {
          ...args.app_id !== undefined ? { appId: args.app_id } : {},
          ...args.project_id !== undefined ? { projectId: args.project_id } : {},
        },
        exec.signal,
      ).catch(toToolError)
    },
    presentCall: (args: { session_id: string }) => ({
      card: 'generic',
      title: 'Flush EverOS memory session',
      kind: 'other',
      rawInput: args,
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'everos_memory_search',
    description: 'Search the local EverOS memory server for stored conversation memory. '
      + 'Provide EXACTLY ONE of `user_id` (user memory: episodes and profiles) or `agent_id` '
      + '(agent memory: cases and skills). Use `method: keyword` for exact-fact lookups without '
      + 'vector or LLM costs; `hybrid` (default) fuses keyword and vector recall; `agentic` '
      + 'delegates the recall strategy to the server. `filters` accepts an EverOS filters DSL '
      + 'object, e.g. {"session_id": "sess-1"} to scope to one session.',
    parameters: {
      user_id: { type: 'string', description: 'Owner of user memory (episodes, profiles). Exactly one of user_id / agent_id is required.' },
      agent_id: { type: 'string', description: 'Owner of agent memory (cases, skills). Exactly one of user_id / agent_id is required.' },
      query: {
        type: 'string',
        required: true,
        description: 'What to recall — a fact, decision, or capability; the server retrieves the closest stored memory.',
      },
      method: { type: 'string', enum: ['keyword', 'vector', 'hybrid', 'agentic'], description: 'Retrieval method (default hybrid).' },
      top_k: { type: 'integer', description: '-1 for all, or 1..100; default -1.' },
      radius: { type: 'number', description: 'Cosine-similarity floor in 0..1 applied at recall time.' },
      min_score: { type: 'number', description: 'Post-fusion relevance floor in 0..1 for episode hybrid retrieval.' },
      include_profile: { type: 'boolean', description: 'Also return the owner profile (user memory).' },
      enable_llm_rerank: { type: 'boolean', description: 'Opt-in LLM rerank of agent cases and skills (needs a configured EverOS LLM).' },
      filters: {
        type: 'object',
        additionalProperties: true,
        description: 'EverOS filters DSL: recursive {"AND": [...]} / {"OR": [...]} nodes mixed with scalar fields like {"session_id": "sess-1"}.',
      },
      app_id: { type: 'string', description: 'Overrides the configured default app scope.' },
      project_id: { type: 'string', description: 'Overrides the configured default project scope.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          request_id: { type: 'string', required: true },
          episodes: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true },
            user_id: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            app_id: { type: 'string', required: true },
            project_id: { type: 'string', required: true },
            session_id: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            timestamp: { type: 'string', required: true },
            sender_ids: { type: 'array', required: true, items: { type: 'string' } },
            summary: { type: 'string', required: true },
            subject: { type: 'string', required: true },
            episode: { type: 'string', required: true },
            type: { type: 'string', required: true, enum: ['Conversation'] },
            score: { type: 'number', required: true },
            atomic_facts: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
              id: { type: 'string', required: true },
              content: { type: 'string', required: true },
              score: { type: 'number', required: true },
            } } },
          } } },
          profiles: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true },
            user_id: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            app_id: { type: 'string', required: true },
            project_id: { type: 'string', required: true },
            profile_data: { type: 'json', required: true },
            score: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          } } },
          agent_cases: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true },
            agent_id: { type: 'string', required: true },
            app_id: { type: 'string', required: true },
            project_id: { type: 'string', required: true },
            session_id: { type: 'string', required: true },
            task_intent: { type: 'string', required: true },
            approach: { type: 'string', required: true },
            quality_score: { type: 'number', required: true },
            key_insight: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            timestamp: { type: 'string', required: true },
            score: { type: 'number', required: true },
          } } },
          agent_skills: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true },
            agent_id: { type: 'string', required: true },
            app_id: { type: 'string', required: true },
            project_id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            description: { type: 'string', required: true },
            content: { type: 'string', required: true },
            confidence: { type: 'number', required: true },
            maturity_score: { type: 'number', required: true },
            source_case_ids: { type: 'array', required: true, items: { type: 'string' } },
            score: { type: 'number', required: true },
          } } },
          unprocessed_messages: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true },
            app_id: { type: 'string', required: true },
            project_id: { type: 'string', required: true },
            session_id: { type: 'string', required: true },
            sender_id: { type: 'string', required: true },
            sender_name: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
            role: { type: 'string', required: true, enum: ['user', 'assistant', 'tool'] },
            content: { type: 'json', required: true },
            tool_calls: { oneOf: [{ type: 'array', items: { type: 'json' } }, { type: 'null' }], required: true },
            tool_call_id: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          } } },
        },
      },
      render: (_args, value: EverosSearchRenderValue) => {
        const lines: string[] = []
        for (const episode of value.episodes.slice(0, MAX_RENDER_ITEMS)) {
          lines.push(`episode [${episode.score.toFixed(2)}] ${episode.summary}`)
        }
        for (const skill of value.agent_skills.slice(0, MAX_RENDER_ITEMS)) {
          lines.push(`skill [${skill.confidence.toFixed(2)}] ${skill.name}: ${skill.description}`)
        }
        for (const agentCase of value.agent_cases.slice(0, MAX_RENDER_ITEMS)) {
          lines.push(`case [${agentCase.score.toFixed(2)}] ${agentCase.task_intent}`)
        }
        const remaining = value.episodes.length + value.agent_skills.length + value.agent_cases.length - lines.length
        if (remaining > 0) lines.push(`… ${remaining} more hit(s)`)
        return [{
          type: 'text',
          text: lines.length > 0
            ? `${value.episodes.length} episode(s), ${value.agent_skills.length} skill(s), ${value.agent_cases.length} case(s):\n${lines.join('\n')}`
            : 'No memory hits.',
        }]
      },
    },
    async execute(args: {
      user_id?: string
      agent_id?: string
      query: string
      method?: 'keyword' | 'vector' | 'hybrid' | 'agentic'
      top_k?: number
      radius?: number
      min_score?: number
      include_profile?: boolean
      enable_llm_rerank?: boolean
      filters?: Record<string, unknown>
      app_id?: string
      project_id?: string
    }, exec) {
      validateSearchBounds(args)
      const result = await client.search(
        args.user_id !== undefined
          ? { userId: args.user_id }
          : args.agent_id !== undefined
            ? { agentId: args.agent_id }
            : {},
        {
          query: args.query,
          ...(args.method !== undefined ? { method: args.method } : {}),
          ...(args.top_k !== undefined ? { top_k: args.top_k } : {}),
          ...(args.radius !== undefined ? { radius: args.radius } : {}),
          ...(args.min_score !== undefined ? { min_score: args.min_score } : {}),
          ...(args.include_profile !== undefined ? { include_profile: args.include_profile } : {}),
          ...(args.enable_llm_rerank !== undefined ? { enable_llm_rerank: args.enable_llm_rerank } : {}),
          ...(args.filters !== undefined ? { filters: args.filters } : {}),
        },
        {
          ...args.app_id !== undefined ? { appId: args.app_id } : {},
          ...args.project_id !== undefined ? { projectId: args.project_id } : {},
        },
        exec.signal,
      ).catch(toToolError)
      return { request_id: result.request_id, ...result.data }
    },
    presentCall: (args: { query: string; user_id?: string; agent_id?: string }) => ({
      card: 'generic',
      title: 'Search EverOS memory',
      kind: 'other',
      rawInput: { query: args.query, user_id: args.user_id, agent_id: args.agent_id },
    }),
  }))
}
