/**
 * Register a {@link OsarousAdapter} for the `osarous` provider route on
 * `ctx.llm`, resolving connection facts per request instead of freezing them
 * at load: the plugin layers its `cordis.yml` entry config under the optional
 * `llm-osarous` user-settings section (`ctx.settings`), so a changed base URL
 * or catalog reaches the very next request without restarting anything, while
 * an in-flight stream keeps the facts it started with. The sidecar process
 * lifecycle belongs to this plugin's fiber: `ensureSidecar` spawns it on first
 * use when configured to, and the dispose fiber stops it.
 * @module @deepseek-ai/dsh-llm-osarous
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_BASE_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OsarousAdapter,
} from './adapter.ts'
import type { OsarousCatalogModel, OsarousConnectionOptions } from './adapter.ts'

export {
  DEFAULT_BASE_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OsarousAdapter,
} from './adapter.ts'
export type { OsarousAdapterOptions, OsarousCatalogModel, OsarousConnectionOptions } from './adapter.ts'
export { DONE } from './sse.ts'
export { mapFinishReason, mapUsage } from './translate.ts'
export type { WireChunk, WireMessage, WireRequest, WireTool, WireUsage, WireToolCall } from './types.ts'

export const name = 'llm-osarous'
export const inject = ['llm']

const NS = settingsNamespace('llm-osarous')
/** The single provider route this plugin owns. */
export const PROVIDER = 'osarous'

const DEFAULT_MODELS: OsarousCatalogModel[] = [
  { id: 'local-model', name: 'Osarous Local Model', contextWindow: DEFAULT_CONTEXT_WINDOW },
]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-osarous` settings-section shape. Every field is optional in yml:
 * the sidecar endpoint defaults to the local default port, an omitted model
 * catalog advertises the local default entry, and requests remain unrestricted.
 */
export interface Config {
  /** Sidecar endpoint base (default `http://127.0.0.1:1337`). */
  baseURL?: string
  /** Spawn the sidecar when unreachable (default `true`). */
  autoStart?: boolean
  /** Positive context capacity used when the selected model has no exact value (default 262,144). */
  defaultContextWindow?: number
  /** Advisory models shown by discovery consumers; requests remain unrestricted. */
  models?: OsarousCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
}

const catalogModel: z<OsarousCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
})

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  autoStart: z.boolean().default(true),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  models: z.array(catalogModel).default(DEFAULT_MODELS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
})

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly OsarousCatalogModel[] | undefined): OsarousCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('llm-osarous: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-osarous: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `llm-osarous: catalog model "${model.id}" contextWindow must be a positive integer`,
      )
    }
    if (seen.has(model.id)) throw new Error(`llm-osarous: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here — for the composition entry at
 * load (fail loud) and for each settings snapshot at its first use.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts.
 */
export function resolveAdapterOptions(config: Config): OsarousConnectionOptions {
  if (config.baseURL !== undefined && config.baseURL.length === 0) {
    throw new Error('llm-osarous: baseURL must be non-empty')
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-osarous: defaultContextWindow must be a positive integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-osarous: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    autoStart: config.autoStart ?? true,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: OsarousConnectionOptions | undefined
  const options = (): OsarousConnectionOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw)
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      // Static composition resolves before anything registers, so this branch
      // only sees a live settings snapshot failing a beyond-schema bound:
      // keep serving the last good facts and say so once per bad snapshot.
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('llm-osarous: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const adapter = new OsarousAdapter({ options })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'Osarous', settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([PROVIDER], adapter)
  // Stop the spawned sidecar when this plugin's fiber disposes; a second
  // plugin instance spawning another process is then impossible.
  ctx.effect(() => () => { adapter.stop() })

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {
      // No registration-captured fact exists for this adapter: connection
      // facts re-resolve per request, so a settings change needs no
      // re-registration. The empty hook keeps the section's lifecycle wired.
    },
  })
}
