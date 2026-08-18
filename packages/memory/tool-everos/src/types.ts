/**
 * Wire and configuration types for `@deepseek-ai/dsh-tool-everos`.
 *
 * Field names follow the EverOS REST API (evermind.ai): snake_case on the
 * wire is intentional and must not be renamed client-side.
 * @module @deepseek-ai/dsh-tool-everos/types
 */

import type { JsonValue } from '@deepseek-ai/dsh-tools'

/** Deployment configuration for the EverOS memory tools. */
export interface EverosConfig {
  /** Base URL of a running EverOS server, e.g. `http://127.0.0.1:8000`. */
  baseURL: string
  /** Default `app_id` for requests whose args do not override it. */
  appId: string
  /** Default `project_id` for requests whose args do not override it. */
  projectId: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
}

/** Role of a stored message, per the EverOS message DTO. */
export type EverosRole = 'user' | 'assistant' | 'tool'

/** One content piece of a multimodal message, per the EverOS content DTO. */
export interface EverosContentItem {
  type: 'text' | 'image' | 'audio' | 'doc' | 'pdf' | 'html' | 'email'
  text?: string
  uri?: string
  base64?: string
  ext?: string
  name?: string
  extras?: Record<string, unknown>
}

/** Function-call payload of a tool message, per the EverOS tool-call DTO. */
export interface EverosToolCall {
  id: string
  type?: string
  function: {
    name: string
    /** JSON string per the OpenAI Chat Completions spec. */
    arguments: string
  }
}

/** One message stored via `POST /api/v2/memory/add`. */
export interface EverosMessage {
  sender_id: string
  sender_name?: string
  role: EverosRole
  /** Message event time as Unix epoch in milliseconds. */
  timestamp: number
  content: string | EverosContentItem[]
  tool_calls?: EverosToolCall[]
  tool_call_id?: string
}

/** Result of `POST /api/v2/memory/add`. */
export interface EverosAddResult {
  request_id: string
  message_count: number
  status: 'accumulated' | 'extracted'
}

/** Result of `POST /api/v2/memory/flush`. */
export interface EverosFlushResult {
  request_id: string
  status: 'extracted' | 'no_extraction'
}

/** Filters DSL node for `everos_memory_search` (recursive AND/OR + scalar fields). */
export interface EverosFilters {
  AND?: EverosFilters[]
  OR?: EverosFilters[]
  [key: string]: unknown
}

/** Body of `POST /api/v2/memory/search`. */
export interface EverosSearchRequest {
  query: string
  method?: 'keyword' | 'vector' | 'hybrid' | 'agentic'
  /** `-1` (all) or `1..100`. */
  top_k?: number
  radius?: number
  min_score?: number
  include_profile?: boolean
  enable_llm_rerank?: boolean
  filters?: EverosFilters
}

/** Episode hit, always user-scoped. */
export interface EverosEpisode {
  id: string
  user_id: string | null
  app_id: string
  project_id: string
  session_id: string | null
  timestamp: string
  sender_ids: string[]
  summary: string
  subject: string
  episode: string
  type: 'Conversation'
  score: number
  atomic_facts: Array<{ id: string; content: string; score: number }>
}

/** Owner profile hit, at most one per response. */
export interface EverosProfile {
  id: string
  user_id: string | null
  app_id: string
  project_id: string
  profile_data: Record<string, JsonValue>
  score: number | null
}

/** Agent case hit, always agent-scoped. */
export interface EverosAgentCase {
  id: string
  agent_id: string
  app_id: string
  project_id: string
  session_id: string
  task_intent: string
  approach: string
  quality_score: number
  key_insight: string | null
  timestamp: string
  score: number
}

/** Agent skill hit, always agent-scoped. */
export interface EverosAgentSkill {
  id: string
  agent_id: string
  app_id: string
  project_id: string
  name: string
  description: string
  content: string
  confidence: number
  maturity_score: number
  source_case_ids: string[]
  score: number
}

/** Unprocessed message still in the boundary-detection buffer. */
export interface EverosUnprocessedMessage {
  id: string
  app_id: string
  project_id: string
  session_id: string
  sender_id: string
  sender_name: string | null
  role: EverosRole
  content: string | JsonValue[]
  timestamp: string
  tool_calls: JsonValue[] | null
  tool_call_id: string | null
}

/** Body of `response.data` of `POST /api/v2/memory/search`. */
export interface EverosSearchData {
  episodes: EverosEpisode[]
  profiles: EverosProfile[]
  agent_cases: EverosAgentCase[]
  agent_skills: EverosAgentSkill[]
  unprocessed_messages: EverosUnprocessedMessage[]
}

/** Result of `POST /api/v2/memory/search`. */
export interface EverosSearchResult {
  request_id: string
  data: EverosSearchData
}

/** Model-facing render projection of one `everos_memory_search` result. */
export interface EverosSearchRenderValue {
  episodes: Array<{ score: number; summary: string }>
  agent_skills: Array<{ confidence: number; name: string; description: string }>
  agent_cases: Array<{ score: number; task_intent: string }>
}
