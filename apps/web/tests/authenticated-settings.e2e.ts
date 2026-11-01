// Keyless assembled Web coverage: Basic-authenticated HTTPS proxy, server-only proof,
// real browser provenance, and durable Host settings on a non-loopback authority.
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest, type IncomingMessage, type IncomingHttpHeaders } from 'node:http'
import { createServer, request as httpsRequest } from 'node:https'
import type { AddressInfo, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria,
  compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { saveFailureShot, ZH_BROWSER_LOCALE } from './support.ts'
import { TEST_PROXY_CERT, TEST_PROXY_KEY } from './fixtures/authenticated-proxy-tls.ts'

const MODE = webSnapshotMode()
const SNAPSHOTS = fileURLToPath(new URL('./snapshots/authenticated-settings', import.meta.url))
const PROOF_HEADER = 'x-dsh-authenticated-proxy'
// Public test-only Basic credentials are independent of the random server-side proof.
const LOGIN = { username: 'test-admin', password: 'non-production-proxy-login' }
const AUTHORIZATION = `Basic ${Buffer.from(`${LOGIN.username}:${LOGIN.password}`).toString('base64')}`

interface Provenance {
  path: string
  origin: string | undefined
  site: string | undefined
  browserSuppliedProof: boolean
}

/** One loopback HTTPS reverse proxy; browser credentials never reach the DSH server. */
async function startProxy(proof: string) {
  let target: URL | undefined
  const sockets = new Set<Duplex>()
  const provenance: Provenance[] = []
  const headersFor = (req: IncomingMessage): IncomingHttpHeaders => {
    provenance.push({
      path: req.url ?? '/',
      origin: req.headers.origin,
      site: typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'] : undefined,
      browserSuppliedProof: req.headers[PROOF_HEADER] !== undefined,
    })
    const headers = { ...req.headers, [PROOF_HEADER]: proof }
    delete headers.authorization
    return headers
  }
  const track = (socket: Duplex): void => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
  }
  const server = createServer({ key: TEST_PROXY_KEY, cert: TEST_PROXY_CERT }, (req, res) => {
    if (req.headers.authorization !== AUTHORIZATION) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="DSH test proxy"' })
      res.end('authentication required')
      return
    }
    if (target === undefined) { res.writeHead(503); res.end(); return }
    const upstream = httpRequest(new URL(req.url ?? '/', target), {
      method: req.method, headers: headersFor(req),
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
    res.once('close', () => { upstream.destroy() })
    req.pipe(upstream)
  })
  server.on('connection', (socket: Socket) => { track(socket) })
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.authorization !== AUTHORIZATION || target === undefined) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    const upstream = httpRequest(new URL(req.url ?? '/', target), { headers: headersFor(req) })
    upstream.on('upgrade', (response, remote, remoteHead) => {
      track(remote)
      const headers = response.rawHeaders.reduce<string[]>((lines, value, index, raw) => {
        if (index % 2 === 0) lines.push(`${value}: ${raw[index + 1]}`)
        return lines
      }, [])
      socket.write(`HTTP/1.1 ${response.statusCode ?? 101} ${response.statusMessage ?? 'Switching Protocols'}\r\n${headers.join('\r\n')}\r\n\r\n`)
      if (remoteHead.length > 0) socket.write(remoteHead)
      if (head.length > 0) remote.write(head)
      socket.on('error', () => { remote.destroy() })
      remote.on('error', () => { socket.destroy() })
      socket.once('close', () => { remote.destroy() })
      remote.once('close', () => { socket.destroy() })
      socket.pipe(remote).pipe(socket)
    })
    upstream.on('response', (response) => { response.resume(); socket.destroy() })
    upstream.on('error', () => { socket.destroy() })
    socket.once('close', () => { upstream.destroy() })
    upstream.end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const origin = `https://remote.localhost:${(server.address() as AddressInfo).port}`
  return {
    origin,
    provenance,
    setTarget(baseUrl: string): void {
      target = new URL(baseUrl)
      target.hostname = '127.0.0.1'
    },
    async close(): Promise<void> {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve() })
      })
      server.closeAllConnections()
      for (const socket of sockets) socket.destroy()
      await closed
    },
  }
}

describe.skipIf(MODE === 'record')('web e2e: authenticated hosted settings', () => {
  let scaffold: WebScaffold
  let proxy: Awaited<ReturnType<typeof startProxy>>
  let browser: Browser
  let page: Page
  let privateRoot: string
  let tripwire: ReturnType<typeof watchConsole>
  const settingsResponses: number[] = []

  beforeAll(async () => {
    privateRoot = await mkdtemp(join(tmpdir(), 'dsh-authenticated-settings-'))
    const proof = randomBytes(32).toString('hex')
    const tokenFile = join(privateRoot, 'proxy.token')
    await writeFile(tokenFile, `${proof}\n`, { mode: 0o600, flag: 'wx' })
    proxy = await startProxy(proof)
    scaffold = await launchWebScaffold({
      remoteAuthority: 'remote.localhost',
      authenticatedProxy: { origin: proxy.origin, tokenFile },
    })
    proxy.setTarget(scaffold.baseUrl)
    browser = await chromium.launch()
    page = await browser.newPage({
      viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE,
      ignoreHTTPSErrors: true, httpCredentials: LOGIN,
    })
    tripwire = watchConsole(page)
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/settings.describe') settingsResponses.push(response.status())
    })
    await page.goto(proxy.origin, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    if (MODE === 'refresh') await mkdir(SNAPSHOTS, { recursive: true })
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await proxy?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (privateRoot !== undefined) await rm(privateRoot, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    if (failures.length > 0) throw new AggregateError(failures, 'authenticated settings cleanup failed')
  })

  it('loads Agent preset and Permission and persists language/theme across a real refresh', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-authenticated-settings'))
    const access = await page.evaluate(async () => {
      const response = await fetch('/api/access', { cache: 'no-store' })
      return { status: response.status, access: await response.json() as unknown }
    })
    expect(access).toEqual({ status: 200, access: { settings: true, native: false } })
    expect(new URL(page.url()).origin).toBe(proxy.origin)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    const preset = dialog.getByRole('button', { name: '标准模式', exact: true })
    const permission = dialog.getByRole('button', { name: 'Workspace Write', exact: true })
    await expect.poll(() => preset.isEnabled(), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => permission.isEnabled(), { timeout: 15_000 }).toBe(true)
    expect(await dialog.getByRole('button', { name: '打开配置文件' }).count()).toBe(0)
    expect(settingsResponses.length).toBeGreaterThan(0)
    expect(settingsResponses.every(status => status === 200)).toBe(true)

    await dialog.getByRole('button', { name: '深色', exact: true }).click()
    await expect.poll(() => dialog.getByRole('button', { name: '深色', exact: true }).getAttribute('aria-pressed')).toBe('true')
    await dialog.getByRole('button', { name: '中文', exact: true }).click()
    await page.getByRole('menuitem', { name: 'English', exact: true }).click()
    const english = page.getByRole('dialog', { name: 'Settings', exact: true })
    await english.waitFor({ timeout: 15_000 })
    await expect.poll(() => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')).toMatch(/locale:\n\s+preference: en/)
    await expect.poll(() => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')).toMatch(/ui-theme:\n\s+preference: dark/)

    const warnings = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warnings)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const restored = page.getByRole('dialog', { name: 'Settings', exact: true })
    await restored.getByRole('button', { name: 'English', exact: true }).waitFor({ timeout: 15_000 })
    await expect.poll(() => restored.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed')).toBe('true')
    await expect.poll(() => restored.getByRole('button', { name: 'Workspace Write', exact: true }).isEnabled()).toBe(true)
    expect(await restored.getByRole('button', { name: 'Open configuration file' }).count()).toBe(0)
    await compareOrRefreshGolden(join(SNAPSHOTS, 'hosted-general.expected.md'),
      await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), MODE)
    expect(settingsResponses.every(status => status === 200)).toBe(true)
    const browserPosts = proxy.provenance.filter(item => item.path === '/api/settings.mutate')
    expect(browserPosts.length).toBeGreaterThanOrEqual(2)
    expect(browserPosts.every(item => item.origin === proxy.origin && item.site === 'same-origin')).toBe(true)
    expect(proxy.provenance.every(item => !item.browserSuppliedProof)).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)

  it('denies the same public authority without proxy proof and refuses native desktop actions', async () => {
    const unauthenticated = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpsRequest({
        hostname: '127.0.0.1', port: new URL(proxy.origin).port, path: '/api/access',
        rejectUnauthorized: false, headers: { host: new URL(proxy.origin).host },
      }, (response) => {
        response.resume()
        response.once('end', () => { resolve(response.statusCode) })
      })
      request.on('error', reject)
      request.end()
    })
    expect(unauthenticated).toBe(401)
    const target = new URL(scaffold.baseUrl)
    target.hostname = '127.0.0.1'
    const headers = {
      host: new URL(proxy.origin).host, origin: proxy.origin, 'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
    }
    // Raw HTTP preserves the deliberately different public Host header; Fetch
    // implementations may replace that forbidden browser header with the URL host.
    const withoutProof = (path: string, method: 'GET' | 'POST') => new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      const request = httpRequest(new URL(path, target), { method, headers }, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => { body += chunk })
        response.once('end', () => { resolve({ status: response.statusCode, body }) })
        response.once('error', reject)
      })
      request.once('error', reject)
      request.end(method === 'POST'
        ? JSON.stringify({ type: 'client-request', rpcId: 'untrusted-settings', method: 'settings.describe', payload: {} })
        : undefined)
    })
    const denied = await withoutProof('/api/settings.describe', 'POST')
    expect(denied.status).toBe(403)
    const access = await withoutProof('/api/access', 'GET')
    expect(access.status).toBe(200)
    expect(JSON.parse(access.body)).toEqual({ settings: false, native: false })
    const native = await page.evaluate(async () => {
      const response = await fetch('/api/settings.openDocument', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'native-denied', method: 'settings.openDocument', payload: {} }),
      })
      return response.status
    })
    expect(native).toBe(403)
    expect(proxy.provenance.every(item => !item.browserSuppliedProof)).toBe(true)
    await assertFixtureInventory(SNAPSHOTS, ['hosted-general.expected.md'])
  })
})
