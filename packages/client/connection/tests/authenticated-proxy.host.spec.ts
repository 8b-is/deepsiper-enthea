/** Authenticated proxy proof cannot be forged by public request metadata. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { authenticatedProxyVerifier, AUTHENTICATED_PROXY_HEADER } from '../src/authenticated-proxy.ts'

const directory = mkdtempSync(join(tmpdir(), 'dsh-proxy-auth-'))
const tokenFile = join(directory, 'token')
const token = 'a'.repeat(64)
writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 })
afterAll(() => { rmSync(directory, { recursive: true, force: true }) })
const config = { origin: 'https://harness.example', tokenFile }

function request(overrides: Record<string, string | string[] | undefined> = {}, method = 'POST', peer = '127.0.0.1'): IncomingMessage {
  return {
    method,
    socket: { remoteAddress: peer },
    headers: {
      host: 'harness.example', origin: config.origin, 'sec-fetch-site': 'same-origin',
      [AUTHENTICATED_PROXY_HEADER]: token, ...overrides,
    },
  } as unknown as IncomingMessage
}

describe('authenticated proxy authorization', () => {
  it('defaults to no remote grant', () => {
    expect(authenticatedProxyVerifier(undefined, '0.0.0.0')(request())).toBe(false)
  })

  it('accepts a proxy proof only from the loopback upstream', () => {
    const verify = authenticatedProxyVerifier(config, '127.0.0.1')
    for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(verify(request({}, 'POST', peer))).toBe(true)
    expect(verify(request({ 'x-forwarded-for': '127.0.0.1' }, 'POST', '192.0.2.1'))).toBe(false)
  })

  it.each([
    undefined, '', 'b'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'é'.repeat(64), [token, token], `${token}, ${token}`,
  ])('rejects missing, wrong, malformed, or duplicate proof %s', (value) => {
    expect(authenticatedProxyVerifier(config, '127.0.0.1')(request({ [AUTHENTICATED_PROXY_HEADER]: value }))).toBe(false)
  })

  it.each([
    { host: 'other.example' }, { host: 'harness.example:444' }, { origin: 'https://evil.example' },
    { origin: 'http://harness.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' }, { origin: undefined },
  ])('rejects a different authority or browser origin %j', (headers) => {
    expect(authenticatedProxyVerifier(config, '127.0.0.1')(request(headers))).toBe(false)
  })

  it('requires affirmative same-origin metadata for an originless capability read', () => {
    const verify = authenticatedProxyVerifier(config, '127.0.0.1')
    expect(verify(request({ origin: undefined }, 'GET'))).toBe(true)
    expect(verify(request({ origin: undefined, 'sec-fetch-site': undefined }, 'GET'))).toBe(false)
  })

  it('refuses a publicly bound upstream', () => {
    expect(() => authenticatedProxyVerifier(config, '0.0.0.0')).toThrow('127.0.0.1 listener')
  })

  it.each(['http://harness.example', 'https://harness.example/', 'https://u:p@harness.example',
    'https://harness.example/path', 'https://harness.example?x=y', 'not a URL'])('refuses an invalid origin %s', (origin) => {
    expect(() => authenticatedProxyVerifier({ ...config, origin }, '127.0.0.1')).toThrow('canonical HTTPS origin')
  })

  it('refuses relative, missing, empty, or malformed token files without including their values', () => {
    expect(() => authenticatedProxyVerifier({ ...config, tokenFile: 'relative' }, '127.0.0.1')).toThrow('must be absolute')
    expect(() => authenticatedProxyVerifier({ ...config, tokenFile: join(directory, 'missing') }, '127.0.0.1')).toThrow('cannot be read')
    const bad = join(directory, 'bad')
    for (const value of ['', 'private-but-invalid', `${token}\n\n`]) {
      writeFileSync(bad, value)
      expect(() => authenticatedProxyVerifier({ ...config, tokenFile: bad }, '127.0.0.1')).toThrow('must contain 64 lowercase hexadecimal characters')
    }
  })
})
