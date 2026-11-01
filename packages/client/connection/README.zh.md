# @deepseek-ai/dsh-client-connection

[English](README.md) | 中文

浏览器传输与 Host HTTP 桥。`ctx.connection` 提供 API 客户端、如实反映页面主机名的 `isLoopback`、按连接 generation 生效的 `access` 和 `hostDescription` 可观察对象，以及单消费方流循环启动器。HTTP POST 承载单次请求和应答，独立的只下行 WebSocket 承载会话及 Host 事件。Host 持有 `/api`，在共享 RPC 拦截器之前授权，未被认领的方法交给 API Proxy。

## 浏览器信任与配置权限

每个 `/api` 请求及 WebSocket upgrade 都经过 [Host/Origin 检查](src/api-request-trust.ts)。`Host` 必须是回环地址或匹配 `trustedHosts`：显式端口精确匹配，无端口条目接受任意端口。附带的 `Origin` 必须匹配 Host 权威，跨站 Fetch Metadata 被拒绝。非规范配置权威导致激活失败。无标记请求不豁免，因为明文 HTTP 浏览器读取可能不带 Origin 和 Fetch Metadata。拒绝在分发前返回 HTTP 403。

`trustedHosts` 防御 DNS rebinding，不是认证。配置读写、凭据管理、模型发现和 preset 创作默认仅限回环访问。普通模型目录及 preset 名单、选择操作仍向可信权威开放。原生桌面操作（`host.pickDirectory`、`host.openPath`、`settings.openDocument`、`agentPreset.openDocument`）始终仅限回环。

## 已认证反向代理

部署可明确允许经过独立认证的 HTTPS 反向代理管理主机配置。上游必须绑定 `127.0.0.1`。配置 Connection 行时保留服务权威：

```yaml
- id: connection
  config:
    trustedHosts: ['harness.example']
    authenticatedProxy:
      origin: https://harness.example
      tokenFile: /private/path/proxy.token
```

私有文件包含 32 个随机字节的小写十六进制编码，共 64 个字符，可带一个末尾换行。仅 harness 与代理账户需要读取权限。Connection 在激活时读取，因此轮换需要协调重载。文件缺失或格式错误会拒绝激活，不显示其内容。

代理必须认证所有外部可访问的应用路由，包括 API 和 WebSocket，然后用文件内容**替换**上游 `X-DSH-Authenticated-Proxy` 请求头。不得让浏览器选择或接收该值。Caddy 应在 `reverse_proxy` 之前保留认证，并使用 `header_up X-DSH-Authenticated-Proxy {file./private/path/proxy.token}`。保留浏览器的 Origin 和 Fetch Metadata，不伪造可信请求头。

代理授权要求真实 socket 对端为回环、公开 Host 精确匹配、密钥恒定时间比较通过，以及 Origin 等于配置的 HTTPS Origin。无 Origin 的 GET 还须带 `Sec-Fetch-Site: same-origin`；无 Origin 的写入被拒绝。既有浏览器信任检查仍生效。证明请求头在 RPC 分发前移除。此模式授予可信管理员设置、凭据、模型发现和 preset 管理权限，不提供用户隔离或原生桌面访问。

`GET /api/access` 仅返回按请求确定的 `{ settings, native }` 布尔值，带 `Cache-Control: no-store`。浏览器 scope 在获准前不持久化到主机，获准后读取主机状态，撤权后阻止新写入和过期响应发布。临时偏好不会自动复制到主机。参见[代理授权决策](../../../.agents/notes/implemented/architecture/2026-11-01-authenticated-proxy-settings.md)。

## WebSocket 下行

`/api/events.mux` 与 `/api/events.host` 接受 WebSocket upgrade，发送对应的 `ServerRequest`；浏览器不在这些 socket 上传送业务数据。就绪要求两条流、`host.describe` 和权限发现完成。权限及主机描述在 connected 回调前发布，generation 失效或 stop 时清空。任一流结束都会触发双流重连。销毁终止 socket、中止 source 并等待清理。普通 GET 返回 426；API Proxy 的 SSE 编解码仅用于进程内载体。

## 模型体验

无；此包只传输已组装消息，不增加模型可见内容。

#### KV Cache 影响

无；此包不组装或发送提供方请求。

## 已知限制与暂缓事项

- **没有内置远程登录或用户隔离。** 代理负责认证，必须保护所有公开路由。共享证明识别可信代理，不识别个人用户。
- **History 会恢复未附加会话。** 打开 history 可能创建其主机 agent 并增加延迟，没有仅持久化读取路径。
- **请求体整体缓冲。** `maxRequestBodyBytes` 默认 160 MiB，覆盖默认 100 MiB 图片经 base64 膨胀及信封开销。降低驻留内存且不降低图片额度需要流式请求体。
