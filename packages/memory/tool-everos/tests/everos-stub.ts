/**
 * Deterministic in-memory EverOS stub for tool-everos tests.
 *
 * Implements the subset of the EverOS `/api/v2` memory API the client uses:
 * `POST /memory/add` accumulates messages per session, `POST /memory/flush`
 * reports extraction, and `POST /memory/search` returns one episode per
 * session that received messages (summary = first stored message content,
 * truncated). A per-test handler can override any path to script failures
 * or malformed payloads.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

interface StoredMessage {
  sender_id: string
  role: string
  content: unknown
}

interface Episode {
  id: string
  user_id: string | null
  app_id: string
  project_id: string
  session_id: string
  timestamp: string
  sender_ids: string[]
  summary: string
  subject: string
  episode: string
  type: 'Conversation'
  score: number
  atomic_facts: Array<{ id: string; content: string; score: number }>
}

/** Scripted response for one path, overriding the in-memory behavior. */
export interface ScriptedResponse {
  status?: number
  body?: unknown
}

export class EverosStubServer {
  readonly sessions = new Map<string, StoredMessage[]>()
  readonly requests: Array<{ path: string; body: unknown }> = []
  /** Per-path override; return a response to skip the in-memory behavior. */
  scripted: (path: string, body: unknown) => ScriptedResponse | undefined = () => undefined
  /** Artificial delay in milliseconds applied to every response. */
  delayMs = 0
  #server: Server | null = null
  #port = 0
  #requestCounter = 0

  get url(): string {
    return `http://127.0.0.1:${this.#port}`
  }

  start(): Promise<void> {
    this.#server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        const path = req.url ?? ''
        const body = raw.length === 0 ? null : JSON.parse(raw) as unknown
        this.requests.push({ path, body })
        const scripted = this.scripted(path, body)
        if (scripted !== undefined) {
          const status = scripted.status ?? 200
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(scripted.body))
          return
        }
        setTimeout(() => { this.#respond(path, body, res) }, this.delayMs)
      })
    })
    return new Promise((resolve) => {
      this.#server?.listen(0, '127.0.0.1', () => {
        const address = this.#server?.address() as AddressInfo
        this.#port = address.port
        resolve()
      })
    })
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.#server?.close(() => { resolve() })
      this.#server = null
    })
  }

  /** Next `request_id` the stub will emit (monotonic). */
  nextRequestId(): string {
    return `req-${++this.#requestCounter}`
  }

  #episodes(): Episode[] {
    const episodes: Episode[] = []
    for (const [sessionId, messages] of this.sessions) {
      if (messages.length === 0) continue
      const first = messages[0]!
      const summary = typeof first.content === 'string' ? first.content.slice(0, 200) : '[multimodal]'
      episodes.push({
        id: `ep-${episodes.length + 1}`,
        user_id: first.sender_id,
        app_id: 'default',
        project_id: 'default',
        session_id: sessionId,
        timestamp: '2026-01-01T00:00:00Z',
        sender_ids: [...new Set(messages.map(m => m.sender_id))],
        summary,
        subject: summary.slice(0, 40),
        episode: summary,
        type: 'Conversation',
        score: 0.9,
        atomic_facts: [],
      })
    }
    return episodes
  }

  #respond(path: string, body: unknown, res: import('node:http').ServerResponse): void {
    const write = (payload: unknown, status = 200): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if (path === '/api/v2/memory/add') {
      const add = body as { session_id: string; messages: StoredMessage[] }
      const existing = this.sessions.get(add.session_id) ?? []
      existing.push(...add.messages)
      this.sessions.set(add.session_id, existing)
      write({ request_id: this.nextRequestId(), data: { message_count: add.messages.length, status: 'accumulated' } })
      return
    }
    if (path === '/api/v2/memory/flush') {
      const flush = body as { session_id: string }
      const buffered = (this.sessions.get(flush.session_id) ?? []).length
      write({ request_id: this.nextRequestId(), data: { status: buffered > 0 ? 'extracted' : 'no_extraction' } })
      return
    }
    if (path === '/api/v2/memory/search') {
      write({
        request_id: this.nextRequestId(),
        data: {
          episodes: this.#episodes(),
          profiles: [],
          agent_cases: [],
          agent_skills: [],
          unprocessed_messages: [],
        },
      })
      return
    }
    write({ detail: `unhandled stub path ${path}` }, 404)
  }
}
