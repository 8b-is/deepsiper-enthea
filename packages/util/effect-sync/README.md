# @deepseek-ai/dsh-effect-sync

English | [中文](README.zh.md)

A synchronous disposer seam over Cordis `ctx.effect`. Seam registries (provider registration, service lifecycle) expose a synchronous dispose API, but `ctx.effect` returns an async disposer — the historical workaround is `() => void dispose()`, discarding the promise. `effectSync` gives callers a sync, idempotent disposer with the same fiber-scoped lifecycle, routing the async reject path to a structured log instead of an unhandled rejection.

## API

```ts
effectSync(
  ctx: Context,
  setup: (registerTeardown: (teardown: () => void) => void) => void,
  label: string,
): () => void
```

- `setup` runs synchronously at call time; call `registerTeardown(cleanup)` to hand back the teardown.
- The returned disposer runs the teardown exactly once — on the first explicit `dispose()` or fiber disposal, whichever comes first — and is idempotent.
- The async `ctx.effect` disposer is released on explicit dispose; a rejection is logged as `[effect-sync:<label>] effect dispose failed`, never left unhandled.

## Model Experience

None; pure util, no model-visible surface.

#### Token effect

None.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **The async reject path is logged, not surfaced** — `effectSync` cannot propagate an async disposal failure to the sync caller; the failure is visible only through the structured log line. Callers that must react to disposal failures should use `ctx.effect` directly.
