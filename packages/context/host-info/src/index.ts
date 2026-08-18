/**
 * Model-facing host hardware context contributed from the Neon sysinfo addon.
 * Renders nothing on unsupported hosts, so mounting it is safe across the
 * fleet; the assembled prompt is logged per request in `request/header`.
 *
 * @module @deepseek-ai/dsh-host-info
 */

import type { Context } from '@deepseek-ai/cordis'
import { hardwareInfo } from '@deepseek-ai/node-addon-hardware-info'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { renderHostInfo } from './render.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'host-info'

/** The prompt registry this context contributes to. */
export const inject = ['systemPrompt']

/** Ordered context slot: immediately after the deployment persona, before tool guidance. */
export const CONTEXT_ORDER = 5

/** The ordered dynamic-context name the block renders under. */
export const CONTEXT_NAME = 'host:info'

/**
 * Register the host hardware context for the mounting context's scope.
 * @param ctx - a context whose scope carries the prompt registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.systemPrompt.context({
    name: CONTEXT_NAME,
    order: CONTEXT_ORDER,
    text: () => renderHostInfo(hardwareInfo()),
  }), 'host-info.context()')
}
