/**
 * Pure types of the agent-driven eval domain: the ONE home of the eval-tool
 * configuration, call-argument, and canonical-result types, free of this
 * package's host-side value imports (cordis, schemastery, dsh-tools,
 * dsh-shell). Two namespace projections serve it — `./types` for host
 * consumers, `./client/types` (the client half-entry's re-export) for client
 * aggregates — with zero content duplication.
 *
 * @module @deepseek-ai/dsh-tool-eval/types
 */

/** One configured benchmark: the grader command plus optional metadata. */
export interface BenchmarkConfig {
  /**
   * Absolute or harness-process-relative path to the grader script. The
   * grader reads the candidate output on stdin, prints one verdict line, and
   * exits 0 on pass / non-zero on fail.
   */
  grader: string
  /** Interpreter that runs the grader script (defaults to `python3`). */
  exec?: string
  /**
   * Case-count metadata for the benchmark, surfaced in the model-facing
   * description when set. The grader remains the scoring authority; this
   * field only informs the model about coverage.
   */
  cases?: number
}

/** Model-facing eval-tool configuration: the deployment's benchmark set. */
export interface Config {
  /** Benchmark id → grader configuration; at least one is required. */
  benchmarks: Record<string, BenchmarkConfig>
}

/** Model-supplied arguments of one `eval_case` call. */
export interface EvalCaseArgs {
  /** The benchmark id to grade against (must be a configured key). */
  benchmark: string
  /** The candidate output to score; fed to the grader on stdin. */
  output: string
}

/** Canonical result of one graded candidate. */
export interface EvalCaseResult {
  /** The benchmark id that was graded. */
  benchmark: string
  /** True when the grader exited 0 (its pass convention). */
  pass: boolean
  /** The grader's exit code (null is rejected as an infrastructure failure). */
  exitCode: number
  /**
   * The grader's verdict text: stdout when present, otherwise stderr (a
   * crashed grader prints its traceback there), bounded with a truncation
   * marker when the grader wrote more than the fixed cap.
   */
  detail: string
}
