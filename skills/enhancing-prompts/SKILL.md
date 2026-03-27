---
name: enhancing-prompts
description: Use when 用户给出模糊的代码库修改请求，需要先基于仓库事实把请求收敛成可执行任务，再决定是否用一次 Question 分流确认，然后继续规划或实现
---

# 提示词增强

## 概述

这个 Skill 不是“把 prompt 润色得更好看”，而是把模糊的代码库修改请求整理成一个更适合 agent 继续执行的任务说明。

核心原则：

- 先拿仓库证据，再做增强
- 脚本只准备证据，不做语义推理
- 默认先形成“推荐任务解释”
- 只有当一个关键歧义会改变实现边界时，才使用一次 `Question`
- 一旦用户回答，就立刻合成“最终任务 prompt”并继续工作

## 何时使用

适合：

- 用户给的是一句模糊的功能请求、改造方向、重构意图
- 用户明确希望“先基于仓库事实增强需求，再继续执行”
- 后续要把增强结果交给规划、实现或代码修改流程

不适合：

- 用户只是问纯知识问题
- 任务已经非常清晰，文件范围和约束都明确
- 用户明确要求不要改写或不要推断

## 工作流

### 第一步：准备仓库证据

```bash
node skills/enhancing-prompts/scripts/prepare-enhancement-context.mjs \
  --repo-path /abs/path/to/repo \
  "把 prompt enhance 从 MCP 迁移到 skill-first 工作流"
```

如果你已经知道少量明确路径或符号，可以补：

```bash
node skills/enhancing-prompts/scripts/prepare-enhancement-context.mjs \
  --repo-path /abs/path/to/repo \
  --paths src/index.ts,src/promptContext/index.ts \
  --symbols buildPromptContext,SearchService \
  "把 prompt enhance 从 MCP 迁移到 skill-first 工作流"
```

脚本默认输出 JSON，方便 agent 稳定读取 `language`、`technicalTerms`、`retrieval.status`、`topPaths`、`evidence` 等字段；需要手工排查时再显式加 `--format text`。

### 第二步：生成推荐任务解释

读取脚本返回的 JSON，只把它当作仓库证据，不要把它当作结论。然后输出：

1. 推荐任务解释
2. 为什么这样理解（2-4 条仓库事实）
3. 当前默认假设

参考 `templates/agent-template.zh.md`。

### 第三步：判断是否需要 Question

只有当下面任一情况成立时，才用一次 `Question`：

- 用户的请求在仓库语境下可以落到两种明显不同的实现方向
- 一个关键约束会直接改变改动范围、架构边界或交付形式

不要为了“更完整”而连续提问，也不要问风格偏好型问题。

参考 `templates/question-template.zh.md`。

### 第四步：合成最终任务 prompt

- 如果不需要提问：直接给出最终任务 prompt
- 如果用户回答了 `Question`：把答案并回推荐任务解释，立刻给出最终任务 prompt
- 然后继续规划或实现，不要让用户手工拼 prompt

## Question 规则

- 每次最多一个问题
- 问题要短，选项要直接对应不同实施方向
- 第一个选项放推荐项
- 问题应该帮助“最终任务 prompt”收口，而不是重新开始澄清会话

## 输出结构

推荐保持下面四块：

1. `推荐任务解释`
2. `仓库证据`
3. `当前假设`
4. `最终任务 prompt`

如果需要提问，则在 `最终任务 prompt` 之前插入一次 `Question`。

## 常见误判

| 误判                                  | 更好的做法                           |
| ------------------------------------- | ------------------------------------ |
| 把脚本证据直接当成最终结论            | 先由 agent 解释，再形成任务          |
| 把长对话历史塞进脚本                  | 只传原始请求和少量显式线索           |
| 连续问很多澄清问题                    | 最多一次 `Question`                  |
| 一上来给 3 个超长 prompt 让用户自己挑 | 先给推荐任务解释，必要时只做一次分流 |
| 为了显得谨慎而不做任何默认            | 能合理默认的就默认                   |

## 警讯

- “我先问几个开放式问题再说”
- “脚本已经告诉我用户真正想要什么了”
- “我把全部聊天记录都塞给脚本更稳”
- “我先给三个大段候选让用户自己消化”

出现这些念头时，回到核心原则：证据先行、一次收口、最终要形成可执行任务。
