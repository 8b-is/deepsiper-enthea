# memory/ — EverOS memory capability family

English | [中文](README.zh.md)

The model-facing memory tools over a local [EverOS](https://github.com/EverMind-AI/EverOS) server (md-first memory extraction: Markdown truth + SQLite state + LanceDB indexes). The server runs out-of-process; this family owns the model-facing tools and the wire client, nothing else.

| Package | Role | ctx key |
|---|---|---|
| [`tool-everos/`](tool-everos/README.md) | Registers `everos_memory_add` / `everos_memory_flush` / `everos_memory_search` against the EverOS `/api/v2` memory endpoints. | (registers on `ctx.tools`) |

The child README owns the tool contracts, wire dialect, and deployment configuration; the [EverOS docs](https://docs.evermind.ai) own the server behavior.
