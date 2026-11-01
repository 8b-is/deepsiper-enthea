/** Request-scoped browser access discovery; no deployment credentials cross this endpoint. */
import { ACCESS_PATH, type ConnectionAccess } from '../access.ts'

/**
 * Read and validate the current request's Host permissions.
 * @param signal - current connection generation's cancellation signal.
 * @returns owned permission flags from the Host, never inferred from the page hostname.
 */
export async function readConnectionAccess(signal: AbortSignal): Promise<ConnectionAccess> {
  const page = (globalThis as { location?: { origin?: string } }).location
  const origin = page?.origin !== undefined && page.origin !== 'null' ? page.origin : 'http://dsh.internal'
  const response = await globalThis.fetch(new URL(ACCESS_PATH, origin), {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', signal,
  })
  if (!response.ok) throw new Error(`connection access failed: HTTP ${response.status}`)
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null
    || !('settings' in value) || typeof value.settings !== 'boolean'
    || !('native' in value) || typeof value.native !== 'boolean') {
    throw new Error('connection access returned invalid permissions')
  }
  return { settings: value.settings, native: value.native }
}
