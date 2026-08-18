import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as HostInfoInvariant from '@deepseek-ai/dsh-host-info/invariant'

const BLOCK = 'Host hardware:\n'
  + '- System: Darwin (macOS 26.4.1 Tahoe), kernel 25.4.0, arm64\n'
  + '- CPU: Apple M1 Pro, 8 logical / 8 physical cores @ 3228 MHz\n'
  + '- Memory: 16.0 GiB total, 7.5 GiB available'

function snapshotMessage(sections: unknown, source: object = {
  kind: 'plugin',
  plugin: '@deepseek-ai/dsh-system-prompt',
  form: 'snapshot',
  sections,
}): SessionEvent<'user/message'> {
  return {
    type: 'user/message',
    seq: 0,
    time: 0,
    data: createUserMessage({
      content: [{ type: 'text', text: 'Current runtime context.' }],
      source: source as never,
    }),
  }
}

function sessionWith(sections: unknown): Session {
  const session = Session.create(SessionId(`host-info-invariant-${String(Math.random())}`))
  session.append('user/message', snapshotMessage(sections).data, { surfaceOp: 'append' })
  return session
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(HostInfoInvariant)
  return ctx
}

describe('host-info invariants', () => {
  it('accepts a pinned host:info section in a runtime snapshot', async () => {
    const ctx = await setup()
    const message = snapshotMessage([{ name: 'host:info', text: BLOCK }])
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-valid')), message) })
      .not.toThrow()
  })

  it('accepts snapshots without a host:info section or owned by another package', async () => {
    const ctx = await setup()
    const other = snapshotMessage([{ name: 'sandbox:policy', text: 'policy' }])
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-other')), other) })
      .not.toThrow()
    const cleared = snapshotMessage([], { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' })
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-cleared')), cleared) })
      .not.toThrow()
    const unstructured = snapshotMessage([], {
      kind: 'plugin',
      plugin: '@deepseek-ai/dsh-system-prompt',
      form: 'snapshot',
    })
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-unstructured')), unstructured) })
      .not.toThrow()
    const user: SessionEvent<'user/message'> = {
      ...snapshotMessage([]),
      data: createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }),
    }
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-user')), user) })
      .not.toThrow()
  })

  it('rejects a host:info section that does not match the pinned model-facing format', async () => {
    const ctx = await setup()
    const message = snapshotMessage([{ name: 'host:info', text: 'Host hardware:\n- Memory: bogus' }])
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-bad')), message) })
      .toThrow(/does not match the pinned model-facing format/)
  })

  it('rejects a snapshot with more than one host:info section', async () => {
    const ctx = await setup()
    const message = snapshotMessage([
      { name: 'host:info', text: BLOCK },
      { name: 'host:info', text: BLOCK },
    ])
    expect(() => { ctx.emit('session/event', Session.create(SessionId('host-info-invariant-dupe')), message) })
      .toThrow(/at most once/)
  })

  it('validates existing snapshots on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const valid = ctx.sessions.create(SessionId('host-info-invariant-late-valid'))
    valid.append('turn/start', { turn: 1 })
    valid.append('user/message', snapshotMessage([{ name: 'host:info', text: BLOCK }]).data, { surfaceOp: 'append' })
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(HostInfoInvariant)).resolves.toBeDefined()
  })

  it('rejects an invalid existing snapshot on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const invalid = ctx.sessions.create(SessionId('host-info-invariant-late-invalid'))
    invalid.append('user/message', snapshotMessage([{ name: 'host:info', text: 'Host hardware:\n- Memory: bogus' }]).data, { surfaceOp: 'append' })
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(HostInfoInvariant).then(() => undefined)).rejects
      .toThrow(/does not match the pinned model-facing format/)
  })

  it('validates snapshots created after registration through the session lifecycle', async () => {
    const ctx = await setup()
    const late = ctx.sessions.create(SessionId('host-info-invariant-created-after'))
    late.append('user/message', snapshotMessage([{ name: 'host:info', text: BLOCK }]).data, { surfaceOp: 'append' })
    expect(() => {
      const bad = ctx.sessions.create(SessionId('host-info-invariant-created-after-bad'))
      bad.append('user/message', snapshotMessage([{ name: 'host:info', text: 'Host hardware:\n- Memory: bogus' }]).data, { surfaceOp: 'append' })
    }).toThrow(/does not match the pinned model-facing format/)
  })

  it('ignores unrelated events', async () => {
    const ctx = await setup()
    const session = sessionWith([{ name: 'host:info', text: BLOCK }])
    expect(() => {
      ctx.emit('session/event', session, { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } })
      ctx.emit('tools/change')
    }).not.toThrow()
  })
})
