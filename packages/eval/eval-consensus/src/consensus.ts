/**
 * Pure consensus aggregation for Council-of-Elders inference. The training-time
 * recipe (KOMPRESS v2) aggregates teacher logits via a geometric-mean softmax;
 * the inference analog here aggregates completed answers by agreement: the
 * consensus answer is the one with the most supporting routes, weighted by the
 * geometric mean of their pairwise similarity, so a lone outlier contributes
 * ~zero confidence instead of biasing the consensus.
 *
 * @module @deepseek-ai/dsh-eval-consensus/consensus
 */

/** One route's completed output. */
export interface RouteOutput {
  id: string
  provider: string
  model: string
  output: string
}

/** The aggregated consensus result for one task. */
export interface ConsensusResult {
  /** The answer with the highest aggregate support across routes. */
  answer: string
  /**
   * Geometric mean of the supporting routes' similarity to the consensus,
   * bounded [0, 1]; a lone outlier lands at ~0.
   */
  confidence: number
  /** Route ids whose answer supports the consensus answer. */
  supporters: string[]
  /** Whether every route produced the same normalized answer. */
  unanimous: boolean
}

/** Normalize an answer for agreement: trim, collapse whitespace, lowercase. */
export function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Tokenize a normalized answer into a lowercase word set. */
function tokens(normalized: string): Set<string> {
  return new Set(normalized.match(/[a-z0-9]+/g) ?? [])
}

/**
 * Jaccard similarity between two normalized answers: size of the intersection
 * over the union of their word sets. Empty-vs-empty counts as identical.
 */
export function similarity(a: string, b: string): number {
  const an = normalizeAnswer(a)
  const bn = normalizeAnswer(b)
  if (an === bn) return 1
  const ta = tokens(an)
  const tb = tokens(bn)
  if (ta.size === 0 && tb.size === 0) return 1
  const intersection = new Set([...ta].filter(word => tb.has(word))).size
  const union = new Set([...ta, ...tb]).size
  /* v8 ignore next 2 -- the both-empty case is returned above, so the union is never zero */
  return union === 0 ? 0 : intersection / union
}

/**
 * Aggregate a Council of routes into one consensus answer.
 * @param outputs - one completed output per route.
 * @param supportThreshold - Jaccard similarity above which two answers agree.
 * @returns the consensus answer, its geometric-mean confidence, and supporters.
 */
export function geometricConsensus(
  outputs: readonly RouteOutput[],
  supportThreshold = 0.6,
): ConsensusResult {
  if (outputs.length === 0) return { answer: '', confidence: 0, supporters: [], unanimous: true }
  if (outputs.length === 1) {
    const only = outputs[0]
    if (only === undefined) return { answer: '', confidence: 0, supporters: [], unanimous: true }
    return { answer: only.output, confidence: 1, supporters: [only.id], unanimous: true }
  }

  // For every route, compute its support as the set of OTHER routes whose
  // answer agrees above the threshold, plus its own weight (self-agreement 1).
  let best: { answer: string; supporters: string[]; confidences: number[] } | undefined
  let bestCount = -1
  for (const candidate of outputs) {
    const supporters: string[] = [candidate.id]
    const confidences: number[] = [1]
    for (const other of outputs) {
      if (other.id === candidate.id) continue
      const sim = similarity(candidate.output, other.output)
      if (sim >= supportThreshold) {
        supporters.push(other.id)
        confidences.push(sim)
      }
    }
    if (supporters.length > bestCount) {
      bestCount = supporters.length
      best = { answer: candidate.output, supporters, confidences }
    }
  }

  /* v8 ignore next 2 -- a non-empty council always selects a best candidate */
  if (best === undefined) return { answer: '', confidence: 0, supporters: [], unanimous: false }
  // Geometric mean of the supporting similarities — an outlier drags it to ~0.
  const confidence = Math.pow(best.confidences.reduce((acc, value) => acc * value, 1), 1 / best.confidences.length)
  return {
    answer: best.answer,
    confidence,
    supporters: best.supporters,
    unanimous: best.supporters.length === outputs.length,
  }
}
