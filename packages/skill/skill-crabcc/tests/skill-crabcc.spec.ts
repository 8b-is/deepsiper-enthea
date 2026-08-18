/**
 * E2E tests for the crabcc skill provider and tools.
 *
 * Exercises the crabcc integration against the real crabcc 6.x CLI: CLI
 * availability, skill registry contribution, tool registration, and live
 * lookups against a freshly indexed fixture repository.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as SkillCrabcc from '../src/index.ts'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const FIXTURE_MAIN = `fn fizzbuzz(n: i64) -> String {
    if n % 15 == 0 {
        return "FizzBuzz".to_string();
    }
    if n % 3 == 0 {
        return "Fizz".to_string();
    }
    if n % 5 == 0 {
        return "Buzz".to_string();
    }
    n.to_string()
}

fn main() {
    let result = fizzbuzz(15);
    println!("{}", result);
}
`

/** Index a fixture repo with crabcc and run one lookup command. */
async function crabccFixture(root: string, args: string[]): Promise<unknown> {
  return SkillCrabcc.runCrabcc('crabcc', ['--root', root, ...args], { root })
}

async function setupContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(ToolRuntime)
  return ctx
}

describe('skill-crabcc', () => {
  let ctx: Context
  let fiber: { dispose(): Promise<void> | void }
  let fixtureRoot: string

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'skill-crabcc-'))
    await mkdir(join(fixtureRoot, 'src'), { recursive: true })
    await writeFile(join(fixtureRoot, 'src', 'main.rs'), FIXTURE_MAIN)
    await crabccFixture(fixtureRoot, ['index'])
    ctx = await setupContext()
    fiber = ctx.plugin(SkillCrabcc, {
      crabccBin: 'crabcc',
      defaultRoot: process.cwd(),
    })
  })

  afterAll(async () => {
    await fiber?.dispose?.()
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('crabcc --version outputs expected format', async () => {
    const raw = await SkillCrabcc.runCrabcc('crabcc', ['--version'], { text: true })
    expect(typeof raw).toBe('string')
    expect(raw).toMatch(/^crabcc \d+\.\d+\.\d+/)
  })

  it('registers the three crabcc tools', () => {
    const toolNames = ctx.tools.schemas().map(t => t.name)
    expect(toolNames).toContain('code_search')
    expect(toolNames).toContain('goto_definition')
    expect(toolNames).toContain('find_references')
  })

  it('code_search tool has correct schema', () => {
    const tool = ctx.tools.schemas().find(t => t.name === 'code_search')
    expect(tool).toBeDefined()
    expect(tool?.description).toContain('crabcc symbol index')
    expect(tool?.parameters.properties).toHaveProperty('query')
    expect(tool?.parameters.properties).toHaveProperty('includeRefs')
    expect(tool?.parameters.properties).toHaveProperty('limit')
    expect(tool?.parameters.properties).toHaveProperty('root')
  })

  it('skill provider contributes crabcc skill', async () => {
    const skills = await ctx.skills.list({ cwd: process.cwd() })
    const skillNames = skills.map(s => s.name)
    expect(skillNames).toContain('crabcc')
  })

  it('crabcc skill is loadable with content', async () => {
    const skill = await ctx.skills.get('crabcc', { cwd: process.cwd() })
    expect(skill).toBeDefined()
    expect(skill?.name).toBe('crabcc')
    expect(skill?.content).toContain('code_search')
    expect(skill?.content).toContain('goto_definition')
    expect(skill?.content).toContain('find_references')
  })

  it('code_search finds symbols via fuzzy lookup', async () => {
    const raw = await crabccFixture(fixtureRoot, ['lookup', 'fuzzy', 'fizzbuzz', '--limit', '10'])
    expect(Array.isArray(raw)).toBe(true)
    const hits = raw as Array<{ name: string; kind: string; file: string; line: number }>
    const hit = hits.find(h => h.name === 'fizzbuzz')
    expect(hit).toBeDefined()
    expect(hit?.kind).toBe('function')
    expect(hit?.file).toBe('src/main.rs')
    expect(hit?.line).toBeGreaterThan(0)
  })

  it('goto_definition locates the definition line', async () => {
    const raw = await crabccFixture(fixtureRoot, ['lookup', 'sym', 'fizzbuzz'])
    expect(Array.isArray(raw)).toBe(true)
    const hits = raw as Array<{ name: string; file: string; line_start: number; signature?: string }>
    const hit = hits.find(h => h.name === 'fizzbuzz')
    expect(hit).toBeDefined()
    expect(hit?.file).toBe('src/main.rs')
    expect(hit?.line_start).toBeGreaterThan(0)
    expect(hit?.signature).toContain('fizzbuzz')
  })

  it('find_references returns the call site with column', async () => {
    const raw = await crabccFixture(fixtureRoot, ['lookup', 'refs', 'fizzbuzz', '--limit', '10'])
    expect(Array.isArray(raw)).toBe(true)
    const refs = raw as Array<{ file: string; line: number; col: number; snippet?: string }>
    const call = refs.find(r => r.file === 'src/main.rs' && r.line > 1)
    expect(call).toBeDefined()
    expect(call?.col).toBeGreaterThan(0)
    expect(call?.snippet).toContain('fizzbuzz')
  })

  it('skill provider disposes with the fiber', async () => {
    const ctx2 = await setupContext()
    const fiber2 = ctx2.plugin(SkillCrabcc, {
      crabccBin: 'crabcc',
      defaultRoot: process.cwd(),
    })
    expect((await ctx2.skills.list({ cwd: process.cwd() })).map(s => s.name)).toContain('crabcc')
    await fiber2.dispose()
    expect((await ctx2.skills.list({ cwd: process.cwd() })).map(s => s.name)).not.toContain('crabcc')
  })
})
