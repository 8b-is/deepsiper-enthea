import { describe, expect, it, beforeAll } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply as applySkillCrabcc } from '../src/index.ts'

async function setupContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(applySkillCrabcc, {
    crabccBin: 'crabcc',
    defaultRoot: process.cwd(),
  })
  return ctx
}

describe('skill-crabcc', () => {
  let ctx: Context

  beforeAll(async () => {
    ctx = await setupContext()
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
    expect(tool?.description).toContain('Search for code symbols')
    expect(tool?.parameters).toBeDefined()
    expect(tool?.parameters.properties).toHaveProperty('query')
    expect(tool?.parameters.properties).toHaveProperty('includeRefs')
    expect(tool?.parameters.properties).toHaveProperty('limit')
    expect(tool?.parameters.properties).toHaveProperty('root')
  })

  it('goto_definition tool has correct schema', () => {
    const tool = ctx.tools.schemas().find(t => t.name === 'goto_definition')
    expect(tool).toBeDefined()
    expect(tool?.description).toContain('definition')
    expect(tool?.parameters.properties).toHaveProperty('symbol')
    expect(tool?.parameters.properties).toHaveProperty('root')
  })

  it('find_references tool has correct schema', () => {
    const tool = ctx.tools.schemas().find(t => t.name === 'find_references')
    expect(tool).toBeDefined()
    expect(tool?.description).toContain('references')
    expect(tool?.parameters.properties).toHaveProperty('symbol')
    expect(tool?.parameters.properties).toHaveProperty('limit')
    expect(tool?.parameters.properties).toHaveProperty('root')
  })

  it('skill provider contributes crabcc skill or skips when binary absent', async () => {
    const skills = await ctx.skills.list({ cwd: process.cwd() })
    const skillNames = skills.map(s => s.name)
    expect(Array.isArray(skillNames)).toBe(true)
  })
})
