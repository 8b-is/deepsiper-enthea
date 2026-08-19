<!-- 英文源文件由 scripts/gen-tool-catalog.ts 生成；本中文文件是通过双语配对维护的经评审对侧。
     更新时先运行 `pnpm run gen-tool-catalog` 更新英文，再更新本文件并运行 `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新记录配对。 -->

# 工具 Schema 目录

[English](tool-catalog.md) | 中文

已发布插件向 `ctx.tools` 提供的所有面向模型的工具：模型通过系统提示词组装获得的 `name`、`description` 和 JSON Schema `parameters`。本目录是[子系统页面](subsystems/core.md)（类型及每页生成的 `cordis-surface` 接线区域）的补充；本页列出的是向 agent（智能体）提供的*工具*。

英文源文件由系统**生成**，并通过 `pnpm run verify-tool-catalog`（`doc-sync`（文档同步门禁）的一部分）验证新鲜度；本中文文件作为经评审对侧通过双语配对维护。与 Cordis 目录（纯源码 AST 处理）不同，英文生成器会在真实上下文中**启动**每个工具插件并读取 `ctx.tools.schemas()`，因为工具 schema 无法通过静态分析完全确定，例如运行时展开的枚举、拼接的描述、由配置决定的名称以及使用原始 JSON Schema 的 MCP 工具。完整性守卫会 glob 匹配 `packages/*/tool-*`；如果生成器的启动 manifest（元数据清单）遗漏任何包，检查就会失败，因此新工具不会在无人察觉的情况下缺少文档。参见[工具 schema 目录 Agent Note](../.agents/notes/implemented/process/2026-07-02-tool-schema-catalog.md)。

范围：`packages/*/tool-*` 下已发布的产品工具，每个工具均使用其**默认**配置启动；但如果某个 Config 字段是**必填项**且没有默认值，生成器就必须作出选择，对应包的说明会记录本页展示的是哪个分支。注册的工具**名称**可以是加载时配置，例如 `tool-subagent` 的 `toolName`，因此部署可能以不同名称或额外名称提供某个包；如果存在随产品发布的别名，对应包的说明会予以记录。`examples/` 中的演示工具（例如 `echo`）不在范围内，这与 Cordis 目录仅涵盖包的范围一致。

## 工具包映射

下表将模型可见的工具名称与其背后的插件包和服务 seam 对应起来。各包章节随后给出确切的 JSON Schema。

| Tool package | Model-visible names | Requires | Writes / affects | Shipped aliases | Deployment note |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-skill-crabcc` | `code_search`, `find_references`, `goto_definition` | `ctx.tools (可选)`、 `ctx.skills` | `tool/call`、 `tool/result`、 `skill/list` | - | 仅当存在工具运行时这些工具才注册。 |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`、 `ctx.userQuestions` | `tool/call`、 `tool/result after a UI/provider answers the question` | - | ask_user_question pauses the tool call until the active UI provider returns a human answer. |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.tools`、 `ctx.codeRuntime（执行时）`、 `ctx.systemPrompt` | `tool/call`、 `one tool/code-dispatch-start + tool/code-dispatch pair per bridged sub-call`、 `tool/result` | - | Owned by the tool registry as a reserved transport outside filterable capability layers under `mode: code` / `mode: both` (see the Code Mode Agent Note). Under `code` it is the registry's only wire contribution; the other visible capabilities are declared in a generated SDK section in the loaded runtime's language、 and a program calls them through bindings scheduled under the native concurrency contract (submission-ordered starts and policy; concurrency-safe bodies overlap up to `maxParallelSubCalls`) that re-enter the complete guarded tool pipeline and link each nested execution to this outer result. |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`、 `ctx.systemPrompt`、 `ctx.userQuestions (execution time、 opportunistic)` | `tool/call`、 `plan/mode inactive on an approved review`、 `tool/result` | - | exit_plan_mode stays in the model-facing schema while planning is inactive so transitions add no tool-catalog churn on top of the plan-policy change. Its execute path rejects calls outside plan mode; in plan mode it presents the plan over the user-questions seam (approve / keep planning with feedback)、 and approval logs plan mode inactive at the step boundary. |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.tools`、 `ctx.shell`、 `ctx.systemPrompt`、 `ctx.shellEnv`、 `调用 run_in_background 时的 ctx.jobs` | `tool/call`、 `tool/result` | - | The bash tool is the model-facing consumer of the bash executor seam. A `run_in_background` run registers with the generic `ctx.jobs` runtime and is collected/stopped through the `job_*` tools from `@deepseek-ai/dsh-tool-jobs`; the `enableRunInBackground` config (default true) removes the parameter entirely when disabled. |
| `@deepseek-ai/dsh-tool-nu` | `nu` | `ctx.tools`、 `ctx.shell`、 `ctx.systemPrompt`、 `ctx.shellEnv`、 `调用 run_in_background 时的 ctx.jobs` | `tool/call`、 `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.tools`、 `ctx.shell`、 `ctx.systemPrompt`、 `ctx.shellEnv`、 `调用 run_in_background 时的 ctx.jobs` | `tool/call`、 `tool/result` | - | The pwsh tool is the PowerShell-dialect consumer of the bash executor seam for Windows compositions (a PowerShell executor such as `@deepseek-ai/dsh-pwsh-local` backs `ctx.shell`); it mirrors the bash tool call-for-call minus sandbox controls — `run_in_background` runs register with the generic `ctx.jobs` runtime and are collected/stopped through the `job_*` tools、 and the managed `DSH_*` environment comes from `@deepseek-ai/dsh-shell-env`. Each call runs in a fresh process (no persistent PTY session)、 with native `C:\...` paths and `$env:NAME` variables. |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_define`, `cordis_inspect_list`, `cordis_inspect_query`, `cordis_inspect_self`, `cordis_run`, `cordis_stop`, `cordis_undefine` | `ctx.tools`、 `ctx.dynamicCordisRunner` | `tool/call`、 `tool/result`、 `process-local dynamic package lifecycle` | - | 不随产品分发（显式可选，见 Agent Note）。 |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.tools`、 `ctx.terminals`、 `an owning Agent at execution time` | `tool/call`、 `PTY shell state`、 `tool/result` | - | One owner-isolated persistent bash tool; deployment composition supplies the PTY backend and may override the model-facing environment description. |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`、 `ctx.fs` | `tool/call`、 `fs/observed after view presence/absence、 edit absence、 or successful mutation`、 `tool/result` | - | Standalone view/create/unique literal replace/line insert tool over the filesystem seam; it composes with any shell or terminal API. |
| `@deepseek-ai/dsh-tool-fs` | `edit`, `read`, `read_image`, `write` | `ctx.tools`、 `ctx.fs`、 `ctx.systemPrompt`、 `ctx.attachments (read_image registration)`、 `ctx.llm + an image-capable route (read_image execution)` | `tool/call`、 `fs/write-intent or fs/edit-intent for mutations`、 `fs/observed after read presence/absence or successful file operation`、 `durable attachment (read_image)`、 `tool/result` | - | The read-before-write/edit policy is added by `@deepseek-ai/dsh-fs-observation-policy` (an `fs/*` event-gate plugin、 no schema change); a deployment that loads these tools is expected to also load it. `read_image` is not registered without `ctx.attachments`; its schema is route-independent、 and execution refuses unless the exact routed model declares image input. |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`, `grep` | `ctx.tools`、 `ctx.subprocess`、 `ctx.systemPrompt` | `tool/call`、 `tool/result` | - | glob and grep are unconditional discovery tools that spawn the packaged ripgrep binary (`@vscode/ripgrep`) through ctx.subprocess as ordinary foreground calls (never background jobs) — no host `rg` install and no shell layer. The catalog uses `sampleOverCapGlobResults: true`; deployments must choose that behavior explicitly. Capped results save the complete formatted list through the 可选 ctx.spillStore backend; returned locators are follow-up-readable/searchable when the backend exposes local paths in co-located deployments. |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`, `terminal_list`, `terminal_open`, `terminal_read`, `terminal_send`, `terminal_signal` | `ctx.tools`、 `ctx.terminals`、 `ctx.systemPrompt`、 `调用 run_in_background 时的 ctx.jobs` | `tool/call`、 `tool/result` | - | The six terminal tools are opt-in and complement one-shot shell/filesystem tools. `terminal_send(run_in_background: true)` registers with `ctx.jobs`; TUI、 named key sequences、 BEL、 resize、 auto-start、 and cross-agent sharing are absent from the schema. |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`, `get_goal`, `update_goal` | `ctx.tools`、 `ctx.agents`、 `ctx.goals`、 `ctx.systemPrompt`、 `a calling Agent in an authorized open turn` | `tool/call`、 `goal/change for mutations`、 `tool/result` | - | create、 edit、 pause、 and resume require direct-human root authority; complete and blocked also accept the exact current goal round. The default blocked lower bound is three admitted rounds. |
| `@deepseek-ai/dsh-schedule` | `schedule_create`, `schedule_delete`, `schedule_list` | `ctx.tools`、 `ctx.sessions`、 `Session persistence`、 `a future live root Agent` | `tool/call`、 `schedule/change create or delete`、 `tool/result` | - | Registered only inside live root Agent scopes created after the opt-in Schedule plugin loads. Version 1 accepts after_seconds、 explicit absolute at、 and bounded fixed-rate every_seconds、 and discloses session-local delivery; management reads and mutations require the shared Session persistence barrier. |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.tools`、 `ctx.lsp`、 `ctx.systemPrompt` | `tool/call`、 `tool/result` | - | The lsp tool keeps provider selection and language-server subprocesses behind ctx.lsp、 so its model-visible schema stays stable across providers. Requires a registered provider (e.g. `@deepseek-ai/dsh-lsp-stdio`) at runtime; without one、 a query returns the structured `LSP_UNAVAILABLE` error rather than changing the schema. |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`、 `ctx.workflowEngine`、 `ctx.subagents`、 `ctx.systemPrompt`、 `a calling Agent (exec.agent parents every fresh round)` | `tool/call`、 `tool/result`、 `workflow and child session events during execution` | - | A fixed foreground workflow starts one fresh structured child per round; the model selects only the immutable objective and an 可选 round cap. |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.tools`、 `ctx.agents`、 `ctx.skills` | `tool/call`、 `tool/result`、 `user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`, `session_event_search`, `session_event_trace`, `session_search`, `session_trace` | `ctx.tools`、 `ctx.systemPrompt`、 `ctx.sessionQuery`、 `a calling Agent for workspace authority` | `tool/call`、 `tool/result` | - | The five read-only tools hide provider cursors and authorize every result from the immutable calling agent session. The package is opt-in; compositions that need enforced deadlines or bounded inline output also mount the generic timeout or spill policies. |
| `@deepseek-ai/dsh-tool-subagent` | `subagent` | `ctx.tools`、 `ctx.subagents`、 `ctx.systemPrompt` | `tool/call`、 `tool/result`、 `child session events through the chosen provider` | `subagent`, `subagent_fork` | The registered tool name is the load-time `toolName` config (default `subagent`); the schema above is that default. The shipped compositions load this package once per subagent backend、 so the model additionally sees `subagent_fork` bound to the fork backend. Each instance's description、 `run_in_background` parameter、 and system-prompt policy follow its own `backgroundMode` and `enableRunInBackground`、 so the two shipped schemas are not identical: `subagent` is `continuable` and defaults omitted calls to background with automatic settlement delivery、 while `subagent_fork` stays `one-shot` and defaults them to foreground — see `packages/bundle/base/cordis.patch.yml` and `examples/acp-agent/cordis.yml`. |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`, `list_agents`, `send_message` | `ctx.tools`、 `ctx.subagents`、 `ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`、 `tool/result`、 `child session events through ctx.subagents` | - | The globally named control tools over continuable background subagents: provider-bound `tool-subagent` instances register distinct delegation tools、 while this package registers `send_message` and `interrupt_agent` once、 plus `list_agents` from its separately loaded `/list-agents` plugin (whose catalog rows use the sessionProjections and live Agent registries). |
| `@deepseek-ai/dsh-tool-subagent-report` | `report` | `ctx.subagents`、 `ctx.systemPrompt`、 `a live continuable in-process child Agent` | `tool/call`、 `tool/result`、 `a user-role message in the direct parent session` | - | Registered per continuable in-process child rather than globally、 so this schema is visible only inside such a child and survives its global `toolFilter`. The same contribution installs the child-scoped `tool:report` prompt section、 which this catalog does not render. The parent-facing `send_message` tool is installed independently. |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`, `job_list`, `job_output` | `ctx.tools`、 `ctx.jobs`、 `ctx.systemPrompt` | `tool/call`、 `tool/result`、 `user/message via agent.inject() for background completion notices` | - | The kind-agnostic background-job controller: background bash commands、 PTY sends、 and subagents are read、 listed、 and killed through the same three tools. Loading the plugin attaches the controller that arms producers' `ctx.jobs.start()`. |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`、 `拥有 Agent 会话` | `tool/call`、 `todo/write`、 `tool/result` | - | todo_write is session-owned state; UIs render the latest todo/write event as a checklist. `allowParallelInProgress` is required with no default、 so the catalog states its choice: `true`、 whose description invites several `in_progress` items. A deployment choosing `false` receives the same tool with a description asking for exactly one active task. |
| `@deepseek-ai/dsh-tool-eval` | `eval_case` | `ctx.tools`、 `ctx.shell` | `tool/call`、 `tool/result` | - | eval_case scores a candidate output by running a deployment-configured grader in a subprocess; the grader owns the verdict (exit 0 = pass) and the tool reports it with bounded detail. A deployment with no benchmarks fails loud at load. |
| `@deepseek-ai/dsh-tool-everos` | `everos_memory_add`, `everos_memory_flush`, `everos_memory_search` | `ctx.tools`、 `a reachable EverOS server at baseURL` | `tool/call`、 `tool/result` | - | everos_memory_add stores conversation messages in a local EverOS server buffer; everos_memory_flush forces boundary extraction for a session; everos_memory_search retrieves episodes、 profiles、 agent cases、 and agent skills for exactly one owner (user_id XOR agent_id). All wire payloads follow the EverOS /api/v2 dialect; bounds the schema cannot express (batch size、 top_k、 radius) are enforced in the executor. |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`、 `ctx.workflowEngine`、 `ctx.systemPrompt`、 `a calling Agent (exec.agent parents the script children)` | `tool/call`、 `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`, `web_search` | `ctx.tools`、 `ctx.web`、 `ctx.systemPrompt` | `tool/call`、 `tool/result` | - | web_search and web_fetch keep provider selection behind ctx.web so model-visible schemas stay stable across backend swaps. |

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-skill-crabcc`

### `code_search`

使用 crabcc 符号索引在仓库中搜索代码符号（函数、类型、类、方法）。支持模糊名称匹配与可选的引用计数。查找定义时请优先使用本工具而不是 grep。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Symbol name or fuzzy search pattern"
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of results to return (default: 20)"
    },
    "includeRefs": {
      "type": "boolean",
      "description": "Include reference counts for each symbol (slower)"
    },
    "root": {
      "type": "string",
      "description": "Repository root path (defaults to workspace root)"
    }
  },
  "required": [
    "query"
  ]
}
```

Source: [`packages/skill/skill-crabcc/src/index.ts`](../packages/skill/skill-crabcc/src/index.ts)

### `find_references`

在仓库中使用 crabcc 符号索引列出对某个符号的全部引用。重命名或迁移符号前，请用它评估影响范围。

```json
{
  "type": "object",
  "properties": {
    "symbol": {
      "type": "string",
      "description": "Symbol name to find references for"
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of references to return (default: 50)"
    },
    "root": {
      "type": "string",
      "description": "Repository root path (defaults to workspace root)"
    }
  },
  "required": [
    "symbol"
  ]
}
```

Source: [`packages/skill/skill-crabcc/src/index.ts`](../packages/skill/skill-crabcc/src/index.ts)

### `goto_definition`

在仓库中使用 crabcc 符号索引查找符号的定义位置。在代码库中跳转到定义处。

```json
{
  "type": "object",
  "properties": {
    "symbol": {
      "type": "string",
      "description": "Exact symbol name to locate"
    },
    "root": {
      "type": "string",
      "description": "Repository root path (defaults to workspace root)"
    }
  },
  "required": [
    "symbol"
  ]
}
```

Source: [`packages/skill/skill-crabcc/src/index.ts`](../packages/skill/skill-crabcc/src/index.ts)

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

继续操作前，如果需要确认、选择或缺失的信息，请向用户提出简明问题。发送一个或多个问题，每个问题都带一个稳定 id，该 id 会在答案中原样返回。

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

来源：[`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

针对可用工具执行 TypeScript 程序。接受两个必填参数：`code`，即异步函数的**函数体**（仅使用可擦除语法；支持顶层 `await` 和 `return`）；以及 `description`，简要说明该程序做什么。请根据系统提示词中的声明，以 `await tools.name(args)` 形式调用工具。只有打印或返回的内容属于程序输出，请谨慎筛选。含图片的子工具结果会在运行结束后附加。

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

来源：[`packages/core/tools/src/code-mode.ts`](../packages/core/tools/src/code-mode.ts)

在 `mode: code`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 Code Mode Agent Note）。在 `code` 下，它是注册表对协议格式的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

仅在规划模式下使用。提交计划供用户评审，并在获批后退出规划模式。发送**完整的** Markdown 计划，以一个为计划命名的 # 标题开头。用户可以批准（从你的下一步骤起执行计划），也可以要求继续规划；其反馈会通过工具结果返回，请修改后再次提交。

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

来源：[`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

执行 bash 命令（`bash -c`）并返回 stdout/stderr。每次调用都在新 shell 中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$DSH_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Short active-voice summary of the command, 5-10 words, shown in the UI. Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

bash 工具是 bash 执行器 seam 面向模型的消费方。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默认为 true）后，该参数会被完全移除。

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-nu`

### `nu`

执行 nushell 命令（`nu --no-config-file -c`）并返回其 stdout/stderr。每次调用都在全新的 nu 进程中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。路径为 POSIX；使用 `$env.NAME` 读取环境变量。请使用 nushell 管道（`|`）与内置命令（`ls`、`open`、`get`）。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$env:DSH_*` 变量公开，需要时请检查。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝而非命令缺陷，请勿换一种方式重试。较长的输出截断至尾部；完整输出会保存到文件并报告其路径。被杀死的进程以 `[killed by signal: <signal>]` 结束——将其视为中断，而非命令失败。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The nushell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

Source: [`packages/shell/tool-nu/src/index.ts`](../packages/shell/tool-nu/src/index.ts)

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

执行 PowerShell 命令（`pwsh -Command`）并返回 stdout/stderr。每次调用都在新的 pwsh 进程中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。路径采用 Windows 原生形式（`C:\...`）；使用 `$env:NAME` 读取环境变量。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$env:DSH_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。在 Windows 上，被强制终止的命令会以 `[exit code: 1]` 结算且不带信号标记，请将其视为中断，而不是命令失败。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `DSH_*` 环境来自 `@deepseek-ai/dsh-shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_define`

定义一个不可变的 Cordis Package。新建 Plugin 时使用 kind:"new"，只提供 3 至 6 位小写英文字母组成的语义前缀；Host 返回最终 pluginId 和 packageId。修改现有 Plugin 时使用 kind:"existing" 并传入精确 pluginId，以追加 Package 而不覆盖旧版本。code.host 与 code.client 至少提供一个；每个值都是返回 Cordis Plugin 的 plain JavaScript 函数体，不经过 TypeScript、JSX 或 import 转换。依赖 Service、Event、Builtin、Slot 或 token 前先查询 Inspect。Define 只校验参数和语法并记录源码，不申请审批、不执行 apply，也不改变 currentPackageId。成功后用返回的 ID 调用 cordis_run。

```json
{
  "type": "object",
  "properties": {
    "plugin": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "new"
            },
            "idPrefix": {
              "type": "string",
              "description": "Suggested semantic prefix of 3–6 lowercase English letters; the Host adds a unique numeric suffix."
            }
          },
          "required": [
            "kind",
            "idPrefix"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "existing"
            },
            "pluginId": {
              "type": "string",
              "description": "Exact ID of an existing Plugin; the new Package is appended to that instance."
            }
          },
          "required": [
            "kind",
            "pluginId"
          ]
        }
      ]
    },
    "name": {
      "type": "string",
      "description": "Short, readable Package name."
    },
    "purpose": {
      "type": "string",
      "description": "One-sentence, user-facing description of the Package purpose."
    },
    "code": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "host": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the Host-half Cordis Plugin."
        },
        "client": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the browser Client-half Cordis Plugin."
        }
      }
    }
  },
  "required": [
    "plugin",
    "name",
    "purpose",
    "code"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_list`

列出 Host 当前已知的全部 Cordis Inspect Provider，包括本地 Host Provider 和 Client 最近同步的 manifest。每项包含所属平台、用途、只读方法及输入／输出 schema。创建或修改 Package 前先调用本 Tool，再从结果中选择 cordis_inspect_query 的 provider 和 method。不要猜测名称，也不要把 Inspect method 当作 Plugin 代码可调用的业务 Service。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

执行 Inspect Provider 显式声明的只读查询。platform、provider 和 method 必须来自 cordis_inspect_list，input 必须符合该方法的 schema。在 cordis_define 前用本 Tool 读取精确 Service 方法、Event mode、Builtin 签名、Tool schema、主题 token，或实时 Slot 树及 props。Host 查询在本地执行；Client 查询等待首个有效页面响应，在页面回答或 Tool 被取消前保持 pending。本 Tool 不能调用业务 Service 方法或修改运行时。查询 Service.listService 和 Event.listEvents 时，先不传 input 浏览紧凑签名目录，再查询精确 service 或 event 获取结构化约定和引用类型。查询 Slots.listSubTree 时，先不传 root 浏览紧凑树，再查询精确 root 获取完整注册约定和 props。

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_self`

按逐层增加的详细程度检查当前 Session 拥有的动态 Cordis 对象。不传 ID 时只列 Plugin 摘要；只传 pluginId 时返回版本指针、最新 Run 和全部 Package 摘要；只有同时传 pluginId 与 packageId 才返回该不可变 Package 的 Host/Client 源码和运行诊断。packageId 不能单独传入。处理 @pluginId、修复异步失败或定义更新版本前，先查询精确 Package。本 Tool 只读，不执行代码，也不改变版本指针。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define or injected by @pluginId; omit it to list every current Plugin."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID owned by pluginId; when specified, source and diagnostics are returned."
    }
  }
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_run`

激活动态 Plugin 的一个精确 Package。首次激活、重启 currentPackageId 或回退使用 mode:"run"；已有 current 时，即使 Plugin 当前已停止，切换到其他 Package 也使用 mode:"update"。未授权的 Client Package 创建审批请求并返回 awaiting-approval；已授权的 Package 返回 starting，并在浏览器中异步继续。两种结果都不会在 Tool 内等待最终结局。currentPackageId 只在完整成功后改变；失败时保留旧 current 和目标 next。异步成功、拒绝或技术失败通过状态与 steering 报告。技术失败后，用 cordis_inspect_self 读取诊断，修正同一 Plugin 并自主重试。用户拒绝后不要再次申请审批。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID to activate under that Plugin."
    },
    "mode": {
      "type": "string",
      "description": "Use run for the first activation, restarting current, or rollback; use update to switch from current to a different Package.",
      "enum": [
        "run",
        "update"
      ]
    }
  },
  "required": [
    "pluginId",
    "packageId",
    "mode"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_stop`

停止动态 Plugin 的当前 Run，并取消尚未完成的审批或激活请求。保留 Plugin、全部不可变 Package、授权、currentPackageId 和 nextPackageId，以便之后直接运行或更新。停止已处于停止状态的 Plugin 会幂等成功。临时禁用副作用使用本 Tool；永久移除使用 cordis_undefine。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to stop."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_undefine`

永久移除当前 Session 拥有的动态 Plugin。如果它正在运行或等待审批，先停止并取消请求，再删除全部 Package、授权和版本指针。返回后，其 pluginId、packageIds、@ 引用和 Package 业务视图均失效；历史卡片只保留“Plugin 已移除”记录。需要保留版本以便重启或回退时不要调用本 Tool，应改用 cordis_stop。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to remove permanently."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

不在任何随产品发布的树中，需要显式选择启用；动态 Package 代码可以访问真实运行时，见 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。该工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者拥有定义注册表和 vm 沙箱；组合缺少它时这些工具不会激活。运行中的 Package 在停止、undefine 或 DSH 重启前可以注册**额外的**模型可见工具；发生这类工具集变化时，系统会记录完整且有变动的请求头。

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

在持久 bash shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

用于查看、创建和编辑文件的自定义编辑工具：

* 状态会在命令调用以及与用户的讨论之间持久保留
* 如果 `path` 是文件，`view` 会显示应用 `cat -n` 后的结果。如果 `path` 是目录，`view` 会列出最多向下 2 层的非隐藏文件和目录
* 如果指定的 `create` 命令目标 `path` 已作为文件存在，则不能使用该命令
* 如果 `command` 产生较长输出，输出会被截断并标记为 `<response clipped>`

使用 `str_replace` 命令时请注意：

* `old_str` 参数应与原文件中一行或多行连续内容**完全**匹配。请留意空白字符！
* 如果 `old_str` 参数在文件中不唯一，则不会执行替换。请确保在 `old_str` 中包含足够的上下文，使其唯一
* `new_str` 参数应包含用于替换 `old_str` 的已编辑行

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "type": "string",
      "description": "Required parameter of `create` command, with the content of the file to be created."
    },
    "insert_line": {
      "type": "integer",
      "description": "Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`."
    },
    "new_str": {
      "type": "string",
      "description": "Optional parameter of `str_replace` command containing the new string (if not given, no string will be added). Required parameter of `insert` command containing the string to insert."
    },
    "old_str": {
      "type": "string",
      "description": "Required parameter of `str_replace` command containing the string in `path` to replace."
    },
    "view_range": {
      "type": "array",
      "description": "Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.",
      "items": {
        "type": "integer"
      }
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

来源：[`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

通过替换字面量文本来编辑现有 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace. Must match exactly."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

读取 UTF-8 文本文件，并返回带行号的内容。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

读取 PNG/JPEG/WebP/GIF 文件并返回图像本身。要求当前模型接受图像输入。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

创建或完全替换 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

先读后写／编辑策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时 `read_image` 不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图像输入，否则拒绝。

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

查找路径匹配 glob 模式的文件。只返回匹配的文件路径，绝不返回目录；包括隐藏文件和被忽略的文件，但排除 VCS 元数据目录。最多按修改时间顺序返回 100 条路径；如果结果更多，则改为返回从顶层条目中抽样的 100 条路径，说明已抽样，并报告完整排序列表的保存位置。该工具不枚举目录条目。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

使用 ripgrep 正则表达式搜索文件内容。返回带行号的匹配行，并按文件分组。前 250 条匹配会直接返回；结果达到上限时会报告完整匹配列表的保存位置。如需周边上下文，请对匹配的文件使用 read。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

关闭一个持久终端，并等待其捕获且所有的进程树完全退出。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

列出当前 agent 所有的持久终端会话。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

通过已注册的后端类型创建按所有者隔离的持久终端会话。需要在多次工具调用之间保留 shell 或 REPL 状态时，请使用此工具。

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

从持久终端读取一页有界的保留输出，不发送输入。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

向持久终端发送文本。默认会提交 Enter，并等待提示符、stdin 等待、输出静默、超时或会话退出。后台模式会返回供 job_output／job_kill 使用的 job id。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

向持久终端当前的前台进程组发送允许的信号。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

当当前直接人类请求是需要跨自主 Goal Round 持续推进的长期目标时，创建一个持久化的同会话完成目标。即使用户没有明确说「创建目标」，你也可以推断其意图。不要用于简单的单轮工作。执行时会拒绝非人类权限和 subagent 权限。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

读取当前的同会话目标，包括确切的 id／revision、目标、阶段、已完成的延续 Round 数、Round 上限、存在时的阻塞原因，以及是否已准备下一次延续。更新目标前请先调用此工具。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

更新确切的当前目标 revision。edit、pause 和 resume 要求直接的顶层人类请求。在自动延续当前目标期间，也允许 complete 和 blocked。在达到配置的最小 Round 数之前会拒绝 blocked；模型仍须判断相同条件是否在这些 Round 中持续存在，并在 blocked_reason 中予以说明。

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit | pause | resume | complete | blocked",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Concrete blocking condition; required only with action blocked."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。

<a id="deepseek-aidsh-schedule"></a>

## `@deepseek-ai/dsh-schedule`

### `schedule_create`

在当前会话中创建一条提醒。请提供非空 prompt 和恰好一个 selector：正的安全整数 after_seconds 延时；作为严格带偏移日期时间或本地日期／时间对象的 at；或不小于 300 的安全整数 every_seconds。固定速率提醒始终与创建时刻对齐，会跳过错过的发生时点，并把每条逾期规则的最新一个发生时点合并到一个批次中。交付模式是 session-local：只有此会话处于 live 状态时，提醒才会准时运行；否则提醒会进入 overdue 状态，直至会话恢复。

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "after_seconds": {
      "type": "number",
      "description": "Positive safe-integer delay in seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate safe-integer interval in seconds, at least 300."
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone."
    }
  },
  "required": [
    "prompt"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

使用 schedule_create 或 schedule_list 返回的确切 id，删除当前会话中的一条活动提醒。未知或已经结束的 id 会返回 deleted false。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact session-local schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

按创建顺序列出当前会话中的所有活动提醒，包括确切 id、UTC 目标、scheduled 或 overdue 状态，以及 session-local 交付模式。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

查询语言服务器，以精确导航代码。operation 可取 goToDefinition、findReferences、goToImplementation 或 hover。line 和 character 是从 1 开始的 UTF-16 光标坐标。findReferences 包含声明。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

来源：[`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

围绕一个不可变目标运行使用全新 agent 的前台 Ralph 循环。仅当直接人类明确要求 Ralph 或使用全新 agent 迭代时使用。每个 Round 都会启动一个全新子级，该子级看不到父级对话或先前子会话；共享工作区充当长期记忆，Round 之间只传递有界的结构化报告。当工作进程报告完成、报告具体阻塞项或达到 Round 上限时，调用返回。普通的长期同会话工作应使用 goal 工具。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

加载可用 skill（技能）的完整说明。在执行点名某项 skill 或与其明确匹配的任务前，请使用会话 skill 目录中的确切名称调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

来源：[`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

从一个已获授权的会话中读取一个完整且未删节的事件，以及可选的相邻原始事件概述。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

在一个已获授权的会话中搜索先前事件；如果搜索当前会话，则排除执行此次调用的步骤。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

读取已获授权会话中某个事件的所有直接替换关系，以及该事件与其引用的来源事件之间的关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

搜索调用方工作区中的先前会话，并从每个会话返回匹配度最高的事件。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

读取围绕一个会话的已授权会话谱系，包括完整可见的祖先和后代关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `subagent`

将一项自包含任务委派给 subagent（在自身上下文中工作的独立 agent），用它卸载聚焦且独立的工作，例如研究、限定范围的实现或分析，以免消耗当前对话的上下文。subagent 会返回结果，但不会返回中间步骤。请提供完整、独立的提示词，因为它看不到当前对话。此调用默认等待结果。设置 `run_in_background: true` 可返回 job id；使用 `job_output` 收集结果，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

来源：[`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

注册的工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述 schema 对应默认值。随产品发布的组合会为每个 subagent 后端加载一次该包，因此模型还会看到绑定到 fork 后端的 `subagent_fork`。每个实例的描述、`run_in_background` 参数与 system prompt 策略取决于它自己的 `backgroundMode` 和 `enableRunInBackground`，因此两个随附 schema 并不相同：`subagent` 为 `continuable`，省略参数时默认后台运行，并由 runtime 自动投递结束结果；`subagent_fork` 保持 `one-shot`，省略参数时默认前台运行。详见 `packages/bundle/base/cordis.patch.yml` 和 `examples/acp-agent/cordis.yml`。

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

根据 agent id 请求取消后台 agent 的当前轮次。目标可以是你的直接子级，也可以是在你下方创建的更深层 agent。只有当前轮次会停止：已经排队发给该 agent 的消息会一直搁置到后续的 send_message；它启动的 agent 会继续运行；该 agent 本身仍可接受后续操作。停止请求被接受后，此调用立即返回，因此目标可能还会短暂运行；中断一个已经完成的 agent 是可接受的空操作。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of the running agent to interrupt."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

按持久 id 和标签列出你的可继续后台 subagent。用它回忆你启动过哪些 subagent，而不是轮询完成情况——subagent 完成时你会被告知。状态来自实时注册表：running 表示 agent 此刻正在工作；idle 表示已加载但处于轮次之间，可能正在等待它启动的 agent；ready 表示它只存在于存储中——可恢复而非终态，也不表示有结果等待收集；`send_message` 会在同一对话上开启新的轮次，且无论处于哪种状态，直接子级都仍可作为 `send_message` 的目标。该快照并非投递承诺；`send_message` 会执行权威检查，仍可能失败。无法读取的子级会作为诊断信息报告，而不会被静默丢弃。`descendants` 作用域会按稳定的前序顺序遍历你下方的整棵树，并为每个条目标注其持久的直接父会话 id 和深度。只有深度为 1 的条目可以使用 `send_message`；更深的条目只能作为 `interrupt_agent` 的候选目标。

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children only; descendants walks the complete tree below you.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

来源：[`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

根据 subagent id 向后台 subagent 发送消息，继续同一段对话。该消息会成为 subagent 的下一轮次：如果它仍在工作，消息会等待当前轮次结束，因此无法改变已经开始的工作方向。此调用不会返回 subagent 的答案，只会确认消息已投递，因此请用它分派更多工作。调用失败表示消息**未**投递。

```json
{
  "type": "object",
  "properties": {
    "subagent_id": {
      "type": "string",
      "description": "The subagent id returned when the background subagent was started."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the subagent."
    }
  },
  "required": [
    "subagent_id",
    "message"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。

<a id="deepseek-aidsh-tool-subagent-report"></a>

## `@deepseek-ai/dsh-tool-subagent-report`

### `report`

向启动你的 agent 报告选定内容。在你结束前调用一次，给出自包含的最终结果；当进度或发现会改变该 agent 接下来的行动时，也可以更早调用。该 agent 与你共享工作区，但不会自动收到你的 transcript（文本记录）、工具输出或推理，因此完成你的工作本身并不等于交出结果。报告不会结束你的轮次或完成你的工作，且只有直接父级会收到。失败的调用仍可能已经送达，因此不要盲目重复。

```json
{
  "type": "object",
  "properties": {
    "output": {
      "type": "string",
      "description": "Actionable content for your parent; summarize conclusions and reference relevant shared paths."
    }
  },
  "required": [
    "output"
  ]
}
```

来源：[`packages/subagent/tool-subagent-report/src/index.ts`](../packages/subagent/tool-subagent-report/src/index.ts)

按可继续的进程内子级注册，而非全局注册，因此该 schema 仅在这种子级内部可见，并且不受其全局 `toolFilter` 影响。同一份贡献还会安装子级作用域的 `tool:report` 系统提示词 section，本目录不渲染该 section。面向父级的 `send_message` 工具单独安装。

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

根据 job id 请求取消正在运行的后台任务。此调用立即返回；任务的工作真正停止后，会以 killed 状态结算。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

列出你的后台任务（包括正在运行和已完成的任务）及其 id、种类和状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

读取后台任务。流式任务只返回自上次读取以来的输出；最终输出任务会在结算后返回结果。每个响应都以 `[status: ...]` 结尾。读取默认不阻塞；设置 `wait: true` 后，最长等待到配置的上限。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。

<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

记录并更新当前工作的结构化任务列表。每次调用都要发送**完整列表**，它会**替换**之前的列表，不支持局部更新或逐项编辑。请用它规划多步骤工作并展示进度：开始前为每个具体步骤添加一项 todo。将当前正在处理的每项 todo 标记为 `in_progress`；确实并行运行时（例如并发 subagent 或后台命令）可同时标记多项，顺序工作则标记 1 项。只要工作尚未完成，就应至少有一项任务为 `in_progress`。某项 todo 完成后立即标记为 `completed`，不要批量标记完成；只有全部工作完成后，才可以没有 `in_progress` 项。简单的单步骤任务无需使用列表。状态：`pending`（未开始）、`in_progress`（正在处理）、`completed`（已完成）。

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

来源：[`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-eval`

### `eval_case`

根据配置的基准评测器对候选输出进行评分。`benchmark` 的评测器在 stdin 上接收 `output`；评测器拥有通过/失败裁决（退出码 0 = 通过，非零 = 失败），本工具连同裁决详情一并报告，因此失败的输出可以修订后重新评分。评测器可能将候选内容作为代码执行——只评分你打算运行的内容。可用基准：fizzbuzz（18 个用例）。

```json
{
  "type": "object",
  "properties": {
    "benchmark": {
      "type": "string",
      "description": "The benchmark id to grade against (configured: fizzbuzz)."
    },
    "output": {
      "type": "string",
      "description": "The candidate output to score; fed to the grader on stdin."
    }
  },
  "required": [
    "benchmark",
    "output"
  ]
}
```

Source: [`packages/eval/tool-eval/src/index.ts`](../packages/eval/tool-eval/src/index.ts)

## `@deepseek-ai/dsh-tool-everos`

### `everos_memory_add`

将对话消息存储到本地 EverOS 记忆服务器。消息在会话缓冲区内累积，直到边界检测提取它们；调用 everos_memory_flush 可强制提取。当当前对话轮次包含值得记住的持久事实、偏好或决策时，将其存储在此处。`defer_extraction: true` 会持久化缓冲区而不提取——适用于尚未结束、暂不希望划分成情节的对话。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "The conversation session the messages belong to."
    },
    "messages": {
      "type": "array",
      "description": "1..500 messages to store, in chronological order. `timestamp` is Unix epoch in milliseconds; `sender_id` identifies the speaker (e.g. a user id or the agent name).",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "sender_id": {
            "type": "string",
            "description": "Who sent the message; also becomes the memory owner for user-memory searches."
          },
          "sender_name": {
            "type": "string",
            "description": "Display name of the sender."
          },
          "role": {
            "type": "string",
            "description": "user | assistant | tool.",
            "enum": [
              "user",
              "assistant",
              "tool"
            ]
          },
          "timestamp": {
            "type": "integer",
            "description": "Message time as Unix epoch milliseconds."
          },
          "content": {
            "oneOf": [
              {
                "type": "string",
                "description": "Plain-text message content."
              },
              {
                "type": "array",
                "description": "Multimodal content pieces.",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "type": {
                      "type": "string",
                      "description": "Content piece kind.",
                      "enum": [
                        "text",
                        "image",
                        "audio",
                        "doc",
                        "pdf",
                        "html",
                        "email"
                      ]
                    },
                    "text": {
                      "type": "string",
                      "description": "Text payload."
                    },
                    "uri": {
                      "type": "string",
                      "description": "Reference URI for non-text pieces."
                    },
                    "base64": {
                      "type": "string",
                      "description": "Inline base64 payload."
                    },
                    "ext": {
                      "type": "string",
                      "description": "File extension hint."
                    },
                    "name": {
                      "type": "string",
                      "description": "Piece name."
                    }
                  },
                  "required": [
                    "type"
                  ]
                }
              }
            ],
            "description": "Message text, or multimodal content pieces."
          },
          "tool_calls": {
            "type": "array",
            "description": "Function calls made by an assistant message.",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "type": "string"
                },
                "type": {
                  "type": "string"
                },
                "function": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "name": {
                      "type": "string"
                    },
                    "arguments": {
                      "type": "string",
                      "description": "Arguments as a JSON string."
                    }
                  },
                  "required": [
                    "name",
                    "arguments"
                  ]
                }
              },
              "required": [
                "id",
                "function"
              ]
            }
          },
          "tool_call_id": {
            "type": "string",
            "description": "The tool call this tool-result message answers."
          }
        },
        "required": [
          "sender_id",
          "role",
          "timestamp",
          "content"
        ]
      }
    },
    "app_id": {
      "type": "string",
      "description": "Overrides the configured default app scope."
    },
    "project_id": {
      "type": "string",
      "description": "Overrides the configured default project scope."
    },
    "defer_extraction": {
      "type": "boolean",
      "description": "Persist to the buffer without running boundary detection or extraction."
    }
  },
  "required": [
    "session_id",
    "messages"
  ]
}
```

Source: [`packages/memory/tool-everos/src/index.ts`](../packages/memory/tool-everos/src/index.ts)

### `everos_memory_flush`

强制提取当前会话缓冲区中累积的消息，将其固化为 EverOS 记忆情节并建立索引。当 `defer_extraction: true` 存储了消息、或边界检测尚未触发，而你需要立即固化时，请调用本工具。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "The conversation session to flush."
    },
    "app_id": {
      "type": "string",
      "description": "Overrides the configured default app scope."
    },
    "project_id": {
      "type": "string",
      "description": "Overrides the configured default project scope."
    }
  },
  "required": [
    "session_id"
  ]
}
```

Source: [`packages/memory/tool-everos/src/index.ts`](../packages/memory/tool-everos/src/index.ts)

### `everos_memory_search`

在本地 EverOS 记忆中检索相关情节、用户画像或技能。当会话上下文需要此前会话的持久事实时使用；关键词搜索无需嵌入模型即可工作。

```json
{
  "type": "object",
  "properties": {
    "user_id": {
      "type": "string",
      "description": "Owner of user memory (episodes, profiles). Exactly one of user_id / agent_id is required."
    },
    "agent_id": {
      "type": "string",
      "description": "Owner of agent memory (cases, skills). Exactly one of user_id / agent_id is required."
    },
    "query": {
      "type": "string",
      "description": "What to recall — a fact, decision, or capability; the server retrieves the closest stored memory."
    },
    "method": {
      "type": "string",
      "description": "Retrieval method (default hybrid).",
      "enum": [
        "keyword",
        "vector",
        "hybrid",
        "agentic"
      ]
    },
    "top_k": {
      "type": "integer",
      "description": "-1 for all, or 1..100; default -1."
    },
    "radius": {
      "type": "number",
      "description": "Cosine-similarity floor in 0..1 applied at recall time."
    },
    "min_score": {
      "type": "number",
      "description": "Post-fusion relevance floor in 0..1 for episode hybrid retrieval."
    },
    "include_profile": {
      "type": "boolean",
      "description": "Also return the owner profile (user memory)."
    },
    "enable_llm_rerank": {
      "type": "boolean",
      "description": "Opt-in LLM rerank of agent cases and skills (needs a configured EverOS LLM)."
    },
    "filters": {
      "type": "object",
      "description": "EverOS filters DSL: recursive {\"AND\": [...]} / {\"OR\": [...]} nodes mixed with scalar fields like {\"session_id\": \"sess-1\"}.",
      "additionalProperties": true
    },
    "app_id": {
      "type": "string",
      "description": "Overrides the configured default app scope."
    },
    "project_id": {
      "type": "string",
      "description": "Overrides the configured default project scope."
    }
  },
  "required": [
    "query"
  ]
}
```

Source: [`packages/memory/tool-everos/src/index.ts`](../packages/memory/tool-everos/src/index.ts)

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

运行用于大规模编排 subagent 的 JavaScript 工作流脚本。当工作会分散到许多相互独立的部分时，请使用此工具，例如审查大量文件、执行迁移、开展多角度研究或对发现进行对抗式验证；此时应将编排写成脚本，而不是逐轮委派。

工作流的身份通过 `meta` 参数以 JSON 形式传入：必填的 `name`（简短 kebab-case）和 `description` 字符串，以及可选的 `whenToUse` 字符串和 `phases` 数组（`{title, detail?, provider?, model?}`）。`script` 参数只能是纯 JavaScript **函数体**，不能是 TypeScript，也不能包含 `export const meta` 语句；meta 是参数而非代码。脚本支持顶层 await；请以 `return <value>` 结尾，该值必须可以 JSON 序列化，并作为此工具的结果。

脚本钩子：`agent(prompt, opts?)` 运行一个 subagent（`opts.schema` 返回通过校验的对象；`label`/`phase`/`provider`/`model` 选项）；`pipeline(items, ...stages)` 让每个条目分别经过各阶段（阶段抛错时该条目降为 `null`）；`parallel(thunks)` 并发运行 thunks 并等待全部完成（抛错的 thunk 解析为 `null`）；`phase(title)`/`log(message)` 说明进度；`args` 是工具调用的原样输入。误用钩子会抛出错误并终止脚本。


如果误用钩子（参数错误、未知选项、不受支持的 schema、触发上限），抛出的错误**总会**终止脚本，绝不会退化为单个条目的 `null`。

约束：并发上限和 agent 总数上限均会生效；不提供文件系统、网络、定时器或 Node.js API。具体工作由 agent 完成，脚本只负责编排。该运行在前台执行：整个脚本完成后，调用才会返回。

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`)."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity block (plain JSON — never code).",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

来源：[`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

获取指定 HTTP(S) URL 的内容，并将其解码为文本后返回。

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

在 Web 上搜索最新信息。返回可选的摘要答案和源 URL 列表。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The search query."
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。
