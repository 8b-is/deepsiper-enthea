/**
 * One-shot AgentField swe_af child lifecycle: dispatch the task to the control
 * plane's reasoner over its async-execute REST API, poll until settlement,
 * and map the terminal execution to the shared subagent run result.
 *
 * @module @deepseek-ai/dsh-subagent-agentfield/run
 */

import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SubagentResult,
  SubagentRun,
  SubagentStartRequest,
  SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import { settleRunResult, subprocessRunHandle } from '@deepseek-ai/dsh-subagent'

/** Fully resolved inputs for one AgentField run. */
export interface AgentFieldRunSpec {
  /** Control plane base URL, e.g. `http://100.105.72.88:8085`. */
  readonly controlPlaneUrl: string
  /** Reasoner target in `node.reasoner` form (defaults to `swe_af.solve_issue`). */
  readonly target: string
  /** Optional model override passed in the input kwargs (e.g. `openrouter/…`). */
  readonly model?: string
  /** Poll cadence in milliseconds. */
  readonly pollIntervalMs: number
  /** Hard polling deadline in milliseconds. */
  readonly timeoutMs: number
  /** Diagnostic sink for a post-publication failure flattened into a result. */
  readonly onError?: (error: Error, stopReason: SubagentStopReason) => void
  /** Optional test seam replacing the global `fetch`. */
  readonly fetchImpl?: typeof fetch
  /** Absolute repo path the task operates on, when the parent session has one. */
  readonly cwd?: string
}

/** A terminal poll state returned by the control plane. */
interface ExecutionState {
  status: string
  result?: unknown
  error?: unknown
}

/** Normalize a reasoner target to `node.reasoner` dot form. */
export function normalizeTarget(target: string): string {
  return target.replace(/:/g, '.')
}

/** Validate the one-shot task as a non-empty text sequence. */
export function textTask(prompt: readonly ContentBlock[]): string[] {
  if (prompt.length === 0) {
    throw new Error('subagent-agentfield: the one-shot task must contain only text blocks')
  }
  const texts: string[] = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error('subagent-agentfield: the one-shot task must contain only text blocks')
    }
    texts.push(block.text)
  }
  if (texts.every(text => text.trim().length === 0)) {
    throw new Error('subagent-agentfield: the one-shot task must not be empty')
  }
  return texts
}

/** Dispatch the task to the control plane and return the execution id. */
async function dispatch(
  baseUrl: string,
  target: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/api/v1/execute/async/${normalizeTarget(target)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    throw new Error(`subagent-agentfield: dispatch failed (${response.status}): ${await response.text()}`)
  }
  const data = (await response.json()) as { execution_id?: string }
  if (data.execution_id === undefined) {
    throw new Error('subagent-agentfield: dispatch response omitted execution_id')
  }
  return data.execution_id
}

/** Sleep for the poll interval, aborting immediately on cancellation. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

/**
 * Start the swe_af run: dispatch asynchronously, then poll until the execution
 * succeeds, fails, times out, or is cancelled, publishing the run immediately
 * after dispatch (a remote run has no local Agent).
 * @param request - resolved shared subagent request.
 * @param spec - control plane endpoint, target, model, and polling policy.
 * @returns the published run.
 */
export function startAgentFieldRun(
  request: SubagentStartRequest,
  spec: AgentFieldRunSpec,
): SubagentRun {
  const texts = textTask(request.prompt)
  if (request.signal.aborted) {
    throw new Error('subagent-agentfield: request was aborted before dispatch')
  }
  /* v8 ignore next -- the production fallback uses global fetch, which unit tests stub */
  const fetchImpl = spec.fetchImpl ?? fetch
  const baseUrl = spec.controlPlaneUrl.replace(/\/+$/, '')

  const runAbort = new AbortController()
  const requestCancel = (): void => {
    if (runAbort.signal.aborted) return
    runAbort.abort(new Error('subagent-agentfield: run cancelled locally'))
  }
  const onAbort = (): void => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })

  let latestOutput: ContentBlock[] = []

  const attempt = async (): Promise<SubagentResult> => {
    /* v8 ignore next 2 -- both spread sides are asserted via the dispatch body in the kwargs test */
    const modelField = spec.model === undefined ? {} : { model: spec.model }
    const cwdField = spec.cwd === undefined ? {} : { repo_path: spec.cwd }
    const executionId = await dispatch(baseUrl, spec.target, {
      input: {
        issue: {
          title: request.label ?? 'subagent task',
          body: texts.join('\n'),
        },
        ...modelField,
        ...cwdField,
      },
    }, runAbort.signal, fetchImpl)
    latestOutput = [{ type: 'text', text: `subagent-agentfield: dispatched ${executionId}` }]

    const deadline = Date.now() + spec.timeoutMs
    while (true) {
      runAbort.signal.throwIfAborted()
      /* v8 ignore next 2 -- the timeout test asserts the 'error' result this wall-clock throw produces */
      if (Date.now() > deadline) {
        throw new Error('subagent-agentfield: execution timed out while polling')
      }
      const response = await fetchImpl(`${baseUrl}/api/v1/executions/${executionId}`, {
        signal: runAbort.signal,
      })
      if (!response.ok) {
        throw new Error(`subagent-agentfield: poll failed (${response.status}): ${await response.text()}`)
      }
      const state = (await response.json()) as ExecutionState
      if (state.status === 'succeeded') {
        const text = JSON.stringify(state.result ?? {}, null, 2)
        latestOutput = [{ type: 'text', text }]
        return { output: latestOutput, stopReason: 'completed' }
      }
      if (state.status === 'failed') {
        const detail = typeof state.error === 'string'
          ? state.error
          : JSON.stringify(state.error ?? 'unknown error')
        throw new Error(`subagent-agentfield: execution failed: ${detail}`)
      }
      await delay(spec.pollIntervalMs, runAbort.signal)
    }
  }

  const result: Promise<SubagentResult> = settleRunResult({
    attempt,
    collectOutput: () => latestOutput,
    cancelled: () => runAbort.signal.aborted,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: SessionId(randomUUID()),
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    // A remote poll has no process to tear down; stopping the poll is enough.
    teardown: () => { runAbort.abort(new Error('subagent-agentfield: run disposed')); return Promise.resolve() },
  })
}
