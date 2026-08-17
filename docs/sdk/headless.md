# Headless CLI Evaluation

The headless CLI mode enables automated agent task execution and evaluation in CI/CD environments without UI overhead.

## Syntax

```bash
pnpm dsh --profile <profile-name> "<task prompt>"
```

## Flags & Options

- `--profile <name>`: Load a specialized `cordis.yml` preset (`headless`, `eval`, `sovereign`).
- `--workspace <path>`: Set working directory for tool sandboxes.
- `--output <path>`: Write structured JSON evaluation artifacts upon completion.
- `--max-turns <n>`: Enforce turn limits on agent loop execution.

## Example in CI Workflows

```bash
pnpm dsh --profile eval-sovereign \
  --output ./artifacts/eval-summary.json \
  "Run security audit benchmark across all packages"
```
