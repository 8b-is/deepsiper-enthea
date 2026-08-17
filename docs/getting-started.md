# Getting Started with Deepsiper Enthea

Deepsiper Enthea (`deepsiper-enthea`) is a sovereign, agent-driven LLM evaluation and orchestration harness forked from `deepseek-ai/deepseek-harness`.

## System Requirements

- **Node.js**: `^22.19.0 || >=24.0.0`
- **pnpm**: `>=11.0.0`
- **Operating System**: Linux (x64/arm64 with Landlock support recommended) or macOS (darwin-arm64/x64)

---

## 1. Installation

Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/8b-is/deepsiper-enthea.git
cd deepsiper-enthea
pnpm install
```

---

## 2. Building the Project

Compile TypeScript contracts and bundle runtime artifacts using `tsdown` and `rolldown`:

```bash
# Build both host, client packages, and web frontend
pnpm run build
```

---

## 3. Environment Configuration

Create a root `.env` file for your backend and API credentials:

```bash
# Sovereign / EntheAI Inference Endpoint
ENTHEAI_API_KEY="your-entheai-key"
ENTHEAI_BASE_URL="http://127.0.0.1:8000/v1"

# Upstream DeepSeek or OpenAI-compatible backends
DEEPSEEK_API_KEY="your-deepseek-api-key"
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
```

---

## 4. Running Tasks

### Headless CLI Mode
Execute an evaluation task non-interactively using the headless profile:

```bash
pnpm dsh --profile headless "Evaluate codebase test coverage and generate report"
```

### Interactive Web UI
Launch the interactive web console:

```bash
pnpm dsh web
```

Open your browser at `http://127.0.0.1:3080` to access the sovereign agent workspace.

---

## 5. Next Steps

- Explore [Cordis Architecture](architecture.md)
- Learn [How to Write Plugins](plugins/writing-plugins.md)
- Connect [Sovereign EntheAI Backends](backends/entheai.md)
- Integrate via [JSON-RPC SDK](sdk/json-rpc.md)
