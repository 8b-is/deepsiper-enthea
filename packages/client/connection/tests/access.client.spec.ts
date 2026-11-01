import { afterEach, describe, expect, it, vi } from 'vitest'
import { readConnectionAccess } from '../src/client/access.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('request access discovery', () => {
  it('reads current server permissions on a remote page without sending an authentication secret', async () => {
    vi.stubGlobal('location', { origin: 'https://harness.example' })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ settings: true, native: false }))
    const controller = new AbortController()
    await expect(readConnectionAccess(controller.signal)).resolves.toEqual({ settings: true, native: false })
    expect(fetch).toHaveBeenCalledWith(new URL('https://harness.example/api/access'), {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    })
  })

  it('does not infer grants from a local hostname or an unavailable endpoint', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost:3080' })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ settings: false, native: false }))
    const signal = new AbortController().signal
    await expect(readConnectionAccess(signal)).resolves.toEqual({ settings: false, native: false })
    fetch.mockResolvedValue(new Response('forbidden', { status: 403 }))
    await expect(readConnectionAccess(signal)).rejects.toThrow('HTTP 403')
  })

  it('rejects malformed wire permission flags', async () => {
    vi.stubGlobal('location', { origin: 'null' })
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const value of [null, [], true, {}, { settings: true }, { settings: 'true', native: false }, { settings: false, native: 1 }]) {
      fetch.mockResolvedValue(Response.json(value))
      await expect(readConnectionAccess(new AbortController().signal)).rejects.toThrow('invalid permissions')
    }
    expect(fetch.mock.calls[0]?.[0]).toEqual(new URL('http://dsh.internal/api/access'))
    vi.stubGlobal('location', undefined)
    fetch.mockResolvedValue(Response.json({ settings: false, native: false }))
    await expect(readConnectionAccess(new AbortController().signal)).resolves.toEqual({ settings: false, native: false })
  })
})
