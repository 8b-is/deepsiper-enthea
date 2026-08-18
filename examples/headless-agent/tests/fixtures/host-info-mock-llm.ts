import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'

/** Deterministic one-step adapter for the host-info Loader fixture. */
class HostInfoMockAdapter extends LlmAdapter {
  async * stream(): AsyncIterable<StreamChunk> {
    const text = 'host hardware sampled'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'host-info-mock-llm'
export const inject = ['llm']

/** Register the test-only `host-info-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['host-info-mock'], new HostInfoMockAdapter())
}
