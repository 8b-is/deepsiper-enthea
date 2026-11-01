# OpenRouter Backend

[OpenRouter](https://openrouter.ai/) is a route of the pi-ai-backed adapter [`@deepseek-ai/dsh-llm-pi-ai`](../../packages/llm/llm-pi-ai/README.md). The installed pi-ai catalog owns the endpoint (`https://openrouter.ai/api/v1`), the wire protocol (`openai-completions`), the model list, and the `openrouter` reasoning dialect, so a profile states only its credential reference.

## Default composition

The base bundle mounts the route when `OPENROUTER_API_KEY` is present in the launching environment and leaves the adapter dormant otherwise, keeping the model picker unchanged for keyless runs. A `llm-pi-ai:` settings section replaces that base, which is also how the web Models page adds routes.

## Configure

Set the key in the launching environment, a project `.env`, or `$DSH_HOME/.credentials.yaml`:

```sh
OPENROUTER_API_KEY=sk-or-v1-...
```

To declare the route explicitly, or to add it beside other routes, use the settings document:

```yaml
# $DSH_HOME/settings.yaml
llm-pi-ai:
  providers:
    openrouter:
      apiKeyEnv: OPENROUTER_API_KEY
```

The credential resolves per request through `ctx.credentials`, so a changed key reaches the next request without a restart.

## Select a model

The route id is `openrouter`; any id the catalog lists is valid. Set the default selection for new agents:

```yaml
# $DSH_HOME/settings.yaml
agent-default-model:
  provider: openrouter
  model: anthropic/claude-sonnet-4.5
```

Catalog ids are OpenRouter slugs, for example `anthropic/claude-sonnet-4.5`, `deepseek/deepseek-v3.2`, or `openai/gpt-4o`. The web Models page can select the same pair per session.

## Reasoning

Every catalog model carries its own `compat.thinkingFormat`; OpenRouter models use `openrouter`, which sends `reasoning: { effort }`. `agent-default-model.reasoningEffort` selects a level the model supports; a model that does not reason ignores it.

## Limitations

- Requests are limited to the catalog model ids; a slug the installed pi-ai version does not know is rejected while the route resolves.
- The catalog supplies pricing metadata, but the harness does not report spend.
- Routing preferences such as provider order or zero-data-retention are not exposed by the profile schema.
