/**
 * E2E contract for `ctx.intercept(name, config)` (docs/cordis-api/context.md):
 * plugins reading a service through the returned child context see `config`
 * merged into the service's resolved config (ancestor entries first), and the
 * parent context is unaffected. Exercised with a real `Service` subclass whose
 * resolved config is read via `Service[symbols.resolveConfig]`, all mounted
 * through the real Loader (provider + interceptor entries).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { bootComposition } from './harness.ts'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

interface Conf {
  msg: string
  extra?: boolean
}

/** Service whose instances resolve per-context intercept config. */
class ConfService extends Service<Conf> {
  constructor(ctx: Context) {
    super(ctx, 'conf')
  }

  /** Merge the caller context's intercept entries over a caller-supplied base. */
  resolved(base?: Conf): Conf {
    // Direct member call so `this` (the context-traceable service binding) is
    // preserved into resolveConfig, which reads `this.ctx[Context.intercept]`.
    return this[Service.resolveConfig](base)
  }
}

const PROVIDER = "export const name = 'conf-provider'\nexport function apply(ctx) { return globalThis.__confProvide(ctx) }\n"
const INTERCEPTOR = [
  "export const name = 'conf-interceptor'",
  "export const inject = ['conf']",
  'export function apply(ctx) { return globalThis.__interceptDriver(ctx) }',
  '',
].join('\n')

const YML = [
  '- id: provider',
  '  name: ./provider.mjs',
  '- id: interceptor',
  '  name: ./interceptor.mjs',
  '',
].join('\n')

async function boot(): Promise<{ dispose: () => Promise<void>; out: Record<string, unknown> }> {
  const out: Record<string, unknown> = {}
  ;(globalThis as Record<string, unknown>).__confProvide = (ctx: Context) => {
    new ConfService(ctx)
  }
  ;(globalThis as Record<string, unknown>).__interceptDriver = (ctx: Context) => {
    const child = ctx.intercept('conf', { msg: 'child' })
    const grandchild = child.intercept('conf', { extra: true })
    const sibling = ctx.intercept('conf', { msg: 'sibling' })
    // `conf` is a dynamically-named service; reach it through the typed view.
    const conf = (c: Context): ConfService => (c as unknown as { conf: ConfService }).conf
    out.parent = conf(ctx).resolved({ msg: 'base' })
    out.child = conf(child).resolved({ msg: 'base' })
    out.grandchild = conf(grandchild).resolved({ msg: 'base' })
    out.sibling = conf(sibling).resolved({ msg: 'base' })
    out.parentAfter = conf(ctx).resolved({ msg: 'base' })
  }
  const comp = await bootComposition(
    { 'provider.mjs': PROVIDER, 'interceptor.mjs': INTERCEPTOR },
    YML,
  )
  disposers.push(() => comp.dispose())
  return { dispose: () => comp.dispose(), out }
}

describe('ctx.intercept(name, config)', () => {
  it('merges intercept config into the service config for plugins under the child', async () => {
    const { out } = await boot()
    expect(out).toEqual({
      // No intercept on the interceptor's own context: only the base remains.
      parent: { msg: 'base' },
      // The child's entry is merged over the base.
      child: { msg: 'child' },
      // Ancestor (child) entries apply first; the grandchild's own entry last.
      grandchild: { msg: 'child', extra: true },
      // A sibling intercept never reaches a different child's scope.
      sibling: { msg: 'sibling' },
      // The parent context is unaffected by any child intercept.
      parentAfter: { msg: 'base' },
    })
  })
})
