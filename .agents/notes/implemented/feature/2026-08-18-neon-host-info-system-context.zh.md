# Agent Note：来自 Neon sysinfo 插件的宿主硬件运行时上下文

状态：已实现

[English](2026-08-18-neon-host-info-system-context.md) | 中文

## 问题

harness 没有让模型直接读取宿主机的 CPU、操作系统和内存，因此涉及平台的推理（构建目标、资源上限、架构特性）只能询问用户或靠猜测。一个 Neon 插件（`native/hardware-info`，sysinfo 封装在 Rust 边界之后）已经提供了同步快照，但尚无消费方。模型需要在请求上下文中获得该事实，并且只在插件实际可用的主机上注入。

## 决策

**新增一个 context 包，将快照作为一个有序的运行时上下文小节贡献出来。**
`@deepseek-ai/dsh-host-info` 在 order `5` 注册一个 `host:info` 上下文小节
（位于 persona 之后、工具指引之前），其文本在每次 assemble 时重新求值
`hardwareInfo()`。渲染出的块是固定的模型可见文本——缺失字段省略、频率为
`0` 时省略、字节数用一位小数的 GiB / 整数 MiB / 原始字节——在不支持的主机上
渲染为 `''`，因此同一套组合可以安全地在整个集群挂载，退化为无内容。

**模型可见即日志记录的要求由既有的运行时上下文快照满足，无需新事件。**
loop 在连接文本变化时把 `joinContextSections` 投影为一条持久的 `user/message`
事件，并在 source 的 `sections` 中携带每个命名贡献。`./invariant` 伴随模块校验
每一条这样的快照：至多一个 `host:info` 小节，且其文本匹配固定的格式。不修改
`SessionEventMap`，因此持久化目录保持不变。

**addon 包装层改造成 TypeScript 工程。** `native/hardware-info` 现在把
`src/index.ts` 编译到 `lib/`（含类型声明），与 cargo 构建的 `lib/index.node`
并列，遵循 `native/landlock-run/packages/entry` 的先例——关键原因是消费包需要
一个 project reference 指向它，同时它的运行时导入（addon 类型、`createRequire`
保护的加载）现在和其他包一样被类型检查。加载保持惰性且 fail-closed：二进制缺失
或不支持时降级为 `probe() === 'unsupported'`。

## 备选方案

**直接在原生 addon 包内注册上下文。** 已否决：`native/*` 不是 `packages/*/*`
下的 cordis 插件，harness 的插件约定（peer/dev cordis、tsdown bundle、invariant
伴随模块）属于真正的包。

**改为提供 `dsh` CLI 的 `sysinfo` 命令而非提示词上下文。** 已否决（操作者选择
系统提示词路线）：宿主事实在推理过程中就有用，不只是诊断。

**每个请求记录一条专属的 session 事件。** 已否决：组装后的运行时快照已经是持久、
模型可见的记录；第二条事件会重复它并改动 `KNOWN_SESSION_EVENT_TYPES`。

## 后果

挂载 `@deepseek-ai/dsh-host-info` 的部署会给模型一个小的、稳定的前缀块，描述
系统、CPU 与内存，并在每次请求时刷新使可用内存保持最新；没有 addon 二进制的主机
不贡献任何内容，invariant 也无可检查项。在原生发布序列发布之前，addon 依赖是
workspace 私有的。workspace 注册方式现已文档化（`pnpm-workspace.yaml` 是权威；
`packages/*/*` 由 glob 覆盖，`native/*` 不是）——写入 `AGENTS.md` 与
adding-a-package cookbook，避免未来的原生 addon 再次踩到静默成员陷阱。
