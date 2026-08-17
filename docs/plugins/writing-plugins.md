# Authoring Custom Plugins

In Deepsiper Enthea, **everything is a Cordis plugin**. Capability seams, tools, evaluation metrics, and LLM providers are instantiated as composable plugins.

## Plugin Structure

A typical plugin exports a `name`, dependency injections (`inject`), configuration schema (`Config`), and an `apply` activation function:

```typescript
import { Context, Schema } from '@deepseek-ai/cordis'

export interface MyPluginConfig {
  threshold?: number
  enabled?: boolean
}

export const Config: Schema<MyPluginConfig> = Schema.object({
  threshold: Schema.number().default(0.8).description('Evaluation pass threshold'),
  enabled: Schema.boolean().default(true).description('Enable plugin execution'),
})

export const name = 'my-custom-eval'
export const inject = ['tools', 'session']

export function apply(ctx: Context, config: MyPluginConfig) {
  // Register effects, lifecycle listeners, or tools
  ctx.on('ready', () => {
    ctx.logger('my-plugin').info('Custom eval plugin active with threshold %d', config.threshold)
  })

  // Register a custom evaluation tool
  ctx.tools?.register({
    name: 'custom_eval',
    description: 'Executes benchmark validation on target candidate',
    parameters: {
      type: 'object',
      properties: {
        candidateId: { type: 'string' },
      },
      required: ['candidateId'],
    },
    async execute(args) {
      return { score: 0.95, passed: true }
    },
  })
}
```

## Lifecycle & Disposal

Cordis plugins automatically dispose registered resources when their parent fiber is unloaded. Always register listeners and timers via `ctx.on` and `ctx.effect`.
