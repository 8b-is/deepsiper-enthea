import { describe, expect, it } from 'vitest'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { normalizeTarget, startAgentFieldRun, textTask } from '../src/run.ts'

const BASE = 'http://control-plane:8085'

/** A fetch stub routing on URL to canned JSON responses, recording calls. */
function stubFetch(handler: (url: string, init?: RequestInit) => unknown): typeof fetch {
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  return Object.assign(
    async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const raw = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
      calls.push({ url: raw, init })
      return {
        ok: true,
        status: 200,
        async json() { return handler(raw, init) },
        async text() { return JSON.stringify(handler(raw, init)) },
      } as Response
    },
    { calls } as unknown,
  )
}

function request(overrides: Partial<SubagentStartRequest> = {}): SubagentStartRequest {
  const header: SessionHeader = { version: 0, id: SessionId('parent'), createdAt: 1, cwd: '/w' }
  return {
    prompt: [{ type: 'text', text: 'fix the bug' }],
    label: 'swe task',
    parent: { session: { header } } as never,
    signal: new AbortController().signal,
    ...overrides,
  } as unknown as SubagentStartRequest
}

/** Parse a request body when it is a JSON string. */
function parseBody(init?: RequestInit): unknown {
  if (init === undefined || typeof init !== 'object' || !('body' in init)) return null
  return typeof init.body === 'string' ? JSON.parse(init.body) : null
}

/** Extract a stable URL string from any fetch input. */
function rawUrl(url: string | URL | Request): string {
  return typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
}


describe('textTask', () => {
  it('requires a non-empty text-only prompt', () => {
    expect(textTask([{ type: 'text', text: 'go' }])).toEqual(['go'])
    expect(() => textTask([])).toThrow(/only text blocks/)
    expect(() => textTask([{ type: 'text', text: '   ' }])).toThrow(/must not be empty/)
    expect(() => textTask([{ type: 'image', data: 'x', mimeType: 'image/png' } as never])).toThrow(/only text blocks/)
  })
})

describe('normalizeTarget', () => {
  it('maps discovery colon form to the API dot form', () => {
    expect(normalizeTarget('swe_af:solve_issue')).toBe('swe_af.solve_issue')
    expect(normalizeTarget('swe_af.solve_issue')).toBe('swe_af.solve_issue')
  })
})

describe('startAgentFieldRun', () => {
  it('rejects a non-OK dispatch response', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response) as typeof fetch
    const run = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000, fetchImpl,
    })
    const result = await run.result
    expect(result.stopReason).toBe('error')
    await run.dispose()
  })

  it('rejects a dispatch response without an execution id', async () => {
    const fetchImpl = stubFetch(() => ({}))
    const run = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000, fetchImpl,
    })
    const result = await run.result
    expect(result.stopReason).toBe('error')
    await run.dispose()
  })

  it('rejects a non-OK poll response', async () => {
    let polls = 0
    const fetchImpl = (async (url) => {
      if (rawUrl(url).includes('/execute/async/')) {
        return { ok: true, status: 200, json: async () => ({ execution_id: 'exec-p' }) }
      }
      polls += 1
      return { ok: false, status: 503, text: async () => 'down' } as Response
    }) as typeof fetch
    const run = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000, fetchImpl,
    })
    const result = await run.result
    expect(result.stopReason).toBe('error')
    void polls
    await run.dispose()
  })

  it('serializes a structured failure error and honors model/cwd input kwargs', async () => {
    const bodies: unknown[] = []
    let captured = ''
    const fetchImpl = (async (url, init) => {
      if (rawUrl(url).includes('/execute/async/')) {
        bodies.push(parseBody(init))
        return { ok: true, status: 200, json: async () => ({ execution_id: 'exec-s' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'failed', error: { code: 402 } }) } as Response
    }) as typeof fetch
    const run = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af:solve_issue', pollIntervalMs: 1, timeoutMs: 10_000,
      model: 'openrouter/x', cwd: '/repo', fetchImpl,
      onError: (error) => { captured = error.message },
    })
    const result = await run.result
    expect(result.stopReason).toBe('error')
    expect(captured).toContain('402')
    expect(bodies).toEqual([{ input: { issue: { title: 'swe task', body: 'fix the bug' }, model: 'openrouter/x', repo_path: '/repo' } }])
    await run.dispose()
  })

  it('dispatches, polls, and returns the terminal result', async () => {
    const executions: Record<string, { status: string; result?: unknown }> = { 'exec-1': { status: 'running' } }
    const fetchImpl = stubFetch((url) => {
      if (url.includes('/execute/async/')) return { execution_id: 'exec-1' }
      const state = executions['exec-1']
      if (url.includes('/executions/exec-1') && executions['exec-1']!.status === 'running') {
        executions['exec-1'] = { status: 'succeeded', result: { patch: 'diff' } }
      }
      return state
    })
    const spec = { controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000, fetchImpl }
    const run = startAgentFieldRun(request(), spec)
    const result = await run.result
    expect(result.stopReason).toBe('completed')
    expect(result.output[0]!.type).toBe('text')
    expect((result.output[0]! as { text: string }).text).toContain('"patch"')
    const calls = (fetchImpl as unknown as { calls: Array<{ url: string }> }).calls
    expect(calls.some(call => call.url.includes('/execute/async/swe_af.solve_issue'))).toBe(true)
    expect(calls.some(call => call.url.includes('/executions/exec-1'))).toBe(true)
    await run.dispose()
  })

  it('flattens a failed execution to an error result', async () => {
    const fetchImpl = stubFetch((url) => {
      if (url.includes('/execute/async/')) return { execution_id: 'exec-f' }
      return { status: 'failed', error: 'openrouter 402' }
    })
    const run = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000, fetchImpl,
    })
    const result = await run.result
    expect(result.stopReason).toBe('error')
    await run.dispose()
  })

  it('maps cancellation to an aborted result', async () => {
    const controller = new AbortController()
    const fetchImpl = stubFetch((url) => {
      if (url.includes('/execute/async/')) return { execution_id: 'exec-a' }
      return { status: 'running' }
    })
    const run = startAgentFieldRun(request({ signal: controller.signal }), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 50, timeoutMs: 10_000, fetchImpl,
    })
    setTimeout(() => { controller.abort() }, 20)
    const result = await run.result
    expect(result.stopReason).toBe('aborted')
    await run.dispose()
  })

  it('times out while polling', async () => {
    const fetchImpl = stubFetch(() => ({ status: 'running' }))
    const run = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: -1, fetchImpl,
    })
    const result = await run.result
    expect(result.stopReason).toBe('error')
    await run.dispose()
  })

  it('renders a success with no result payload and a failure with no error detail', async () => {
    const emptyResult = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000,
      fetchImpl: stubFetch((url) => {
        if (url.includes('/execute/async/')) return { execution_id: 'exec-ok' }
        return { status: 'succeeded' }
      }),
    })
    const okResult = await emptyResult.result
    expect(okResult.stopReason).toBe('completed')
    expect((okResult.output[0]! as { text: string }).text).toContain('{}')
    await emptyResult.dispose()

    const noError = startAgentFieldRun(request(), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000,
      fetchImpl: stubFetch((url) => {
        if (url.includes('/execute/async/')) return { execution_id: 'exec-f' }
        return { status: 'failed' }
      }),
    })
    const failedResult = await noError.result
    expect(failedResult.stopReason).toBe('error')
    await noError.dispose()
  })

  it('falls back to a generic issue title without a label', async () => {
    const bodies: unknown[] = []
    const fetchImpl = (async (url, init) => {
      if (rawUrl(url).includes('/execute/async/')) {
        bodies.push(parseBody(init))
        return { ok: true, status: 200, json: async () => ({ execution_id: 'exec-t' }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'succeeded' }) } as Response
    }) as typeof fetch
    const { label: _label, ...unlabelled } = request()
    const run = startAgentFieldRun(unlabelled, {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000, fetchImpl,
    })
    const result = await run.result
    expect(result.stopReason).toBe('completed')
    expect(bodies[0]).toEqual({ input: { issue: { title: 'subagent task', body: 'fix the bug' } } })
    await run.dispose()
  })

  it('rejects a pre-aborted request before dispatch', () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => startAgentFieldRun(request({ signal: controller.signal }), {
      controlPlaneUrl: BASE, target: 'swe_af.solve_issue', pollIntervalMs: 1, timeoutMs: 10_000,
    })).toThrow(/aborted before dispatch/)
  })
})
