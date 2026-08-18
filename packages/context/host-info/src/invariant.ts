/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-info`.
 * @module @deepseek-ai/dsh-host-info/invariant
 */

/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-info'
const SNAPSHOT_SOURCE = '@deepseek-ai/dsh-system-prompt'
const CONTEXT_NAME = 'host:info'
const BLOCK = /^Host hardware:\n- System: [^\n]+\n- CPU: [^\n]+\n- Memory: [^\n]+ total, [^\n]+ available$/
/* jscpd:ignore-end */

/** Cordis companion plugin name. */
export const name = 'host-info-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** One named contribution inside a runtime-context snapshot source. */
interface HostInfoSection {
  name: string
  text: string
}

/** Validate the host-info section inside one durable runtime-context snapshot. */
function validateMessage(event: SessionEvent<'user/message'>, fail: InvariantFailure): void {
  const source = event.data.source
  if (source.kind !== 'plugin' || source.plugin !== SNAPSHOT_SOURCE || source.form !== 'snapshot') return
  const sections = (source as { sections?: unknown }).sections
  if (!Array.isArray(sections)) return
  const owned = (sections as HostInfoSection[]).filter(section => section.name === CONTEXT_NAME)
  if (owned.length > 1) {
    fail('host-info context must appear at most once in a runtime snapshot')
  }
  for (const section of owned) {
    if (!BLOCK.test(section.text)) {
      fail('host-info block does not match the pinned model-facing format')
    }
  }
}

/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Validate every runtime snapshot of one session. */
function validateSession(session: Session, fail: InvariantFailure): void {
  for (const event of session.events) {
    if (event.type !== 'user/message') continue
    validateMessage(event, fail)
  }
}

/** Install validation for loaded and newly appended runtime snapshots. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) validateSession(session, fail)
  ctx.on('session/created', (session) => { validateSession(session, fail) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [, event] = args as [Session, SessionEvent]
    if (event.type !== 'user/message') return
    validateMessage(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })
/* jscpd:ignore-end */

/**
 * Register the host-info invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
