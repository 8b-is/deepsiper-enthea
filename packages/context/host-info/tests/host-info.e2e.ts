import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type SessionEvent } from '@deepseek-ai/dsh-session'
import { probe } from '@deepseek-ai/node-addon-hardware-info'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

// Keep the Loader config under examples so both modes exercise the same deployable
// topology: local fixture source plus bare plugins owned by the examples workspace.
const driver = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/host-info-driver.ts',
  import.meta.url,
))
const configPath = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/host-info.cordis.yml',
  import.meta.url,
))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

/** The pinned model-facing block shape rendered on a supported host. */
const BLOCK_PATTERN = new RegExp(
  '^Host hardware:\\n- System: [^\\n]+\\n- CPU: [^\\n]+ logical \\/ [^\\n]+ physical cores[^\\n]*'
  + '\\n- Memory: [^\\n]+ total, [^\\n]+ available$',
)

async function jsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return jsonlFiles(path)
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : []
  }))
  return paths.flat()
}

function hostInfoSections(events: readonly SessionEvent[]): Array<{ name: string; text: string }> {
  const sectionsOf = (source: unknown): Array<{ name: string; text: string }> => {
    if (typeof source !== 'object' || source === null) return []
    const sections = (source as { sections?: unknown }).sections
    return Array.isArray(sections) ? sections as Array<{ name: string; text: string }> : []
  }
  return events.flatMap((event) => {
    if (event.type !== 'user/message') return []
    const source = event.data.source
    if (source.kind !== 'plugin'
      || source.plugin !== '@deepseek-ai/dsh-system-prompt'
      || !('sections' in source)) return []
    return sectionsOf(source).filter(section => section.name === 'host:info')
  })
}

describe('host-info through a real headless cordis.yml', () => {
  it('logs the assembled host hardware block in the runtime snapshot', { timeout: LOADER_SMOKE_TEST_TIMEOUT_MS }, async () => {
    let events: SessionEvent[] = []
    const { stderr } = await runLoaderSmoke({
      label: 'host-info headless smoke',
      tempDirPrefix: 'host-info-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        const logs = await jsonlFiles(join(cwd, '.sessions'))
        expect(logs).toHaveLength(1)
        const lines = (await readFile(logs[0] as string, 'utf8')).trimEnd().split('\n')
        events = lines.slice(1).map(line => JSON.parse(line) as SessionEvent)
      },
    })
    expect(stderr).not.toContain('UNHANDLED')
    expect(events.some(event => event.type === 'turn/end')).toBe(true)
    const sections = hostInfoSections(events)
    if (probe() === 'supported') {
      expect(sections).toHaveLength(1)
      expect(sections[0]!.text).toBeDefined()
      expect(sections[0]!.text).toMatch(BLOCK_PATTERN)
    } else {
      expect(sections).toHaveLength(0)
    }
  })
})
