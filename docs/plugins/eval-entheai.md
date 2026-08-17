# EntheAI Sovereign Evaluation (`eval-entheai`)

`eval-entheai` is the sovereign backend leaf for Deepsiper Enthea, integrating self-hosted inference clusters with local agent evaluation pipelines.

## Key Features

- **Local Parameter Weight Alignment:** Direct evaluation hooks against local LLM layers without cloud telemetry leakage.
- **Sovereign Telemetry:** Encrypted session logs written to local SQLite stores with monotonic schema versioning.
- **Custom Loss & Reward Rubrics:** Native support for measuring multi-step reasoning stability.

## Example Profile

```yaml
plugins:
  "@8b-is/dsh-eval-entheai":
    nodeUrl: "http://127.0.0.1:8000"
    model: "enthea-v1-sovereign"
    encryptTelemetry: true
```
