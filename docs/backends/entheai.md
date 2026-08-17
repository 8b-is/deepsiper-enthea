# Sovereign EntheAI Backend

Deepsiper Enthea integrates natively with EntheAI sovereign inference clusters, ensuring model evaluation runs purely on self-hosted infrastructure.

## Configuration

In your `cordis.yml` or environment `.env`:

```yaml
plugins:
  "@deepseek-ai/dsh-llm":
    provider: "entheai"
    baseUrl: "http://127.0.0.1:8000/v1"
    model: "entheai-sovereign-r1"
    temperature: 0.2
    maxTokens: 8192
```

## Security & Sovereignty Guarantees

- **No Remote Telemetry:** Prompts, completions, and tool outputs remain strictly within the sovereign VPC.
- **Hardware Isolation:** Compatible with private GPU clusters, vLLM, SGLang, and local Ollama nodes.
