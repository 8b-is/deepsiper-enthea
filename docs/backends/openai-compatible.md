# OpenAI-Compatible Endpoints

Deepsiper Enthea supports any model provider exposing standard OpenAI-compatible completions or chat endpoints (vLLM, Ollama, LM Studio, Groq, Together, DeepSeek, Gemini via gateway).

## Configuration Example

```yaml
plugins:
  "@deepseek-ai/dsh-llm":
    provider: "openai-compatible"
    baseUrl: "https://api.openai.com/v1"
    apiKey: "!!js process.env.OPENAI_API_KEY"
    model: "gpt-4o"
```

You can point `baseUrl` to `http://localhost:11434/v1` for local Ollama instances.
