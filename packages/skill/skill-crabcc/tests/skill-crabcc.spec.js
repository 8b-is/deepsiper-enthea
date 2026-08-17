/**
 * E2E tests for crabcc skill provider and tools.
 *
 * These tests boot a real Cordis context with the skill-crabcc plugin,
 * verify tools are registered, and exercise the crabcc CLI through the tools.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { apply as applySkillCrabcc } from "../src/index.js";
import { apply as applyTools } from '@deepseek-ai/dsh-tools';
import { apply as applySkills } from '@deepseek-ai/dsh-skill';
import { apply as applySkillFS } from '@deepseek-ai/dsh-skill-filesystem';
const TEST_ROOT = process.cwd();
describe('skill-crabcc', () => {
    let ctx;
    let abortController;
    beforeAll(async () => {
        ctx = new Context();
        abortController = new AbortController();
        // Register core services needed by skill-crabcc
        ctx.plugin(applyTools);
        ctx.plugin(applySkills);
        ctx.plugin(applySkillFS, { watch: false });
        ctx.plugin(applySkillCrabcc, {
            crabccBin: 'crabcc',
            defaultRoot: TEST_ROOT,
        });
        // Start the context
        await ctx.start();
    });
    afterAll(async () => {
        abortController.abort();
        await ctx.stop();
    });
    it('registers the three crabcc tools', () => {
        const toolNames = ctx.tools.list().map((t) => t.name);
        expect(toolNames).toContain('code_search');
        expect(toolNames).toContain('goto_definition');
        expect(toolNames).toContain('find_references');
    });
    it('code_search tool has correct schema', () => {
        const tool = ctx.tools.get('code_search');
        expect(tool).toBeDefined();
        expect(tool?.description).toContain('Search for symbols');
        expect(tool?.parameters).toBeDefined();
        expect(tool?.parameters.properties).toHaveProperty('query');
        expect(tool?.parameters.properties).toHaveProperty('includeRefs');
        expect(tool?.parameters.properties).toHaveProperty('limit');
        expect(tool?.parameters.properties).toHaveProperty('root');
    });
    it('goto_definition tool has correct schema', () => {
        const tool = ctx.tools.get('goto_definition');
        expect(tool).toBeDefined();
        expect(tool?.description).toContain('definition');
        expect(tool?.parameters.properties).toHaveProperty('symbol');
        expect(tool?.parameters.properties).toHaveProperty('root');
    });
    it('find_references tool has correct schema', () => {
        const tool = ctx.tools.get('find_references');
        expect(tool).toBeDefined();
        expect(tool?.description).toContain('references');
        expect(tool?.parameters.properties).toHaveProperty('symbol');
        expect(tool?.parameters.properties).toHaveProperty('limit');
        expect(tool?.parameters.properties).toHaveProperty('root');
    });
    it('skill provider contributes crabcc skill', async () => {
        const skills = await ctx.skills.list({ cwd: TEST_ROOT, signal: abortController.signal });
        const skillNames = Array.isArray(skills) ? skills.map((s) => s.name) : skills.candidates.map((s) => s.name);
        expect(skillNames).toContain('crabcc');
    });
    it('crabcc skill is loadable with content', async () => {
        const skill = await ctx.skills.get('crabcc', { cwd: TEST_ROOT, signal: abortController.signal });
        expect(skill).toBeDefined();
        expect(skill?.name).toBe('crabcc');
        expect(skill?.content).toContain('code_search');
        expect(skill?.content).toContain('goto_definition');
        expect(skill?.content).toContain('find_references');
    });
    it('code_search executes and returns results', async () => {
        const result = await ctx.tools.call('code_search', { query: 'test', limit: 5 }, { signal: abortController.signal });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('results');
        expect(result).toHaveProperty('query', 'test');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.results)).toBe(true);
    });
    it('goto_definition executes and returns result', async () => {
        const result = await ctx.tools.call('goto_definition', { symbol: 'test' }, { signal: abortController.signal });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('found');
        expect(result).toHaveProperty('symbol', 'test');
    });
    it('find_references executes and returns result', async () => {
        const result = await ctx.tools.call('find_references', { symbol: 'test', limit: 5 }, { signal: abortController.signal });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('symbol', 'test');
        expect(result).toHaveProperty('references');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.references)).toBe(true);
    });
    it('tools handle missing symbols gracefully', async () => {
        const result = await ctx.tools.call('goto_definition', { symbol: 'NonExistentSymbolXYZ123' }, { signal: abortController.signal });
        expect(result).toBeDefined();
        expect(result).toHaveProperty('found', false);
        expect(result).toHaveProperty('symbol', 'NonExistentSymbolXYZ123');
    });
});
describe('crabcc CLI availability', () => {
    it('crabcc binary is available in PATH', async () => {
        const { spawn } = await import('node:child_process');
        const result = await new Promise((resolve) => {
            const child = spawn('crabcc', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (c) => (stdout += c));
            child.stderr.on('data', (c) => (stderr += c));
            child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
        });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('crabcc');
    });
});
//# sourceMappingURL=skill-crabcc.spec.js.map