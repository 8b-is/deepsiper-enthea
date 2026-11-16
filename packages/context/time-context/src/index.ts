/**
 * Opt-in request clock context. Eligible steps add durable,
 * source-attributed time readings to the request history.
 *
 * @module @deepseek-ai/dsh-time-context
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { deriveBrowserTimeZoneContext } from './request-zone.ts'
import {
  findMem8, lastContextExcerpt, memoryKeywords, renderMem8,
} from './mem8.ts'
import { createTimestampFormatter, formatTimestamp } from './timestamp.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'time-context'

/** The agent registry that owns pre-step processing. */
export const inject = ['agents']

/** Request-preparation clock formatting and append scheduling. Invalid values fail plugin load. */
export interface Config {
  /** Fallback display zone when the open turn has no unique browser zone. Omit to use the process zone. */
  timeZone?: string
  /** Minimum milliseconds between durable injections in one session. Omit or set to 0 to inject at every eligible step. */
  refreshIntervalMs?: number
  /** Smart Tree executable used for a bounded MEM|8 lookup. Omit to inject keywords and last context only. */
  memoryCommand?: string
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  timeZone: z.string(),
  refreshIntervalMs: z.number(),
  memoryCommand: z.string(),
})

/** Plain text from one message, ignoring non-text blocks. */
function messageText(message: UserMessage): string {
  return message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(' ')
}

/** Find this plugin's latest durable injection, including a shadowed surface event. */
function latestInjectionTime(agent: Agent): number | undefined {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === name) {
      return event.time
    }
  }
  return undefined
}

/** Collect already-entered and proposed user messages belonging to one open turn. */
function requestMessages(agent: Agent, turn: number, proposed: readonly UserMessage[]): UserMessage[] {
  const start = agent.session.events.findLastIndex(
    event => event.type === 'turn/start' && event.data.turn === turn,
  )
  const entered = start < 0
    ? []
    : agent.session.events.slice(start + 1)
      .flatMap(event => event.type === 'user/message' ? [event.data] : [])
  return [...entered, ...proposed]
}

/** ISO 8601 local time with a numeric offset. The zone name is not repeated. */
function standardTime(now: number, formatter: Intl.DateTimeFormat, timeZone: string): string {
  return formatTimestamp(now, formatter, timeZone).replace(/\[[^\]]+\]$/, '')
}

/** Reject refresh intervals that cannot represent an exact elapsed-millisecond threshold. */
function validateRefreshInterval(refreshIntervalMs: number | undefined): void {
  if (refreshIntervalMs !== undefined && (
    !Number.isSafeInteger(refreshIntervalMs)
    || refreshIntervalMs < 0
  )) {
    throw new TypeError(
      `time-context: refreshIntervalMs must be a non-negative safe integer, got ${String(refreshIntervalMs)}`,
    )
  }
}

/**
 * Register a prepended pre-step listener for the lifetime of `ctx`.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param config - time zone and durable refresh scheduling configuration.
 * @throws when the refresh interval is invalid or the configured or process time zone cannot be resolved.
 */
export function apply(ctx: Context, config: Config): void {
  const timeZone = config.timeZone
  const refreshIntervalMs = config.refreshIntervalMs
  validateRefreshInterval(refreshIntervalMs)
  let fallbackFormatter: Intl.DateTimeFormat
  try {
    fallbackFormatter = createTimestampFormatter(timeZone)
  } catch (error: unknown) {
    const message = timeZone === undefined
      ? 'time-context: failed to resolve the system time zone'
      : `time-context: invalid IANA timeZone ${JSON.stringify(timeZone)}`
    throw new Error(message, { cause: error })
  }
  const fallbackTimeZone = fallbackFormatter.resolvedOptions().timeZone
  const formatters = new Map<string, Intl.DateTimeFormat>([[fallbackTimeZone, fallbackFormatter]])

  /** Resolve and cache one request-local timestamp formatter. */
  const formatterFor = (selectedTimeZone: string): Intl.DateTimeFormat => {
    const existing = formatters.get(selectedTimeZone)
    if (existing !== undefined) return existing
    const created = createTimestampFormatter(selectedTimeZone)
    formatters.set(selectedTimeZone, created)
    return created
  }

  ctx.on('agent/pre-step', async (
    { agent, turn, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const now = Date.now()
    if (refreshIntervalMs !== undefined && refreshIntervalMs > 0) {
      const lastInjection = latestInjectionTime(agent)
      if (lastInjection !== undefined
        && now >= lastInjection
        && now - lastInjection < refreshIntervalMs) return decision
    }
    const messages = requestMessages(agent, turn, decision.messages)
    const browser = deriveBrowserTimeZoneContext(messages)
    const selectedTimeZone = browser.kind === 'resolved' ? browser.timeZone : fallbackTimeZone
    const time = standardTime(now, formatterFor(selectedTimeZone), selectedTimeZone)
    const latest = [...messages].reverse().find(message => message.source.kind === 'user')
    const previous = [...agent.session.events].reverse().find(event =>
      event.type === 'assistant/message' || (event.type === 'user/message' && event.data.source.kind === 'user'))
    const previousText = previous === undefined
      ? ''
      : previous.type === 'user/message'
        ? messageText(previous.data)
        : previous.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(' ')
    const keywords = memoryKeywords(`${latest === undefined ? '' : messageText(latest)} ${previousText}`)
    const last = lastContextExcerpt(previousText)
    const recall = config.memoryCommand === undefined
      ? undefined
      : await findMem8(config.memoryCommand, agent.session.header.cwd, keywords)
    const memory = renderMem8(keywords, last, recall)
    const text = `${memory}\n\n${time}`
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: 'plugin',
            plugin: name,
            form: 'snapshot',
            sections: [
              { name: 'MEM|8', text: memory },
              { name, text: time },
            ],
          },
        }),
      ],
    }
  }, { prepend: true })
}
