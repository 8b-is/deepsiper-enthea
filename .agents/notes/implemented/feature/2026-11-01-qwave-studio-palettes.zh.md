# Agent Note: Qwave studio palettes stay beside light and dark

Status: implemented

[English](2026-11-01-qwave-studio-palettes.md) | 中文

## Problem

DeepSiper 的外观行可以跟随操作系统，但没有具名的视觉工作室。Qwave 已经命名了六个偏暗的工作室——深海、Dra 星光、凤凰晶格、翡翠矩阵、暖纸禅意和赛博霓虹——并在页面背后移动波浪。把这套动效复制进每个功能样式表会散落颜色，也会忽略减少动态效果。

## Decision

[ui-theme](../../../../packages/client/ui-theme/README.md) 把 `palette` 与 `preference` 存在同一个 Host settings 分区。`classic` 是默认值，不改基础样式表。六个工作室是第一方 id，不是第三方主题注册。[wave-palettes.css](../../../../packages/client/ui-theme/src/styles/wave-palettes.css) 在 `body[data-dsh-wave]` 上为两种配色方案改写共享别名。index 引导脚本和 [ThemePresenter](../../../../packages/client/ui-layout/src/client/theme-presenter.ts) 写入该属性。漂移动画只在 `prefers-reduced-motion: no-preference` 内运行；暖纸保持静止。外观行保留浅色、深色和跟随系统，并增加波浪主题芯片行。

调色板数值来自 Qwave 的工作室预设：深海 `#6ef7f7`、Dra 星光 `#ff9edb`、凤凰 `#ff7b39`、翡翠 `#00ff9f`、暖纸 `#ebcb8b`、赛博 `#00f5d4`。浅色方案使用更深的强调色，以保持文字可读。

## Alternatives considered

**用六个工作室替换浅色、深色和跟随系统。** 那会丢掉操作系统偏好，并让每个工作室只能是深色主题。工作室是身份，不是配色方案控件的替代品。

**把工作室注册成第三方主题。** 那些 id 不跨越 settings schema，公共浏览器会在重新加载时丢掉选择。工作室是产品设置，所以走现有的偏好写入。

**在应用背后放 WebGL 波浪。** Qwave 的着色器是页面工作室，不是智能体外壳的依赖。CSS 背景漂移给出动效，不必增加第二个 GPU 消费者，减少动态效果时也会去掉它。

## Consequences

共享别名覆盖会给外壳、侧边栏和主要控件换色。仍绘制字面颜色的功能不会跟上工作室。翡翠把界面字体换成等宽字体栈；暖纸使用衬线字体栈。已有 settings 文档通过 schema 默认值获得 `palette: classic`。凡是 Host settings 写入已经可用的地方，包括经过认证的公共浏览器，这个选择都会保留。
