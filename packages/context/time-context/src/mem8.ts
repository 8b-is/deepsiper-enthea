/** Bounded MEM|8 recall for the time-context snapshot. */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Words that do not identify a memory. */
const STOP = new Set([
  'this', 'that', 'with', 'from', 'have', 'your', 'about', 'what', 'when',
  'where', 'which', 'would', 'could', 'should', 'there', 'their', 'them',
  'then', 'than', 'into', 'over', 'after', 'before', 'please', 'just',
])

/** Maximum keywords taken from the latest text. */
const KEYWORD_LIMIT = 4

/** Maximum characters kept from the preceding context. */
const LAST_LIMIT = 120

/** Maximum characters kept from one memory lookup. */
const RECALL_LIMIT = 240

/** Lookup deadline in milliseconds. */
const RECALL_TIMEOUT_MS = 2000

/**
 * Take up to four identifying words from recent text.
 * @param text - Latest user text plus a slice of the preceding context.
 * @returns Lowercase keywords, longest-first ties broken by first appearance.
 */
export function memoryKeywords(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/[^A-Za-z0-9_+|.-]+/)) {
    if (raw.length < 4 || raw.length > 32) continue
    const word = raw.toLowerCase()
    if (STOP.has(word) || seen.has(word)) continue
    seen.add(word)
    found.push(word)
    if (found.length === KEYWORD_LIMIT) break
  }
  return found
}

/**
 * Keep one short line of preceding context.
 * @param text - Previous message text.
 * @returns A single-line excerpt, or `''` when there is nothing to keep.
 */
export function lastContextExcerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return ''
  return flat.length <= LAST_LIMIT ? flat : flat.slice(flat.length - LAST_LIMIT)
}

/**
 * Drop Smart Tree's empty-result chatter and bound a real recall.
 * @param stdout - `st --memory-find` output.
 * @returns A short recall, or `undefined` when the lookup found nothing usable.
 */
export function compactRecall(stdout: string): string | undefined {
  const lines = stdout.split('\n').flatMap(line => {
    const text = line.replace(/\s+/g, ' ').trim()
    if (text.length === 0) return []
    if (text.includes('No memories found') || text.includes('Start daemon')) return []
    return [text]
  })
  if (lines.length === 0) return undefined
  const joined = lines.slice(0, 3).join(' ')
  return joined.length <= RECALL_LIMIT ? joined : joined.slice(0, RECALL_LIMIT)
}

/**
 * Render the MEM|8 section. Keywords and the last excerpt are always named;
 * a recall line appears only when the lookup returned one.
 * @param keywords - Identifying words for this injection.
 * @param last - Bounded preceding context.
 * @param recall - Optional memory lookup result.
 * @returns The section text.
 */
export function renderMem8(keywords: readonly string[], last: string, recall: string | undefined): string {
  const lines = [keywords.length === 0 ? 'MEM|8' : `MEM|8 ${keywords.join(' ')}`]
  if (last.length > 0) lines.push(`last: ${last}`)
  if (recall !== undefined && recall.length > 0) lines.push(recall)
  return lines.join('\n')
}

/**
 * Look up directory memory. A missing command, timeout, or empty result contributes no recall line.
 * @param command - Smart Tree executable.
 * @param cwd - Session directory, when known.
 * @param keywords - Keywords passed to `--memory-find`.
 * @returns A bounded recall, or `undefined`.
 */
export async function findMem8(
  command: string,
  cwd: string | undefined,
  keywords: readonly string[],
): Promise<string | undefined> {
  if (keywords.length === 0) return undefined
  try {
    const { stdout } = await run(command, ['--no-update-check', '--memory-find', keywords.join(',')], {
      ...(cwd === undefined ? {} : { cwd }),
      timeout: RECALL_TIMEOUT_MS,
      windowsHide: true,
    })
    return compactRecall(stdout)
  } catch {
    // The executable can be absent, or the lookup can exceed its deadline.
    return undefined
  }
}
