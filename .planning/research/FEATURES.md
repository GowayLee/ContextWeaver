# Feature Landscape

**Domain:** 面向 AI Agent 的本地代码语义检索 CLI / Skill 生态
**Researched:** 2026-03-31

## 结论先说

现在用户对这类工具的预期，已经不只是“能搜到代码”。**稳定索引、可诊断失败、明确的部分失败语义、以及广泛 provider 兼容性，已经是 table stakes。**

原因很直接：相邻生态里的主流产品已经把“多 provider / 本地模型 / OpenAI-compatible endpoint / 调试线索 / 面向 agent 的结构化输出”做成默认心智。Aider 明确支持大量云端与本地模型、OpenAI-compatible API，并且把 troubleshooting、启动时环境摘要、模型兼容警告做成正式文档；OpenCode 进一步把 provider 目录、baseURL 自定义、本地 Ollama / LM Studio / llama.cpp、自定义 provider、模型选择与 `/connect` 流程产品化；Repomix / Gitingest 则把“可见范围、token 统计、输出可控、对 agent 友好的产物格式”变成基础体验。

对 ContextWeaver 来说，**当前最应该补的是可信索引面**，不是再叠加新检索花样。尤其是：provider 失败要能定位、索引过程要可见、失败后状态要真实、恢复路径要明确。这些缺失会直接摧毁“检索结果可信”这个核心价值。

---

## Table Stakes

用户默认会期待；缺失会让产品显得“不可靠”或“不适合接入 agent 工作流”。

| Feature                                        | Why Expected                                                                                | Complexity | Notes                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| **显式索引结果语义（成功 / 失败 / 部分失败）** | Brownfield CLI 一旦输出“索引完成”，用户默认相信数据可用；当前项目已被“假成功”问题击中       | Med        | `index` 必须和退出码、统计、最终状态一致；不能出现 Embedding 失败后仍报成功       |
| **Provider 失败可诊断输出**                    | 多 provider 已成常态，用户默认工具会告诉他是认证、限流、batch、模型、维度还是 endpoint 问题 | Med        | 至少要输出 provider 名称、HTTP 状态、上游错误摘要、建议动作；敏感信息要脱敏       |
| **索引过程可见性**                             | 相邻工具普遍提供范围、模型、token、上下文或运行摘要；用户不接受“黑箱跑很久然后挂掉”         | Med        | 至少展示：扫描文件数、跳过原因、chunk 数、embedding 批次数、耗时、当前阶段        |
| **失败即停止的安全语义**                       | 对本地索引工具，错误数据比没有数据更糟；用户更接受 fast fail 而不是脏状态                   | Med        | 当前项目已明确以 Embedding 错误立即失败为目标，这应成为默认语义                   |
| **索引一致性保护**                             | 向量库、SQLite、FTS 多存储是内部实现细节；用户默认它们要么一起成功，要么系统承认未完成      | High       | 至少要避免“SQLite 记成功、LanceDB 没写入”的分裂状态                               |
| **Provider 兼容配置**                          | Aider / OpenCode 都已把 OpenAI-compatible、自定义 baseURL、本地模型接入做成标准能力         | Med        | 至少应继续稳定支持 OpenAI-compatible embeddings endpoint，并清楚声明模型/维度要求 |
| **本地与代理 provider 兼容**                   | 用户现在常用 Ollama、LM Studio、代理网关、云厂商兼容层                                      | Med        | 不一定首轮都做官方适配，但至少别把实现绑死在单一厂商错误格式上                    |
| **范围控制与可预测跳过**                       | Repomix / Gitingest 都把 include / ignore / gitignore 视为基础；检索工具更应如此            | Low        | 当前已有 `cwconfig.json`，但还要把“为什么某文件没进索引”讲清楚                    |
| **机器可消费输出**                             | agent 生态默认需要 JSON / 结构化输出                                                        | Low        | 当前 `search` / `prompt-context` 已有 JSON；`index` 也应补充结构化状态/统计输出   |
| **基础健康检查 / preflight**                   | 多 provider + 原生依赖 + 本地存储，用户期待先发现配置错再开跑                               | Med        | 检查 API key、baseURL、模型、维度、目录可写、原生依赖可用性                       |

### Table-stakes 中最关键的 4 项

1. **诊断型 provider 错误**
2. **真实而非误导的索引完成语义**
3. **中断后不留下脏状态**
4. **可见的索引进度与跳过原因**

这 4 项对本项目不是“体验优化”，而是当前版本可信度的生死线。

---

## Differentiators

不是所有竞品都有，但做对了会明显拉开差距，而且与 ContextWeaver 现有产品形态高度匹配。

| Feature                                       | Value Proposition                                                                                           | Complexity | Notes                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| **检索 CLI 与 Skill 一体化交付**              | 多数工具只解决“打包 repo”或“接聊天模型”；ContextWeaver 同时服务 CLI 和 agent 技能消费链路，这是很强的差异点 | Med        | 应继续强化“结构化检索结果 → Skill → Agent 任务收敛”的闭环 |
| **Prompt-context / repo-evidence 准备**       | 相邻工具多停在 repo map、digest、pack；直接输出可用于 prompt enhancement 的证据包更贴近 agent 实战          | Med        | 这是当前项目最清晰的 differentiator 之一                  |
| **混合检索 + 图扩展 + token-aware packing**   | 单纯打包仓库或 repo map 很常见，但“召回 → 扩展 → 打包”一整套本地检索链路仍有区分度                          | High       | 应作为“可靠索引”恢复后再继续放大的卖点                    |
| **可恢复索引（resume from safe checkpoint）** | 大多数工具文档强调输出与连接，较少把索引恢复语义做扎实；若做好会非常实用                                    | High       | 关键是“只从确认失败的 batch/文件恢复”，而不是盲目续跑     |
| **结构化部分失败报告**                        | 不是简单打印 warning，而是输出 failed/skipped/retried/provider-limited 文件清单                             | Med        | 很适合 agent 二次处理，也能喂给后续自动修复流程           |
| **Provider 能力探测与自适应策略**             | 自动探测 batch 限制、维度要求、速率限制，再调整并发/批量，会显著降低用户配置成本                            | High       | 这属于强 differentiator，但前提是先把失败分类打清楚       |
| **索引可解释性报告**                          | 用户不仅知道索引完成，还知道哪些文件被跳过、为什么跳过、哪类语言退化到 plain-text                           | Med        | 对 brownfield 代码库特别有价值                            |
| **失败后降级可检索语义**                      | 例如 AST 失败时退化为 plain-text chunking，而不是永久丢文件                                                 | High       | 当前 concern 已指出这是明显缺口；补上后差异化很强         |
| **面向 agent 的索引状态 API / JSON**          | 让 agent 能判断“可搜索 / 需重试 / 仅词法可用 / 向量未就绪”                                                  | Med        | 比单纯 CLI 文本更适合 Skill 生态                          |

### 最值得保留并强化的 differentiators

1. **Skill 生态集成**
2. **prompt-context 证据准备**
3. **混合检索 + 图扩展 + token-aware packing**
4. **面向 agent 的结构化失败 / 状态输出**

---

## Anti-Features

这些不是“永远不做”，而是**当前阶段明确不该优先做**。

| Anti-Feature                                | Why Avoid                                            | What to Do Instead                                                     |
| ------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| **继续扩展新搜索玩法，但不先修索引可信度**  | 现阶段主要痛点不是召回不够花，而是索引结果不可信     | 先补失败语义、一致性、诊断、恢复能力                                   |
| **Embedding 失败后默认继续处理剩余批次**    | 会制造混乱的半完成状态，用户很难判断数据是否可用     | 默认 fail-fast；后续若支持继续，也要显式进入“partial”模式              |
| **吞掉上游错误细节，只给一句 HTTP 400/500** | 用户无法自助定位 provider 限制、模型不兼容、维度错配 | 输出 provider、endpoint 类型、HTTP 状态、错误码、建议动作              |
| **自动“修复”索引状态但不告诉用户做了什么**  | 黑箱修复会降低信任，尤其在多存储系统里               | 明确显示修复/回滚/重建动作和结果                                       |
| **把 provider 支持写死成单厂商假设**        | 生态已经全面多 provider；单厂商假设会快速过时        | 以 OpenAI-compatible 抽象为基线，允许 baseURL 和 provider 元数据扩展   |
| **在失败路径泄露完整请求体 / 密钥**         | 诊断需要细节，但日志可分享性同样重要                 | 脱敏后输出关键信息，原始密钥永不打印                                   |
| **把“恢复能力”做成隐式脏状态续跑**          | 看似方便，实际最容易累积不可解释的数据错误           | 基于 checkpoint / batch ledger / transaction-like semantics 做显式恢复 |

---

## 针对当前里程碑必须强调的特性簇

### 1) Diagnosable provider failures

这是 **绝对 table stakes**。

建议最少包含：

- provider 标识（例如 OpenAI-compatible / Ollama / 自定义 endpoint）
- 请求阶段（配置校验 / preflight / embedding batch / 写入前 / 写入后）
- HTTP 状态码与上游错误 message
- 可安全分享的请求摘要：模型名、batch size、dimensions、并发数、endpoint host
- 错误分类：认证、配额、限流、模型不存在、维度不匹配、batch 超限、超时、网络中断、响应格式不兼容
- 建议动作：减小 batch、检查模型、检查 baseURL、检查 provider 是否真的兼容 OpenAI embeddings

**Why table stakes now:** Aider 和 OpenCode 都把多 provider / troubleshooting / custom baseURL 文档化了，用户已经形成“模型接入问题应该能被排查”的预期。

### 2) Indexing visibility

这也是 **table stakes**。

建议最少包含：

- 预估/实际文件数
- 按阶段进度：crawl → process → chunk → embed → persist
- 跳过文件计数与原因分布（ignore / too large / unsupported / parse failed / empty）
- 最终摘要区分 success / partial / failed
- 支持 JSON 结果，便于 Skill 或脚本消费

**Why table stakes now:** 相邻工具至少会给 token 统计、repo 范围、运行摘要；索引型工具更应该解释自己到底处理了什么。

### 3) Resume / recovery

这是 **近 table stakes，且对本项目几乎应视作下一阶段核心 differentiator**。

建议分两层：

- **Phase 1（先做）**：失败后状态真实、可安全重跑、不产生假成功
- **Phase 2（再做）**：基于 checkpoint / batch ledger 的显式 resume，只重试失败部分

用户未必马上要求“自动恢复”，但一定要求“失败后我知道怎么安全再来一次”。

### 4) Safe failure semantics

这是 **table stakes**。

最重要的不是“尽量成功”，而是：

- 一旦失败，搜索端不会误把坏索引当好索引
- SQLite / LanceDB / FTS 状态不再互相矛盾
- CLI 退出码、终端文案、结构化输出三者一致

---

## Feature Dependencies

```text
Preflight health checks → Diagnosable provider failures
Diagnosable provider failures → Safe fail-fast semantics
Safe fail-fast semantics → Honest final status
Honest final status → Safe re-run semantics
Safe re-run semantics → Resume / recovery
File skip reason tracking → Indexing visibility
Indexing visibility → Structured partial failure reports
Consistent persistence state → Search/prompt-context can trust index readiness
Structured index status JSON → Skill ecosystem can react automatically
Reliable indexing core → Differentiators like graph expansion and prompt-context feel trustworthy
```

---

## MVP Recommendation

本项目当前里程碑应优先做的，不是“更多功能”，而是“把现有能力变可信”。

优先级建议：

1. **显式且真实的索引状态语义**
   - 成功、失败、部分失败分清楚
   - 退出码和文案一致
2. **可诊断的 provider / embedding 失败输出**
   - 至少覆盖 batch size、模型、维度、认证、限流、超时等高频问题
3. **索引过程可见性与跳过原因统计**
   - 让用户知道系统做了什么、没做什么
4. **安全失败语义与一致性保护**
   - 不再留下“假成功”或跨存储脏状态
5. **可安全重跑**
   - 即使还没有真正 resume，也必须保证重跑不会踩脏数据

可在下一阶段补强：

- **显式 resume / recovery**：在状态真实之后再做，否则恢复逻辑只会放大混乱
- **provider 能力探测与自适应 batching**：很有价值，但依赖前面先有清晰错误分类
- **AST 失败自动降级为 plain-text chunking**：价值高，但需要和一致性/状态模型一起设计

延期：**新的搜索子命令或新的高级检索玩法**

- 原因：当前用户更缺的是可信索引，不是更花的检索面。

---

## Sources

### HIGH confidence

- 项目现状与缺口
  - `/home/haurynlee/00-workspace/engineering/ContextWeaver/.planning/PROJECT.md`
  - `/home/haurynlee/00-workspace/engineering/ContextWeaver/.planning/codebase/CONCERNS.md`
  - `/home/haurynlee/00-workspace/engineering/ContextWeaver/README.md`
- Aider README（多模型、本地模型、repo map、troubleshooting）
  - https://github.com/Aider-AI/aider/blob/main/README.md
- Aider docs: Connecting to LLMs
  - https://aider.chat/docs/llms.html
- Aider docs: OpenAI compatible APIs
  - https://aider.chat/docs/llms/openai-compat.html
- Aider docs: Troubleshooting
  - https://aider.chat/docs/troubleshooting.html
- OpenCode docs: Providers（75+ providers、自定义 baseURL、本地模型、自定义 provider）
  - https://opencode.ai/docs/providers/
- OpenCode docs: Intro（`/connect`、`/models`、agent / plan mode）
  - https://opencode.ai/docs/
- Repomix README（范围控制、token counting、verbose、MCP、skill generation、remote/local）
  - https://github.com/yamadashy/repomix/blob/main/README.md
- Gitingest README（digest、统计、CLI、本地/远程、gitignore）
  - https://github.com/coderamp-labs/gitingest/blob/main/README.md
- Ollama API docs（本地 API、统计字段、tool calling、structured outputs）
  - https://github.com/ollama/ollama/blob/main/docs/api.md

### MEDIUM confidence

- “resume / recovery 已普遍成为 table stakes”这一点：官方文档里更常见的是状态透明、可重跑、范围控制；真正做扎实 checkpoint resume 的公开 CLI 文档不算普遍。因此这里的结论是：**对 ContextWeaver 这种有持久化索引的工具，它应尽快成为 table stakes；就公开生态披露而言，更接近 next-up differentiator。**
