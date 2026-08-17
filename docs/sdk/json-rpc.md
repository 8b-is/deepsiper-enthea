# JSON-RPC SDK & OpenCode Bridge

Deepsiper Enthea exposes a high-performance JSON-RPC 2.0 interface for programmatic orchestration from OpenCode, IDEs, or continuous evaluation pipelines.

## TypeScript SDK Usage

```typescript
import { createHarnessClient } from '@deepseek-ai/dsh-sdk'

const client = createHarnessClient({
  endpoint: 'ws://127.0.0.1:3080/rpc',
})

await client.connect()

// Create an evaluation session
const session = await client.createSession({
  preset: 'eval-sovereign',
  workspace: process.cwd(),
})

// Dispatch a task and listen for events
const stream = session.dispatchTask({
  prompt: 'Evaluate tool execution robustness under adversarial perturbations',
})

for await (const event of stream) {
  console.log(`[Event ${event.type}]`, event.payload)
}
```

## Protocol Methods

- `session.create`: Initialize a session with preset configuration.
- `session.dispatch`: Run an agent loop iteration with prompt.
- `session.abort`: Cancel active agent or tool execution.
- `eval.report`: Retrieve aggregated benchmark metrics.
