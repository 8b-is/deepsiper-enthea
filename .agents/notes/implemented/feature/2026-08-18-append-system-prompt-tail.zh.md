# Agent Note：`appendSystemPrompt` 部署尾部与身份精调

状态：已实现

[English](2026-08-18-append-system-prompt-tail.md) | 中文

## 问题

操作者无法在不编写插件的情况下向系统提示词**末尾**追加指导：部署 persona 位于
顺序 `0`，工具引导占据 `100–199`，因此"再追加一条模型应最后权衡的指令"意味着要
注册自定义段。Voyager（[voyager](https://github.com/Nagi-ovo/voyager)）通过浏览器扩展把已保存
提示词注入输入框，从而为 Gemini/Claude/ChatGPT 解决了同类需求。harness 希望在进程内
获得该能力：一种直接把已保存提示词追加进系统提示词的方式，而不是依赖扩展或插件。

## 决策

**`system-prompt` 新增 `Config.appendSystemPrompt` 字符串。** 设置为非空时，注册表
注册一个位于顺序 `1000` 的 `deployment:append` 段——位于所有工具引导段之后——内容
为精确文本，并与其他段一样做严格插值（`{{variable}}` 引用同样适用）。为空或省略则
不注册任何段。该段是静态、模型可见的，因此可通过对现有持久化 `request/header.system`
快照进行重构；无需新会话事件。

**harness 身份文本做了精调。** `harness:identity` 现在为"You are an AI agent powered
by DeepSeek Harness, an extensible plugin-based agent runtime."——补充了 harness 文档
本身已声明的插件运行时事实，没有添加会与 persona 或工具引导重叠的行为性表述。

**Voyager 参考的是机制而非表层。** Voyager 从 vault 把提示词注入用户输入；harness
的配置驱动注册表是等价的"已保存提示词"槽位，追加到系统提示词是同一设想的部署端形态。
按会话的提示词 vault（含 UI）暂缓（见后果）。

## 备选方案

**`append-system-prompt` 仅作为 CLI 标志 / Web 设置暴露。** 已否决：注册表是唯一的
组合表面，配置字符串是能以最简形式覆盖所有部署模式（cordis.yml、preset、bundle）的
选项，无需新增传输或持久化路径。

**直接交付浏览器扩展式提示词 vault。** 已否决：vault 需要按会话状态、存储与 UI，
而这些都不是系统提示词段所必需的；部署尾部是正确的第一步，vault 会与 settings/storage
机制重复。

**把身份改成更长的 persona 式文本块。** 已否决：身份保持一行事实性描述；行为属于
persona 与工具引导，更长的身份文本会侵入另一段的职责。

## 后果

部署现在可以无需插件、无需扩展，通过 `appendSystemPrompt` 追加尾部指导；它最后渲染、
位于工具引导之后，并记录在持久化 header 中。身份行略长并明确了运行时的插件架构；
所有固定快照与单元测试常量在同一变更中更新。按会话的提示词 vault（Voyager Prompt
Manager 的等价物）及其存储与 UI 仍是未来表面，明确不属于本记录的范围。
