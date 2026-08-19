/**
 * dsh-quant's owned branded id: {@link QuantProviderId}, the opaque identity a provider reserves on
 * `ctx.quant`. The `Branded<B>` primitive lives in `@deepseek-ai/dsh-brand`; keeping the type and
 * its factory together here lets `index.ts` re-export both under one name.
 * @module @deepseek-ai/dsh-quant/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque provider identity, reserved exclusively at registration. */
export type QuantProviderId = Branded<'QuantProviderId'>

/**
 * Brand a string as a {@link QuantProviderId}. No validation — the registry rejects an empty id at
 * registration.
 * @param id - the provider's stable identifier.
 * @returns the same string, branded.
 */
export function QuantProviderId(id: string): QuantProviderId {
  return id as QuantProviderId
}
