/**
 * Model-facing `quant_ternary` tool over `ctx.quant` (opt-in). One tool: quantize a weight matrix
 * to BitNet b1.58 ternary codes `{-1, 0, +1}` with per-group scales and report the memory ratio.
 * The tool owns the model schema, execution, summary value, rendering, and UI presentation; it
 * imports no provider. The returned value carries only a compact summary — the full codes/scales
 * matrices never leave the provider — and rendering projects the summary plus a first-row code
 * preview derived purely from the raw arguments.
 *
 * Namespace plugin (named exports, no default export). Injects `tools`, `quant`, and `systemPrompt`.
 * @module @deepseek-ai/dsh-tool-quant
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type GenericCallView } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-quant'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name for loader diagnostics. */
export const name = 'tool-quant'

/** Services required by this plugin. */
export const inject = ['tools', 'quant', 'systemPrompt']

/** Model-visible default for the number of weights per scale group. */
export const DEFAULT_GROUP_SIZE = 128

/** The stable model-facing tool description: what it does, when to use it, and how it fails. */
export const QUANT_TOOL_DESCRIPTION =
  'Quantize a weight matrix to BitNet b1.58 ternary codes in {-1, 0, +1} with per-group scales and report the memory ratio versus FP16. Use for on-device low-bit weight analysis. Backends may be unavailable; the call fails loud when none is registered.'

/** Validated `quant_ternary` arguments. */
export interface QuantTernaryArgs {
  /** The full-precision weight matrix, row-major (`K` rows × `N` columns). */
  readonly weights: readonly number[][]
  /** Number of weights per scale group; must divide the weight column count (default 128). */
  readonly group_size?: number
}

/** The compact summary value returned to the model; codes/scales never leave the provider. */
export interface QuantTernaryValue {
  readonly bits_per_weight: number
  readonly memory_ratio_vs_fp16: number
  readonly quantized_shape: { readonly rows: number; readonly cols: number }
  readonly groups: number
}

const QUANT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bits_per_weight: { type: 'integer', required: true },
    memory_ratio_vs_fp16: { type: 'number', required: true },
    quantized_shape: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rows: { type: 'integer', required: true },
        cols: { type: 'integer', required: true },
      },
      required: true,
    },
    groups: { type: 'integer', required: true },
  },
} as const

/**
 * Register the `quant_ternary` tool.
 * @param ctx - the plugin context (must inject `tools`, `quant`, `systemPrompt`).
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'quant_ternary',
    description: QUANT_TOOL_DESCRIPTION,
    parameters: {
      weights: {
        type: 'array',
        required: true,
        items: { type: 'array', items: { type: 'number' } },
        description: 'The full-precision weight matrix, row-major (K rows × N columns).',
      },
      group_size: {
        type: 'integer',
        default: DEFAULT_GROUP_SIZE,
        description: 'Number of weights per scale group; must divide the weight column count.',
      },
    },
    output: {
      schema: QUANT_OUTPUT_SCHEMA,
      render: renderQuantTernary,
    },
    async execute(args, exec) {
      const groupSize = args.group_size ?? DEFAULT_GROUP_SIZE
      if (!Number.isInteger(groupSize) || groupSize < 1) {
        throw new Error('group_size must be a positive integer')
      }
      assertWeightsMatrix(args.weights)
      const rows = args.weights.length
      const cols = args.weights[0]?.length ?? 0
      const result = await ctx.quant.execute({
        operation: 'quantize',
        weights: { shape: [rows, cols], data: args.weights.flat() },
        groupSize,
      }, exec.signal)
      if (result.kind !== 'quantized') {
        /* v8 ignore next -- a quantize request always yields the quantized kind; unreachable. */
        throw new Error('quant provider returned an unexpected result kind for a quantize request')
      }
      return {
        bits_per_weight: result.bitsPerWeight,
        memory_ratio_vs_fp16: result.memoryRatioVsFp16,
        quantized_shape: { rows, cols },
        groups: result.scales.length,
      }
    },
    presentCall: presentQuantCall,
  }))
}

/** Reject a non-rectangular or empty weight matrix before it reaches the seam. */
function assertWeightsMatrix(weights: readonly number[][]): void {
  if (weights.length === 0) throw new Error('weights must be a non-empty matrix')
  const cols = weights[0]?.length ?? 0
  if (cols === 0) throw new Error('weights rows must be non-empty')
  for (const row of weights) {
    if (row.length !== cols) throw new Error('weights must be a rectangular matrix')
  }
}

/**
 * Derive the first-row code preview from the raw arguments (pure, replayable). The first
 * `min(groupSize, cols)` weights form the first scale group with `scale = max(mean(|w|), 1e-7)`;
 * the preview is the first four `round(clamp(w / scale, -1, 1))` codes. Display-only — the
 * provider remains authoritative.
 * @param weights - the raw weight matrix argument.
 * @param groupSize - the scale-group size.
 * @returns up to four first-row codes, or `undefined` when the matrix has no first row.
 */
export function firstRowCodesPreview(
  weights: readonly number[][],
  groupSize: number,
): readonly number[] | undefined {
  const firstRow = weights[0]
  if (firstRow === undefined || firstRow.length === 0) return undefined
  const group = firstRow.slice(0, Math.min(groupSize, firstRow.length))
  const scale = Math.max(group.reduce((sum, value) => sum + Math.abs(value), 0) / group.length, 1e-7)
  return firstRow.slice(0, 4).map(value => Math.round(Math.max(-1, Math.min(1, value / scale))))
}

/**
 * Render a summary result: one line with the shape, bits per param, memory ratio, and group
 * count, plus the first-row code preview when the arguments provide one.
 * @param args - the raw tool arguments.
 * @param value - the validated summary value.
 * @returns the rendered text content block.
 */
export function renderQuantTernary(args: QuantTernaryArgs, value: QuantTernaryValue): ContentBlock[] {
  const preview = firstRowCodesPreview(args.weights, args.group_size ?? DEFAULT_GROUP_SIZE)
  const previewText = preview === undefined || preview.length === 0
    ? ''
    : ` First row codes: [${preview.join(', ')}].`
  return [{
    type: 'text',
    text: `Quantized W[${value.quantized_shape.rows}x${value.quantized_shape.cols}] to ternary: ${value.bits_per_weight} bits/param, ~${value.memory_ratio_vs_fp16}× vs FP16, ${value.groups} scale groups.${previewText}`,
  }]
}

/**
 * UI presentation for a pending `quant_ternary` call: a generic card whose title carries the
 * matrix shape derived from the arguments.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export function presentQuantCall(args: QuantTernaryArgs): GenericCallView {
  const rows = args.weights.length
  const cols = args.weights[0]?.length ?? 0
  return {
    card: 'generic',
    kind: 'other',
    title: `Quantize W[${rows}x${cols}] to ternary`,
  }
}
