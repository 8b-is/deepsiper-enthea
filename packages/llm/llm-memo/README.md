# dsh-llm-memo

In-memory exact-match memoization over the `llm/stream` waterfall. An identical
request — same provider, model, messages, tools, and sampling knobs — replays
its previously streamed chunks instead of dispatching the adapter again.

The cache is opt-in, bounded, and invisible to every other plugin: it sits
innermost in the waterfall, so stream validation, session titling, and
checkpoint policy still observe the replayed stream exactly as they observed
the first one. Only the adapter dispatch is skipped.

## Configuration

```yaml
- id: llm-memo
  name: '@deepseek-ai/dsh-llm-memo'
  config:
    enabled: true        # default false — opt in
    maxEntries: 128      # LRU entry bound (default 128)
    maxBytes: 4194304    # total estimated bytes (default 4 MiB)
```

## Model experience

- **Model request effects:** none. A cache hit replays the exact chunks a
  prior identical request produced, so the model sees no difference from a
  fresh response; a miss forwards the request unchanged.
- **Token effects:** a hit performs no inference, so no provider tokens are
  billed and no usage chunk is fabricated — the original usage chunk is
  replayed verbatim.
- **KV-cache effects:** the memo cache is process-local and in-memory only; it
  is unrelated to provider-side prompt/prefix caching (`cacheReadTokens` /
  `cacheWriteTokens`), which pass through untouched on misses.

## Semantics

- **Key** = provider, model, reasoning effort, system prompt, temperature,
  maxTokens, stop, purpose, tools, and message role/content. `signal` (per-call
  cancellation) and `sessionId` (model-hidden transport metadata) are excluded,
  so identical requests share one entry across sessions and calls.
- **Only successful finishes cache** (`stop`, `tool-calls`, `max-tokens`).
  Errors, aborts, and abandoned streams leave nothing behind.
- **Image content bypasses the cache** — attachment references are not a stable
  text key.
- **Eviction** is least-recently-used, bounded by both entry count and total
  estimated bytes.

## Known Limitations and Deferred Work

- The cache is exact-match only: an LLM is not deterministic, so two identical
  `temperature > 0` requests replay the same sampled response rather than
  drawing fresh samples. This is the intended memoization trade-off.
- Byte sizing is an estimate (`JSON.stringify` length) of the chunk sequence,
  not the precise wire cost.
