# Agent Note: Host 持有保存的 MCP 连接

Status: implemented

[English](2026-11-01-host-mcp-settings.md) | 中文

## Problem

浏览器配置应管理 DSH Host 上的 MCP 服务器，而不是浏览器所在机器，也不是为每个会话新建进程。持久化凭据需要脱敏，编辑本地记忆服务器不能产生重叠写入者。连接测试不能调用任意工具。

## Decision

按需启用的 `@deepseek-ai/dsh-mcp-client/settings` 入口提供唯一的 Host `mcpServers` 服务和 `mcp-servers` 设置命名空间。保存条目默认关闭。管理器复用既有 [MCP 桥](../feature/2026-07-07-mcp-client-plugin.md)与[重连监督器](../feature/2026-08-06-mcp-client-auto-reconnect.md)，保留命名空间和工具执行规则。

变更按服务器串行化。替换必须等待传输确认关闭；关闭未完成会保留名称占用并拒绝另一个写入者。不相关服务器保留连接。发现测试复用现有连接或打开临时客户端，在期限内读取全部工具列表页，关闭时不调用工具。API 诊断只暴露名称、状态、数量和不含配置值的错误，不暴露密钥或原始服务器错误。

设置使用平坦的传输字段，使现有结构化脱敏逻辑能够处理环境变量值与 HTTP 请求头，即使对应传输未激活。运行时只选择活动传输配置。管理员 API 授权遵循 [Connection 代理决策](2026-11-01-authenticated-proxy-settings.md)。

显式 Smart Tree 记忆策略只作用于原始 `memory` 工具。`off` 隐藏它；`read-only` 对外声明并在执行时独立强制要求精确的 `operation: find`；`read-write` 允许服务器声明的操作。省略策略保留通用 MCP 行为。此策略不是其他 Smart Tree 工具的沙箱。召回可能更新服务器访问元数据，连接不会自动保存聊天消息。

## Alternatives considered

**每个会话创建记忆进程。** 拒绝，因为共享持久文件可能不支持多写入者协调。

**只限制工具公开 schema。** 拒绝，因为执行器仍须拒绝伪造或过期调用。

**把凭据放入传输专用 schema 联合类型。** 拒绝，因为设置脱敏不会遍历这些联合分支。

**自动安装记忆提供方或宣称支持 MEM16。** 拒绝，因为配置不得下载软件或暗示存在尚未实现的协议适配器。

## Consequences

管理器是可选 Host 组合入口，不是默认第三方连接或浏览器进程。操作者选择可执行程序、端点、凭据及存储位置。既有 MCP 和重连记录继续有效，其协议和恢复决策不变。后续浏览器编辑器可使用设置命名空间和发现 API，而不拥有连接生命周期。
