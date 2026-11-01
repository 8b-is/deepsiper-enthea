/** Welcome-notice state, durable when the browser may use Host settings. */

import type { IApiClient, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  WELCOME_NOTICE_ACK_FIELD, WELCOME_NOTICE_SETTINGS_NAMESPACE, WELCOME_NOTICE_VERSION,
} from '../onboarding-copy.ts'

/** State rendered by the welcome step. */
export interface WelcomeNoticeState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error'
  acknowledged: boolean
  error: string | null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function acknowledgementOf(view: SettingsNamespaceView): string | undefined {
  if (typeof view.value !== 'object' || view.value === null) return undefined
  const value = (view.value as Record<string, unknown>)[WELCOME_NOTICE_ACK_FIELD]
  return typeof value === 'string' ? value : undefined
}

/** Coordinates durable Host acknowledgement or a process-local remote fallback. */
export class WelcomeNoticeStore {
  /** uSES-safe state source shared by the registered welcome step. */
  readonly store: SnapshotStore<WelcomeNoticeState> = createSnapshotStore({
    status: 'idle', acknowledged: false, error: null,
  })

  private generation = 0
  private disposed = false
  private accessGeneration = 0

  /**
   * @param api - settings wire face used for durable reads and writes.
   * @param persistence - initial request permission; unknown or denied settings access uses memory.
   */
  constructor(
    private readonly api: Pick<IApiClient, 'settings'>,
    private persistence: 'host' | 'memory' = 'host',
  ) {}

  /**
   * Switch persistence after permission discovery, discarding the previous mode's acknowledgement.
   * @param allowed - current request permission for Host settings.
   * @returns completion of fresh Host state on a grant; never copies a local acknowledgement.
   */
  setAccess(allowed: boolean): Promise<void> {
    const persistence = allowed ? 'host' : 'memory'
    if (this.disposed || this.persistence === persistence) return Promise.resolve()
    this.persistence = persistence
    this.accessGeneration += 1
    this.generation += 1
    this.store.update((state) => {
      state.status = 'idle'
      state.acknowledged = false
      state.error = null
    })
    return this.load()
  }

  /** Suppress pending responses and reject new work after the owning plugin unloads. */
  dispose(): void {
    this.disposed = true
    this.accessGeneration += 1
    this.generation += 1
  }

  /** Load the acknowledgement from Host settings or initialize process-local state. */
  async load(): Promise<void> {
    if (this.disposed) return
    const generation = ++this.generation
    if (this.persistence === 'memory') {
      this.store.update((state) => { state.status = 'ready'; state.error = null })
      return
    }
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const response = await this.api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      const view = response.result.value.namespaces.find(
        candidate => candidate.ns === WELCOME_NOTICE_SETTINGS_NAMESPACE,
      )
      if (view === undefined) throw new Error('welcome acknowledgement settings are unavailable')
      if (generation !== this.generation) return
      this.store.update((state) => {
        state.status = 'ready'
        state.acknowledged = acknowledgementOf(view) === WELCOME_NOTICE_VERSION
        state.error = null
      })
    } catch (error) {
      if (generation !== this.generation) return
      this.store.update((state) => {
        state.status = 'error'
        state.acknowledged = false
        state.error = messageOf(error)
      })
    }
  }

  /**
   * Persist this copy version, or advance only this process when Host settings access is unavailable.
   * @returns true when the selected persistence mode accepted the acknowledgement.
   */
  async acknowledge(): Promise<boolean> {
    if (this.disposed) return false
    const accessGeneration = this.accessGeneration
    const generation = ++this.generation
    if (this.persistence === 'memory') {
      this.store.update((state) => {
        state.status = 'ready'
        state.acknowledged = true
        state.error = null
      })
      return true
    }
    this.store.update((state) => { state.status = 'saving'; state.error = null })
    try {
      const response = await this.api.settings.mutate({
        ns: WELCOME_NOTICE_SETTINGS_NAMESPACE,
        ops: [{ op: 'set', path: [WELCOME_NOTICE_ACK_FIELD], value: WELCOME_NOTICE_VERSION }],
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      if (accessGeneration !== this.accessGeneration) return false
      if (generation === this.generation) {
        this.store.update((state) => {
          state.status = 'ready'
          state.acknowledged = true
          state.error = null
        })
      }
      return true
    } catch (error) {
      if (generation === this.generation) {
        this.store.update((state) => {
          state.status = 'error'
          state.acknowledged = false
          state.error = messageOf(error)
        })
      }
      return false
    }
  }
}

/**
 * Refresh only after welcome state has left idle. A memory-mode load retains
 * acknowledgement so reconnect does not reopen a process-local notice.
 * @param controller - welcome state owner whose current status decides whether to load.
 */
export function refreshWelcomeIfLoaded(controller: WelcomeNoticeStore): void {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}
