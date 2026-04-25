---
name: using-contextweaver
description: >-
  需要理解代码库中功能如何实现、定位相关代码、或在修改前摸清上下文时主动调用。
  语义检索理解代码行为，而非匹配字符串。用户问"X 怎么实现的""帮我定位 Y 的逻辑"、
  收到 bug 需定位、接手不熟悉模块、或任何需要建立代码地图的场景都应优先使用。
  仅在已知精确文件行号时才退回到 read/grep。
---

# 使用 ContextWeaver

## ContextWeaver 为什么是你的首选

`read` 看局部、`grep` 找字面——但它们都不理解代码**语义**。ContextWeaver 通过向量 + FTS5 + RRF 融合 + Rerank 实现语义级代码理解：

- **理解意图而非匹配字符串**：即使你用的术语和代码里不一样，语义检索也能命中
- **智能排序**：不是把所有匹配都摊给你，而是把最相关的排在前面
- **跨文件上下文**：通过三阶段图扩展，自动关联 import、调用链等相关文件
- **一步建立代码地图**：一个查询就能定位关键类、函数、入口和数据流

换句话说：`grep` 告诉你"哪里有这个字符串"，ContextWeaver 告诉你"这段逻辑是什么、怎么实现的、和哪些文件有关"。

## 何时使用 — 积极使用

以下任何时候，优先用 ContextWeaver 而不是 grep 或盲目 read：

- 用户问"X 是怎么实现的""Y 的处理流程是什么"
- 用户给了一个模糊的改代码请求，你不确定要改哪些文件
- 你需要理解某个模块的职责和对外接口
- 你要修改一段代码，但不知道会影响哪些其他地方
- 你接手了一个不熟悉的项目或模块
- 你看到了一个符号名（类名、函数名），想知道它在整个仓库中的上下文
- 用户说"帮我定位 X 的代码""帮我找一下 Y 的逻辑"
- 收到一个 bug 报告，需要快速定位相关逻辑
- 你想知道两个模块之间是怎么关联/调用的
- 在做任何非 trivial 的修改之前，先摸清代码结构

核心原则：**理解行为 → 用 ContextWeaver；已知精确文件 → 用 read；穷举文本匹配 → 用 grep。**

## 什么时候可以跳过

以下少数情况确实不需要 ContextWeaver，直接用更轻量的工具即可：

- 你 100% 确定要看哪个文件的哪几行 → 直接 `read`
- 任务明确要求"找出所有出现位置""统计次数""逐个替换" → 直接 `grep`

但当你不确定文件路径、不确定影响范围、不确定有没有遗漏关键文件时，**先用 ContextWeaver 扫一遍是最稳妥的选择**。宁可多花 5 秒检索，不要漏掉关键上下文。

## 查询写法

### `information-request`

写完整自然语言，重点描述"怎么工作""如何处理""流程如何衔接"。

好例子：

- `提示词增强相关逻辑目前是如何触发、拼装模板并返回结果的？`
- `当前 CLI 搜索命令如何接入语义检索核心，并将结果格式化输出？`

避免：

- 只写文件名、目录名、零散关键词
- 一次塞多个互不相关的问题

### `technical-terms`

这是硬过滤，只放你 100% 确定存在的精确标识符。

可以放：

- `SearchService`
- `enhancePrompt`
- `handleCodebaseRetrieval`

不要放：

- 猜测的符号名
- 文件路径，如 `src/index.ts`
- 命令字面量，如 `contextweaver search`

## 使用步骤

1. 先写 `information-request`
2. 如果有少量确定符号，再补 `technical-terms`
3. 调用本地脚本：

```bash
node skills/using-contextweaver/scripts/search-context.mjs \
  --repo-path /abs/path/to/repo \
  --information-request "提示词增强相关逻辑目前是如何触发、拼装模板并返回结果的？" \
  --technical-terms SearchService,enhancePrompt
```

默认输出 JSON，方便 agent 稳定消费结构化字段；需要人工排查时可显式追加 `--format text`。

4. 如果脚本输出 JSON，先看最相关的 `files[].path` 和 `segments[].breadcrumb`
5. 命中关键结果后转去 `read` 深入阅读

## 快速参考

| 目标                        | 做法                    |
| --------------------------- | ----------------------- |
| 理解一个功能如何实现        | 首选 ContextWeaver      |
| 改代码前摸清上下文          | 首选 ContextWeaver      |
| 定位不熟悉的符号            | 首选 ContextWeaver      |
| 探索代码架构                | 首选 ContextWeaver      |
| 已知精确文件行号            | 直接 `read`             |
| 穷举全部文本匹配            | 直接 `grep`             |
| 让其他 Skill 自动拿语义证据 | 调 `search-context.mjs` |

## 判断口诀

```
不确定要看哪些文件？ → ContextWeaver
不确定改动影响范围？ → ContextWeaver
想知道"怎么实现的"？ → ContextWeaver
100% 知道文件+行号？ → read
要统计/穷举/全替换？ → grep
```
