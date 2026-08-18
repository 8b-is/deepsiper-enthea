/**
 * REAL-composition test for tool-everos: boots a test-only `cordis.yml`
 * through the Loader with the real dsh-tools registry and the tool-everos
 * plugin, pointed at a local in-memory EverOS stub. Exercises the assembled
 * tool pipeline end to end — store a conversation, flush it, search it back.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as EverosTool from '../src/index.ts'
import { EverosStubServer } from './everos-stub.ts'

let root: string | undefined
let context: Context | undefined
let stub: EverosStubServer | undefined

const signal = new AbortController().signal
let callCounter = 0

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await stub?.close()
  stub = undefined
})

async function setup(): Promise<Context> {
  stub = new EverosStubServer()
  await stub.start()
  root = await mkdtemp(join(tmpdir(), 'dsh-tool-everos-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-tool-everos'",
    '  config:',
    `    baseURL: '${stub.url}'`,
    "    appId: 'harness-eval'",
    "    projectId: 'everos-wire'",
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier === '@deepseek-ai/dsh-system-prompt') return SystemPrompt
      if (specifier === '@deepseek-ai/dsh-tools') return ToolRuntime
      if (specifier === '@deepseek-ai/dsh-tool-everos') return EverosTool
      throw new Error(`unexpected Loader import: ${specifier}`)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('tool-everos real Loader composition', () => {
  it('stores, flushes, and searches memory through the booted composition', async () => {
    const ctx = await setup()
    const names = ctx.tools.schemas().map(s => s.name)
    expect(names).toEqual(expect.arrayContaining(['everos_memory_add', 'everos_memory_flush', 'everos_memory_search']))

    const add = await ctx.tools.execute({
      signal,
      callId: CallId(`call-${++callCounter}`),
      name: 'everos_memory_add',
      arguments: {
        session_id: 'sess-composed',
        messages: [
          { sender_id: 'user-1', role: 'user', timestamp: 1_700_000_000_000, content: 'prefers concise answers' },
          { sender_id: 'agent', role: 'assistant', timestamp: 1_700_000_000_001, content: 'noted' },
        ],
      },
    })
    expect(add.value).toEqual({ request_id: 'req-1', message_count: 2, status: 'accumulated' })

    const flush = await ctx.tools.execute({
      signal,
      callId: CallId(`call-${++callCounter}`),
      name: 'everos_memory_flush',
      arguments: { session_id: 'sess-composed' },
    })
    expect(flush.value).toEqual({ request_id: 'req-2', status: 'extracted' })

    const search = await ctx.tools.execute({
      signal,
      callId: CallId(`call-${++callCounter}`),
      name: 'everos_memory_search',
      arguments: { user_id: 'user-1', query: 'answer style', method: 'keyword' },
    })
    expect(search.value).toMatchObject({
      episodes: [{ session_id: 'sess-composed', summary: 'prefers concise answers', score: 0.9 }],
    })
  })

  it('applies the configured default app/project scope to requests', async () => {
    const ctx = await setup()
    await ctx.tools.execute({
      signal,
      callId: CallId(`call-${++callCounter}`),
      name: 'everos_memory_add',
      arguments: {
        session_id: 'sess-scoped',
        messages: [{ sender_id: 'user-1', role: 'user', timestamp: 1, content: 'x' }],
      },
    })
    expect(stub?.requests[0]?.body).toMatchObject({ app_id: 'harness-eval', project_id: 'everos-wire' })
  })
})
