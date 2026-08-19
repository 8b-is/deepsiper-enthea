# dsh-nu-local

[English](README.md) | 中文

`ctx.shell` 能力 seam 的本地 nushell 执行器，从 **Nix store 路径**供给，保证确定性执行。

## 模型体验

命令以 `nu --no-config-file -c <command>` 在托管进程组中通过 `ctx.subprocess` 运行。每台宿主机都运行来自同一 nixpkgs pin 的完全相同的 nushell：二进制通过 `nix build --no-link <flake>#nushell` 每进程解析一次，并以内容寻址的 store 路径缓存，因此没有逐命令的 Nix 开销。`nuBin` 用显式路径覆盖该解析。

模型看到 stdout、带标记的 `[stderr]` 段落、带完整输出落盘路径的截断提示，以及退出状态标记（`[exit code: N]`、`[killed by signal: <signal>]`、`[timed out after <ms>]`）。

## 配置

| Key | 默认值 | 含义 |
|-----|--------|------|
| `cwd` | `process.cwd()` | 默认工作目录 |
| `timeoutMs` | `120_000` | 前台超时 |
| `maxTimeoutMs` | `600_000` | 逐调用超时的上限 |
| `maxOutputBytes` | `64_000` | 每流内存上限（超出则落盘） |
| `maxSpillBytes` | `64 MiB` | 落盘文件上限 |
| `graceMs` | `3_000` | SIGTERM→SIGKILL 宽限期 |
| `nuBin` | — | 显式 nushell 路径；绕过 Nix 解析 |
| `nixpkgsFlake` | `nixpkgs` | 构建其 `#nushell` 的 flake 引用 |
| `nixBinary` | `nix` | `nix` 可执行文件 |

## 已知限制与待办

- `start()`（后台）要求 nushell 路径已先解析——前台 `run()`（或 `ensureNu()`）会预热缓存。这一点写在抛出的错误消息里，并在执行器边界强制。
- Nix 解析在首次使用时依赖网络/registry；`nuBin` 是离线逃生舱。
- 双语 README 同步（`README.zh.md` / `README.i18n.yaml`）已由本次仓库 doc-sync 完成。