# 使用 OpenCode 的 ChatGPT 连接运行

[English](README.md) | 中文

此按需启用的示例通过 OpenCode V2 中已选定的 ChatGPT 连接，在本机运行使用 GPT-6 Astra 的 Deepsiper。工具和会话存储在本机运行；推理（inference）使用 OpenAI 托管的 Codex 端点。

## 启动应用

1. 安装仓库支持的 Node.js 版本和 pnpm，并通过 OpenCode V2 登录 OpenAI。将该连接设为活动连接。启动器的 `PATH` 中必须包含 `opencode` 可执行文件，且启动器须由拥有该连接的操作系统账号运行。
2. 在仓库根目录安装并构建：

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   ```

3. 检查 OpenCode 是否提供唯一可用的 OAuth 凭据：

   ```sh
   pnpm local:opencode check
   ```

   该命令输出配置的模型和 token 到期时间，不泄露 token。它验证凭据元数据，不发送模型请求。

4. 启动浏览器应用：

   ```sh
   DSH_HOME="$HOME/.local/share/deepsiper-opencode" pnpm local:opencode web --host 127.0.0.1 --port 5888
   ```

   打开输出的 URL，关闭首次运行提示，并选择工作区。模型选择器显示 **GPT-6 Astra**，推理（reasoning）强度为 **High**。发送一个小任务并检查工具结果。

5. 仅在终端中发送请求时，使用：

   ```sh
   pnpm local:opencode headless "Reply with exactly ASTRA_CONNECTED"
   ```

## 连接参考

[启动器](../../scripts/opencode-local.ts) 通过 OpenCode 已认证的 CLI（命令行界面）读取 `opencode api get /api/credential`。它仅通过 `DSH_OPENCODE_ACCESS_TOKEN` 将选定的访问 token 传递给 harness，不将 OAuth 凭据写入文件。OpenCode 负责登录和 token 刷新。[覆盖层](cordis.patch.yml) 通过现有的 [pi-ai 提供方](../../packages/llm/llm-pi-ai/README.md) 声明模型及其推理强度选项。

凭据在每次启动时读取一次。连接缺失、不唯一、不是 OAuth、已过期或即将过期时，启动会失败。token 到期后，启动器停止 harness 并返回失败状态。在 OpenCode 中刷新连接，运行 `check`，然后重启启动器或其服务。仅重启不会刷新已过期的凭据。SIGINT 和 SIGTERM 会取消子进程并返回状态 `130`。

模型传输使用 SSE（Server-Sent Events），使无界面请求能正常退出，避免缓存的模型 WebSocket 维持进程存活。浏览器事件通过独立的 WebSocket 连接传递。[Agent Note](../../.agents/notes/implemented/feature/2026-11-01-opencode-chatgpt-launcher.md) 记录凭据所有权和传输方式的理由。

### 反向代理部署

将 harness 绑定到回环地址，并在通过代理启动时添加 `--trusted-host <public-hostname>`。在网关终止 HTTPS 并认证请求；转发公共 `Host` 以及 `/api/events.host` 和 `/api/events.mux` 的 WebSocket 升级。浏览器网关密码与模型 OAuth 访问 token 是独立的凭据。

在服务重启之间保持 `DSH_HOME` 不变，以保留设置和会话。服务须配置为使用与交互式启动相同的操作系统用户和 OpenCode 连接环境。

## 验证

构建后，运行凭据及生命周期测试和完整应用的无密钥模型目录快照：

```sh
pnpm exec vitest run scripts/opencode-local.spec.ts scripts/opencode-local-launch.spec.ts
pnpm exec vitest run --config vitest.e2e.config.ts examples/openai-opencode/tests/built-smoke.e2e.ts
```

在第二条命令中设置 `DSH_OPENCODE_E2E=1` 可启用真实模型测试。该测试使用活动连接，在隔离目录中创建并读取文件，并验证文件字节和进程退出。
