import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, createMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '@deepseek-ai/dsh-llm-memo'

const SCRIPT: StreamChunk[] = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'hi' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'hi' } },
  { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } },
  { type: 'finish', reason: { kind: 'stop' } },
]

const ERROR_SCRIPT: StreamChunk[] = [
  { type: 'usage', usage: { inputTokens: 1, outputTokens: 0 } },
  { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'UNKNOWN' } } },
]

class CountingAdapter extends LlmAdapter {
  calls = 0
  constructor(private readonly script: StreamChunk[]) {
    super()
  }

  override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls += 1
    yield * this.script
  }
}

const message = (text: string) => createMessage({
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

async function mount(enabled: boolean, maxEntries = 16): Promise<{ ctx: Context; adapter: CountingAdapter }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  apply(ctx, { enabled, maxEntries })
  const adapter = new CountingAdapter(SCRIPT)
  ctx.llm.registerAdapter(['test-provider'], adapter)
  return { ctx, adapter }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('llm-memo', () => {
  it('replays an identical request from cache without dispatching the adapter again', async () => {
    const { ctx, adapter } = await mount(true)
    const request = { provider: 'test-provider', model: 'test-model', messages: [message('hello')] }

    const first = await drain(ctx.llm.stream(request))
    const second = await drain(ctx.llm.stream(request))

    expect(adapter.calls).toBe(1)
    expect(first).toEqual(SCRIPT)
    expect(second).toEqual(SCRIPT)
  })

  it('misses on a different request', async () => {
    const { ctx, adapter } = await mount(true)
    await drain(ctx.llm.stream({ provider: 'test-provider', model: 'test-model', messages: [message('a')] }))
    await drain(ctx.llm.stream({ provider: 'test-provider', model: 'test-model', messages: [message('b')] }))

    expect(adapter.calls).toBe(2)
  })

  it('does not cache a stream that ends in an error finish', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    apply(ctx, { enabled: true })
    const adapter = new CountingAdapter(ERROR_SCRIPT)
    ctx.llm.registerAdapter(['test-provider'], adapter)

    const request = { provider: 'test-provider', model: 'test-model', messages: [message('hello')] }
    await drain(ctx.llm.stream(request))
    await drain(ctx.llm.stream(request))

    expect(adapter.calls).toBe(2)
  })

  it('evicts least-recently-used entries beyond maxEntries', async () => {
    const { ctx, adapter } = await mount(true, 1)
    const first = { provider: 'test-provider', model: 'test-model', messages: [message('first')] }
    const second = { provider: 'test-provider', model: 'test-model', messages: [message('second')] }

    await drain(ctx.llm.stream(first))
    await drain(ctx.llm.stream(second))
    // `first` was evicted when `second` filled the single slot.
    await drain(ctx.llm.stream(first))

    expect(adapter.calls).toBe(3)
  })

  it('is a no-op when disabled', async () => {
    const { ctx, adapter } = await mount(false)
    const request = { provider: 'test-provider', model: 'test-model', messages: [message('hello')] }

    await drain(ctx.llm.stream(request))
    await drain(ctx.llm.stream(request))

    expect(adapter.calls).toBe(2)
  })
})
