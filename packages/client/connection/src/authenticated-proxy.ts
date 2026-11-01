/** Host-only authorization proof supplied by an authenticating loopback reverse proxy. */
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { isAbsolute } from 'node:path'

/** Internal proxy header; its value must never reach browser or RPC consumers. */
export const AUTHENTICATED_PROXY_HEADER = 'x-dsh-authenticated-proxy'

/** Explicit administrator access through a separately authenticated HTTPS proxy. */
export interface AuthenticatedProxyConfig {
  /** Canonical public HTTPS origin served exclusively by the authenticating proxy. */
  origin: string
  /** Absolute Host path to a private file containing a 32-byte, hex-encoded shared secret. */
  tokenFile: string
}

/**
 * Load the proxy proof once; rotation requires reloading this plugin and the proxy together.
 * @param config - Explicit proxy opt-in; omission grants no remote configuration access.
 * @param bindHost - Actual upstream listener address, which must be IPv4 loopback for proxy access.
 * @returns A request-local verifier; it does not replace the existing Host/Origin trust fence.
 */
export function authenticatedProxyVerifier(
  config: AuthenticatedProxyConfig | undefined,
  bindHost: string,
): (request: IncomingMessage) => boolean {
  if (config === undefined) return () => false
  if (bindHost !== '127.0.0.1') throw new Error('client-connection: authenticatedProxy requires a 127.0.0.1 listener')
  let origin: URL
  try {
    origin = new URL(config.origin)
  } catch {
    throw new Error('client-connection: authenticatedProxy.origin must be a canonical HTTPS origin')
  }
  if (origin.protocol !== 'https:' || origin.origin !== config.origin) {
    throw new Error('client-connection: authenticatedProxy.origin must be a canonical HTTPS origin')
  }
  if (!isAbsolute(config.tokenFile)) throw new Error('client-connection: authenticatedProxy.tokenFile must be absolute')
  let token: string
  try {
    token = readFileSync(config.tokenFile, 'utf8').replace(/\r?\n$/, '')
  } catch {
    throw new Error('client-connection: authenticatedProxy token file cannot be read')
  }
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('client-connection: authenticatedProxy token file must contain 64 lowercase hexadecimal characters')
  }
  const expected = Buffer.from(token)
  return (request) => {
    const peer = request.socket.remoteAddress
    if (peer !== '127.0.0.1' && peer !== '::1' && peer !== '::ffff:127.0.0.1') return false
    if (request.headers.host !== origin.host) return false
    const supplied = request.headers[AUTHENTICATED_PROXY_HEADER]
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied)) return false
    if (!timingSafeEqual(Buffer.from(supplied), expected)) return false
    const fetchSite = request.headers['sec-fetch-site']
    if (fetchSite !== undefined && fetchSite !== 'same-origin') return false
    const suppliedOrigin = request.headers.origin
    if (suppliedOrigin !== undefined) return suppliedOrigin === origin.origin
    return request.method === 'GET' && fetchSite === 'same-origin'
  }
}
