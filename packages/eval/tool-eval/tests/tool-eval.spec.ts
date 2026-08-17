import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { CallId } from '@deepseek-ai/dsh-llm'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolEvalConfig as Config } from '../src/types.ts'
import * as tool from '../src/index.ts'

const testToolSignal = new AbortController().signal

/** Stub grader file: only its existence is checked — the shell is mocked. */
const graderDir = mkdtempSync(join(tmpdir(), 'dsh-tool-eval-spec-'))
const graderPath = join(graderDir, 'grader.py')
writeFileSync(graderPath, '#!/usr/bin/env python3\nprint("PASS: stub grader")\n')

function config(benchmarks: Config['benchmarks'] = { fizzbuzz: { grader: graderPath } }): Config {
  return { benchmarks }
}

/** Scripted shell executor: records resolved requests, returns scripted runs. */
class StubShellExecutor extends ShellExecutor {
  scripted: (spec: ShellExecSpec) => ShellRunResult = () => stubResult(0, 'PASS: stub grader')
  readonly calls: Array<{ command: string; stdin: string | undefined; stdoutMaxBytes: number | undefined }> = []

  resolve(request: ShellExecRequest): ShellExecSpec {
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs: request.timeoutMs ?? 1000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 8192,
      ...request.signal ? { signal: request.signal } : {},
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    this.calls.push({ command: spec.command, stdin: spec.stdin, stdoutMaxBytes: spec.stdoutMaxBytes })
    return this.scripted(spec)
  }

  start(): ShellProcess {
    throw new Error('unused')
  }
}

function stubResult(exitCode: number | null, stdout: string, over: Partial<ShellRunResult> = {}): ShellRunResult {
  return {
    exitCode,
    signal: null,
    timedOut: false,
    aborted: false,
    timeoutMs: 1000,
    stdout: { text: stdout, truncated: false },
    stderr: { text: '', truncated: false },
    ...over,
  }
}

async function setup(config: Config) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(StubShellExecutor)
  const shell = ctx.shell as StubShellExecutor
  await ctx.plugin(tool, config)
  return { ctx, shell }
}

let callCounter = 0
function callEval(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: 'eval_case',
    arguments: args,
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe('dsh-tool-eval', () => {
  it('registers an `eval_case` tool whose parameters are {benchmark, output}', async () => {
    const { ctx } = await setup(config())
    const schema = ctx.tools.schemas().find(s => s.name === 'eval_case')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['benchmark', 'output'])
    expect((props.benchmark as { type?: string }).type).toBe('string')
    expect((props.output as { type?: string }).type).toBe('string')
  })

  it('returns the canonical pass result and runs the grader with the output on stdin', async () => {
    const { ctx, shell } = await setup(config())
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'def fizzbuzz(n): ...' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected eval_case success')
    expect(result.value).toEqual({
      benchmark: 'fizzbuzz',
      pass: true,
      exitCode: 0,
      detail: 'PASS: stub grader',
    })
    expect(text(result)).toContain('PASS (exit 0) on benchmark "fizzbuzz"')
    expect(shell.calls[0]?.command).toBe(`python3 '${graderPath}'`)
    expect(shell.calls[0]?.stdin).toBe('def fizzbuzz(n): ...')
  })

  it('reports pass=false with the grader verdict when the grader exits 1', async () => {
    const { ctx, shell } = await setup(config())
    shell.scripted = () => stubResult(1, 'FAIL: fizzbuzz(5) = "buzz", expected "Buzz"')
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'def fizzbuzz(n): ...' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected eval_case success')
    expect(result.value).toEqual({
      benchmark: 'fizzbuzz',
      pass: false,
      exitCode: 1,
      detail: 'FAIL: fizzbuzz(5) = "buzz", expected "Buzz"',
    })
    expect(text(result)).toContain('FAIL (exit 1) on benchmark "fizzbuzz"')
  })

  it('rejects an unknown benchmark id with a loud error naming the configured set', async () => {
    const { ctx } = await setup(config())
    const result = await callEval(ctx, { benchmark: 'nope', output: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('unknown benchmark "nope"')
    expect(text(result)).toContain('configured: fizzbuzz')
  })

  it('rejects a benchmark whose grader script is missing, with the resolved path', async () => {
    const { ctx } = await setup(config({ fizzbuzz: { grader: join(graderDir, 'missing.py') } }))
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('not found')
  })

  it('resolves a relative grader path against the process working directory', async () => {
    const { ctx } = await setup(config({ fizzbuzz: { grader: 'some/relative/grader.py' } }))
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain(resolve(process.cwd(), 'some/relative/grader.py'))
  })

  it('uses the benchmark exec for the grader command', async () => {
    const { ctx, shell } = await setup(config({ fizzbuzz: { grader: graderPath, exec: 'python3.13' } }))
    await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(shell.calls[0]?.command).toBe(`python3.13 '${graderPath}'`)
  })

  it('bounds the grader stdout capture at the fixed cap', async () => {
    const { ctx, shell } = await setup(config())
    await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(shell.calls[0]?.stdoutMaxBytes).toBe(8192)
  })

  it('bounds an oversized grader verdict in the detail with a marker', async () => {
    const { ctx, shell } = await setup(config())
    const long = 'F'.repeat(20_000)
    shell.scripted = () => stubResult(1, long, { stdout: { text: long, truncated: true } })
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected eval_case success')
    const detail = (result.value as { detail: string }).detail
    expect(detail.length).toBeLessThan(10_000)
    expect(detail).toContain('[grader output truncated]')
  })

  it('falls back to stderr when the grader writes no stdout (crashed grader)', async () => {
    const { ctx, shell } = await setup(config())
    shell.scripted = () => stubResult(1, '', {
      stderr: { text: 'Traceback (most recent call last): boom', truncated: false },
    })
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected eval_case success')
    expect(result.value).toEqual({
      benchmark: 'fizzbuzz',
      pass: false,
      exitCode: 1,
      detail: 'Traceback (most recent call last): boom',
    })
  })

  it('reports a cancelled grader run as an abort error', async () => {
    const { ctx, shell } = await setup(config())
    shell.scripted = () => stubResult(null, '', { aborted: true, signal: 'SIGTERM' })
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('tool call aborted')
  })

  it('rejects a grader that times out as an infrastructure failure', async () => {
    const { ctx, shell } = await setup(config())
    shell.scripted = () => stubResult(null, '', { timedOut: true })
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('timed out after 1000ms')
  })

  it('rejects a grader killed by a signal with the signal name', async () => {
    const { ctx, shell } = await setup(config())
    shell.scripted = () => stubResult(null, '', { signal: 'SIGKILL' })
    const result = await callEval(ctx, { benchmark: 'fizzbuzz', output: 'x' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('killed by signal SIGKILL')
  })

  it('rejects missing or mistyped arguments before execute runs (registry arg-validation)', async () => {
    const { ctx } = await setup(config())
    expect((await callEval(ctx, { benchmark: 'fizzbuzz' })).isError).toBe(true)
    expect((await callEval(ctx, { benchmark: 5, output: 'x' })).isError).toBe(true)
    expect((await callEval(ctx, {})).isError).toBe(true)
  })

  it('advertises configured benchmarks and case counts in the model-facing description', async () => {
    const { ctx } = await setup(config({ fizzbuzz: { grader: graderPath, cases: 18 } }))
    const schema = ctx.tools.schemas().find(s => s.name === 'eval_case')!
    expect(schema.description).toContain('fizzbuzz (18 cases)')
    const props = (schema.parameters as { properties?: Record<string, { description?: string }> }).properties ?? {}
    expect(props.benchmark?.description).toContain('configured: fizzbuzz')
  })

  it('presents the call with a stable generic card', async () => {
    const { ctx } = await setup(config())
    const def = ctx.tools.get('eval_case')!
    expect(def.presentCall?.({ benchmark: 'fizzbuzz', output: 'x' })).toEqual({
      card: 'generic',
      title: 'Score output against benchmark',
      kind: 'other',
      rawInput: { benchmark: 'fizzbuzz', output: 'x' },
    })
  })

  it('fails loud at load when no benchmarks are configured', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(StubShellExecutor)
    await expect(ctx.plugin(tool, { benchmarks: {} })).rejects.toThrow(/no benchmarks configured/)
  })

  it('unregisters the tool when its contributing fiber is disposed (HMR-safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(StubShellExecutor)
    const fiber = await ctx.plugin(tool, config())
    expect(ctx.tools.schemas().some(s => s.name === 'eval_case')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().some(s => s.name === 'eval_case')).toBe(false)
  })

  it('has the namespace-plugin export shape (no stray default) so the Loader keeps name/inject/apply', () => {
    expect('default' in tool).toBe(false)
    expect(tool.name).toBe('tool-eval')
    expect(tool.inject).toEqual(['tools', 'shell'])

    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(tool) as Record<string, unknown>
    expect(unwrapped).toBe(tool)
    expect(unwrapped.name).toBe('tool-eval')
    expect(unwrapped.inject).toEqual(['tools', 'shell'])
    expect(typeof unwrapped.apply).toBe('function')
  })
})
