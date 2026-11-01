# Run with OpenCode's ChatGPT connection

English | [中文](README.zh.md)

This opt-in example runs Deepsiper locally with GPT-6 Astra through the ChatGPT connection already selected in OpenCode V2. Tools and session storage run on your machine; inference uses OpenAI's hosted Codex endpoint.

## Start the application

1. Install the repository's supported Node.js version and pnpm, and sign in to OpenAI through OpenCode V2. Select that connection as active. The `opencode` executable must be on the launcher's `PATH`, under the OS account that owns the connection.
2. Install and build from the repository root:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   ```

3. Check that OpenCode exposes one usable OAuth credential:

   ```sh
   pnpm local:opencode check
   ```

   This prints the configured model and token expiry without revealing the token. It validates credential metadata; it does not make a model request.

4. Launch the browser application:

   ```sh
   DSH_HOME="$HOME/.local/share/deepsiper-opencode" pnpm local:opencode web --host 127.0.0.1 --port 5888
   ```

   Open the printed URL, dismiss the first-run notice, and select a workspace. The model selector shows **GPT-6 Astra** with **High** reasoning. Send a small task and inspect its tool results.

5. For a terminal-only request, use:

   ```sh
   pnpm local:opencode headless "Reply with exactly ASTRA_CONNECTED"
   ```

## Connection reference

The [launcher](../../scripts/opencode-local.ts) reads `opencode api get /api/credential` through OpenCode's authenticated CLI. It passes only the selected access token to the harness through `DSH_OPENCODE_ACCESS_TOKEN`; it does not write OAuth credentials to files. OpenCode owns login and token refresh. The [overlay](cordis.patch.yml) declares the model and its reasoning options through the existing [pi-ai provider](../../packages/llm/llm-pi-ai/README.md).

Credentials are captured once per launch. A missing, ambiguous, non-OAuth, expired, or imminently expiring connection prevents startup. At token expiry the launcher stops the harness and returns failure. Refresh the connection in OpenCode, run `check`, and restart the launcher or its service. Restarting alone does not refresh an expired credential. SIGINT and SIGTERM cancel the child and return status `130`.

The model transport uses SSE so headless requests can exit without a cached model WebSocket keeping the process alive. Browser event delivery uses separate WebSocket connections. [The Agent Note](../../.agents/notes/implemented/feature/2026-11-01-opencode-chatgpt-launcher.md) records credential ownership and transport rationale.

### Reverse-proxy deployment

Keep the harness on loopback and add `--trusted-host <public-hostname>` when launching behind a proxy. Terminate HTTPS and authenticate requests at the gateway; forward the public `Host` and WebSocket upgrades for `/api/events.host` and `/api/events.mux`. A browser gateway password is a separate credential from the model's OAuth access token.

Keep `DSH_HOME` stable across service restarts to retain settings and sessions. Configure the service with the same OS user and OpenCode connection environment as an interactive launch.

## Verification

After building, run the credential/lifecycle tests and the assembled keyless catalog snapshot:

```sh
pnpm exec vitest run scripts/opencode-local.spec.ts scripts/opencode-local-launch.spec.ts
pnpm exec vitest run --config vitest.e2e.config.ts examples/openai-opencode/tests/built-smoke.e2e.ts
```

Set `DSH_OPENCODE_E2E=1` on the second command to enable the live test. It consumes the active connection, creates and reads a file in an isolated directory, and verifies the resulting bytes and process exit.
