# Agent Note: OpenCode 负责本地 Deepsiper 启动所用的 ChatGPT 登录

Status: implemented

[English](2026-11-01-opencode-chatgpt-launcher.md) | 中文

## 问题

本地 Deepsiper 部署需要使用用户在 OpenCode 中的活动 ChatGPT 连接。复制刷新凭据会为登录生命周期引入另一位所有者，而未收录在已安装模型目录中的模型仍需要显式元数据。

## 决策

[按需启用的启动器](../../../../scripts/opencode-local.ts) 通过 OpenCode V2 已认证的 CLI（命令行界面）读取活动 OpenAI OAuth 凭据，仅将其访问 token 传入已构建 harness 的环境。它拒绝不唯一或不可用的凭据，并以 token 到期时间限制子进程的存活时间。OpenCode 始终是登录和刷新的唯一所有者。

[覆盖层](../../../../examples/openai-opencode/cordis.patch.yml) 通过 pi-ai 已安装的 `openai-codex` 提供方声明 GPT-6 Astra，并将其设为新会话的模型。这使用现有的[声明式提供方目录](../architecture/2026-08-03-pi-ai-declared-provider-catalog.md)和[启动环境凭据规则](../architecture/2026-07-30-credential-boundaries-and-atomic-registration.md)；两项决策均未被取代。

模型请求使用 SSE（Server-Sent Events）。pi-ai 缓存的模型 WebSocket 可能使已完成任务的无界面进程保持存活，而请求级 SSE 允许正常退出。浏览器事件流保留其独立的 WebSocket 传输。

## 考虑过的替代方案

- **复制刷新 token 并在 Deepsiper 内刷新。** 否决，因为这会让两个应用共同拥有同一登录的凭据轮换和持久化。
- **直接读取 OpenCode 数据库。** 否决，因为已认证的 V2 API 已能提供凭据，无需让启动器依赖私有存储格式。
- **保留模型 WebSocket 传输。** 否决，因为已完成的无界面请求必须能释放进程，无需强制终止。

## 影响

harness 和工具在本机运行，模型推理使用托管服务。启动器不写入 OAuth 凭据文件，也不引入刷新 token 存储。运行中的进程不会采用后续凭据变更；到期会中断进程，重启要求 OpenCode 中已有可用 token。独立的浏览器认证由部署网关负责。

[凭据测试](../../../../scripts/opencode-local.spec.ts) 覆盖选择过程和不泄露秘密的失败诊断。[生命周期测试](../../../../scripts/opencode-local-launch.spec.ts) 覆盖访问 token 传递、取消，以及子进程退出码为零时的到期处理。[已构建示例](../../../../examples/openai-opencode/tests/built-smoke.e2e.ts) 为无密钥模型目录生成快照，并在显式启用时以文件系统字节验证真实工具执行。不支持自动凭据刷新和进程内轮换。
