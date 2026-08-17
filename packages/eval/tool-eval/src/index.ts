/**
 * Agent-in-the-loop eval plugin: registers the `eval_case` tool, which scores
 * a candidate output by running a deployment-configured benchmark grader in a
 * subprocess and returns the verdict. The grader is the sole scoring
 * authority; this plugin only executes it through the `ctx.shell` capability
 * seam, bounds its output, and maps its exit status.
 * @module @deepseek-ai/dsh-tool-eval
 */

import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { BenchmarkConfig, Config, EvalCaseArgs, EvalCaseResult } from './types.ts'
// The `Config` type face re-exports onto the package root (its one home is
// src/types.ts); the emitted index.d.ts keeps the merge for aggregate
// consumers, mirroring the todo tool's type outlet.
export type * from './types.ts'

export const name = 'tool-eval'
export const inject = ['tools', 'shell']

/** Default interpreter for grader scripts when a benchmark sets no `exec`. */
const DEFAULT_EXEC = 'python3'

/**
 * Fixed bound on the grader's captured stdout and the canonical `detail`
 * string. A security invariant, not a tunable: the complete emitted result
 * must be bounded (packages/AGENTS.md "Apply bounds to the complete result").
 */
const MAX_GRADER_DETAIL_CHARS = 8192

/** Schemastery configuration for the eval tool consumer. */
export const Config: z<Config> = z.object({
  benchmarks: z.dict(z.object({
    grader: z.string().required(),
    exec: z.string().default(DEFAULT_EXEC),
    cases: z.natural().min(1),
  }), z.string()).required(),
})

/**
 * Resolve a grader path: absolute paths pass through; relative paths resolve
 * against the harness process working directory (the repo root for the
 * shipped eval leaves, where `dsh` runs from).
 * @param grader - the configured grader path.
 * @returns the absolute grader path.
 */
function resolveGraderPath(grader: string): string {
  return isAbsolute(grader) ? grader : resolve(process.cwd(), grader)
}

/**
 * Single-quote a path for inclusion in the shell command line, so a grader
 * path containing spaces or shell metacharacters cannot split the command.
 * @param value - the path to quote.
 * @returns the shell-single-quoted form.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Build the bounded `detail` field from the grader run: the grader's stdout
 * verdict when present, otherwise its stderr (a crashed grader prints the
 * traceback there); a stream truncated by the executor carries a visible
 * marker, and the string itself is sliced at the fixed cap.
 * @param result - the shell run outcome.
 * @returns the bounded detail string.
 */
function graderDetail(result: ShellRunResult): string {
  const stdout = result.stdout.text.trim()
  const stderr = result.stderr.text.trim()
  const primary = stdout.length > 0 ? stdout : stderr
  const truncated = stdout.length > 0 ? result.stdout.truncated : result.stderr.truncated
  const bounded = primary.length > MAX_GRADER_DETAIL_CHARS
    ? `${primary.slice(0, MAX_GRADER_DETAIL_CHARS)}…`
    : primary
  return truncated ? `${bounded}\n[grader output truncated]` : bounded
}

/**
 * Register the `eval_case` tool on `ctx.tools`. A deployment with no
 * benchmarks is a composition error and fails loud at load.
 * @param ctx - registrant context carrying the tool registry and the shell executor.
 * @param config - the deployment's benchmark set.
 */
export function apply(ctx: Context, config: Config): void {
  const ids = Object.keys(config.benchmarks)
  if (ids.length === 0) {
    throw new Error('tool-eval: no benchmarks configured — add at least one benchmark to `benchmarks`')
  }
  const available = ids.map((id) => {
    const benchmark = config.benchmarks[id] as BenchmarkConfig
    return benchmark.cases === undefined ? id : `${id} (${benchmark.cases} cases)`
  }).join(', ')

  ctx.tools.register(defineTool({
    name: 'eval_case',
    description: 'Score a candidate output against a configured benchmark grader. '
      + 'The grader for `benchmark` runs with `output` fed on stdin; the grader owns the pass/fail verdict '
      + '(exit 0 = pass, non-zero = fail) and this tool reports it with the verdict detail, so a failed '
      + 'output can be revised and re-graded. The grader may execute the candidate as code — grade only '
      + `output you intend to run. Available benchmarks: ${available}.`,
    parameters: {
      benchmark: {
        type: 'string',
        required: true,
        description: `The benchmark id to grade against (configured: ${ids.join(', ')}).`,
      },
      output: {
        type: 'string',
        required: true,
        description: 'The candidate output to score; fed to the grader on stdin.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          benchmark: { type: 'string', required: true },
          pass: { type: 'boolean', required: true },
          exitCode: { type: 'integer', required: true },
          detail: { type: 'string', required: true },
        },
      },
      render: (_args, value: EvalCaseResult) => [{
        type: 'text',
        text: `${value.pass ? 'PASS' : 'FAIL'} (exit ${value.exitCode}) on benchmark ${JSON.stringify(value.benchmark)}: ${value.detail}`,
      }],
    },
    async execute(args: EvalCaseArgs, exec) {
      const benchmark = config.benchmarks[args.benchmark]
      if (benchmark === undefined) {
        throw new Error(`unknown benchmark ${JSON.stringify(args.benchmark)}; configured: ${ids.join(', ')}`)
      }
      const graderPath = resolveGraderPath(benchmark.grader)
      if (!existsSync(graderPath)) {
        throw new Error(`grader for benchmark ${JSON.stringify(args.benchmark)} not found: ${graderPath}`)
      }
      const result = await ctx.shell.run(ctx.shell.resolve({
        command: `${benchmark.exec ?? DEFAULT_EXEC} ${shellQuote(graderPath)}`,
        stdin: args.output,
        stdoutMaxBytes: MAX_GRADER_DETAIL_CHARS,
        signal: exec.signal,
      }))
      if (result.aborted) {
        // Match the registry's canonical cancellation classification even
        // when the caller's signal is not yet observable as aborted here.
        const error = new HarnessError('tool call aborted', TOOL_ABORTED)
        error.name = 'AbortError'
        throw error
      }
      if (result.exitCode === null) {
        throw new Error(`grader for benchmark ${JSON.stringify(args.benchmark)} was killed by signal ${result.signal}`)
      }
      if (result.timedOut) {
        throw new Error(`grader for benchmark ${JSON.stringify(args.benchmark)} timed out after ${result.timeoutMs}ms`)
      }
      return {
        benchmark: args.benchmark,
        pass: result.exitCode === 0,
        exitCode: result.exitCode,
        detail: graderDetail(result),
      }
    },
    presentCall: (args: EvalCaseArgs) => ({
      card: 'generic',
      title: 'Score output against benchmark',
      kind: 'other',
      rawInput: { benchmark: args.benchmark, output: args.output },
    }),
  }))
}
