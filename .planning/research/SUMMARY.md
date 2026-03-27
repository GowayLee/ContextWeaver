# Project Research Summary

**Project:** ContextWeaver
**Domain:** 本地优先代码语义检索 CLI / Skill 生态，当前聚焦索引可靠性修复
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

ContextWeaver 不是从零做的新检索产品，而是一个已经具备扫描、分块、混合搜索、图扩展和 prompt 证据准备能力的 brownfield CLI。结合 4 份研究，当前最重要的结论非常一致：这轮工作不该继续扩展搜索玩法，而要把 `index` 命令改造成“说真话、能失败、可恢复、状态一致”的可靠索引作业系统。专家做这类产品时，通常把 SQLite 作为控制面真相源，把 LanceDB 作为派生向量读模型，用 run-based publish/recovery 取代“边写边算成功”的脆弱双写路径。

推荐方向也很明确：继续沿用 Node.js + TypeScript + SQLite + LanceDB + 外部 Embedding Provider 的本地形态，但补齐 provider-aware batching、错误分类、超时/取消、运行期诊断、分阶段状态机，以及只读 published snapshot 的检索语义。第一优先级不是“尽量继续跑完”，而是 Embedding fatal error 发生后立即停机、非 0 退出、拒绝打印误导性成功信息，并保证 search / prompt-context 永远只消费最后一个健康发布版本。

本项目的核心风险不在召回算法，而在失败边界：provider 限制差异会触发 400/422/429，SQLite/FTS/LanceDB 的跨存储写入会制造半完成状态，粗糙日志会让问题看起来像随机故障。缓解策略同样清晰：按 provider/model 管理能力上限，建立 run ledger 与 batch ledger，先 staged 写入再 publish，分离 content / embedding / vector / fts / publish 状态，并把恢复能力放在“真实状态 + 安全重跑”之后实施。

## Key Findings

### Recommended Stack

栈方向不需要推翻重来，重点是把现有技术栈运营得更严格、更可恢复。研究一致支持继续使用本地 CLI 形态，控制面落在 SQLite，向量落在 LanceDB，provider 侧通过统一 HTTP adapter 而不是深绑某家 SDK 来承载多 provider 差异。

**Core technologies:**

- **Node.js 22+ / 24 LTS**：CLI 运行时 — 缩小原生依赖兼容面，适合 `better-sqlite3`、Tree-sitter、LanceDB。
- **TypeScript 5.9.x**：主语言与类型边界 — 适合把 provider 错误、状态机、诊断事件做成可判别联合类型。
- **SQLite 3.51.3+ + better-sqlite3 12.x**：控制面真相源、元数据、FTS、run ledger — 事务边界清晰，适合恢复与发布语义。
- **SQLite FTS5**：词法召回 — 继续作为混合搜索的 first-class 组成，不应被纯向量替代。
- **LanceDB 0.22+**：本地向量读模型 — 适合嵌入式向量检索，但必须由 SQLite 的 generation/run manifest 驱动可见性。
- **Node built-in fetch + AbortSignal.timeout()**：provider HTTP 调用 — 便于统一 timeout / cancel / 适配多 provider。
- **pino + zod**：日志与校验 — 诊断要结构化、可脱敏，provider 响应与配置要做运行时校验。
- **p-limit / p-queue / p-retry**：并发、限流、重试 — 用于本地处理与 provider orchestration，但重试必须受错误分类约束。

**Critical version / operating requirements:**

- Node 运行时应收敛到 22/24 LTS。
- SQLite 需跟进 3.51.3+ 或等价修复版本，避免近期 WAL-reset 相关风险。
- LanceDB 建议精确 pin 经过验证的 minor 版本，并在 publish 后显式 refresh/reopen reader。

### Expected Features

这轮里程碑的“功能”本质上是可靠性功能，而不是新能力扩展。研究结论非常统一：稳定索引、可诊断失败、真实状态语义和安全重跑，已经是这类工具的 table stakes。

**Must have (table stakes):**

- **显式且真实的索引状态语义** — success / failed / partial 必须和退出码、最终摘要、可见性一致。
- **可诊断的 provider 失败输出** — 至少说明 provider、模型、HTTP 状态、错误分类、batch/dimension 摘要、建议动作。
- **索引过程可见性** — 展示阶段进度、扫描与跳过统计、批次处理情况、最终摘要。
- **失败即停止的安全语义** — Embedding fatal error 后停止调度、取消在途请求、拒绝继续宣告成功。
- **跨存储一致性保护** — 避免 SQLite/FTS/LanceDB 出现“部分成功但被当成成功”的分裂状态。
- **兼容多 provider / OpenAI-compatible 配置** — 实现不能写死单厂商假设。
- **基础 preflight / health check** — 在真正开跑前尽早发现 API key、baseURL、模型、维度、目录权限问题。
- **机器可消费的结构化状态输出** — 便于 Skill / agent 根据索引健康度做后续动作。

**Should have (competitive):**

- **Skill 生态集成与结构化失败输出** — 让 agent 能判断可搜索、需重试、仅词法可用等状态。
- **Prompt-context 证据准备闭环** — 这是现有产品最该保留的差异点，但前提是底层索引可信。
- **显式 resume / recovery** — 在状态真实之后，支持从安全 checkpoint 恢复而不是整仓重跑。
- **Provider 能力探测与自适应 batching** — 自动学习 provider 上限，降低用户配置成本。
- **索引可解释性报告 / 部分失败清单** — 适合 operator 和 agent 二次处理。

**Defer (v2+):**

- 新的搜索子命令或更花的高级检索玩法。
- 默认跨 provider 自动 fallback。
- 隐式“自愈式”续跑机制。
- 在没有稳定状态模型前推进 AST 降级等更复杂恢复策略。

### Architecture Approach

推荐架构不是简单修几处错误处理，而是把 `index` 重构为显式的 run-based 作业流：CLI / Run Coordinator 建 run ledger，Manifest Builder 固化本次扫描快照，Chunk Pipeline 产出 chunk 与文件状态，Embedding Gateway 负责 timeout / retry / classify / batching，SQLite 记录控制面状态与 published pointer，LanceDB 只存 staged/published 向量，Publish Switch 在双存储 durable 后切换生效 run，Search Runtime 永远只读取 published run，Recovery/Cleanup 负责处理 failed / abandoned run。

**Major components:**

1. **CLI / Run Coordinator** — 创建 `run_id`、拿项目锁、汇总结果、决定退出码与最终状态。
2. **Manifest + Chunk Pipeline** — 固化 repo snapshot，追踪 changed/new/deleted 文件，产出 chunk 与跳过原因。
3. **Embedding Gateway** — 统一 provider 调用、超时、重试、错误分类、batch 限制诊断。
4. **SQLite Control Plane** — 保存 runs、batch ledger、file/chunk/FTS 状态、诊断、published pointer。
5. **LanceDB Vector Staging** — 保存某个 run/generation 的向量数据，不直接代表“当前真相”。
6. **Publish Switch + Search Runtime** — 只在 staged run 完整后发布；检索侧只读 published snapshot 并刷新缓存/reader。

### Critical Pitfalls

1. **把 provider 限制当成通用常量** — 必须维护 provider/model capability registry，并在发送前切 batch、估 token、校验维度。
2. **对不可恢复错误也重试，且没有 timeout/cancel** — 只重试 429/5xx/网络抖动；所有请求必须有 deadline，fatal error 后停止调度并取消在途请求。
3. **失败了却显示“索引完成”** — 统一最终状态机；只有 publish 成功后才允许打印完成文案和成功统计。
4. **SQLite、FTS、LanceDB 分开写但没有发布边界** — 用 staged write + publish barrier + health markers，而不是伪双写事务。
5. **把空结果或失败文件标成已索引** — 文件状态至少拆成 `pending / chunk_failed / embed_failed / write_failed / indexed`，只有 durable success 才能收敛。

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: 真失败语义与可诊断 Provider 边界

**Rationale:** 先让系统说真话，否则后续一致性、恢复、agent 消费都没有可信基础。
**Delivers:** 统一 run/final status、非 0 退出、fatal error 即停、provider 错误分类、超时/取消、结构化诊断输出、基础 preflight。
**Addresses:** 真实索引状态语义、provider 失败可诊断输出、失败即停止、安全结构化状态输出。
**Avoids:** Pitfall 1、2、3、8。

### Phase 2: 发布边界与跨存储一致性

**Rationale:** 解决“SQLite 说成功但 LanceDB 没写完”这类根本性可信度问题，让 search/prompt-context 只看健康快照。
**Delivers:** run ledger、batch ledger、published run pointer、staged write protocol、分离 content/embedding/vector/fts/publish 状态、search snapshot isolation、读者 refresh。
**Uses:** SQLite 作为真相源，LanceDB 作为派生向量层，FTS5 作为词法层。
**Implements:** Stage-then-publish、Search-reads-published-only、state decomposition。

### Phase 3: 安全重跑、恢复与运维工具

**Rationale:** 在状态真实且发布边界清晰后，才适合实现可恢复语义，否则恢复只会放大脏状态。
**Delivers:** dirty marker、resume/discard failed run、verify/repair、orphan cleanup、明确 operator 提示。
**Addresses:** 可安全重跑、显式 resume/recovery、结构化部分失败报告。
**Avoids:** Pitfall 4、5、6、9。

### Phase 4: 观测、测试与自适应优化

**Rationale:** 最后再补深层 observability 和 provider 自适应策略，避免在状态模型未定前做复杂优化。
**Delivers:** run/batch/provider 维度日志与指标、故障注入测试、provider-aware adaptive batching、可能的 AST fallback 设计验证。
**Addresses:** 索引可见性、能力探测、自适应批量、长期稳定性。
**Avoids:** Phase 早期过度设计、优化建立在错误状态模型之上。

### Phase Ordering Rationale

- 研究中的依赖关系很一致：preflight/diagnostics → fail-fast semantics → honest final status → safe re-run → resume/recovery。
- 架构上必须先建立 run ledger 与 publish boundary，后续恢复和 repair 才有明确对象。
- 先修说真话与快照隔离，可以立即止住“假成功”“半成品可见”“agent 误消费”三类最伤信任的问题。
- 新搜索玩法和复杂自适应策略都应后置，因为当前瓶颈是索引可信度，不是搜索能力上限。

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3：恢复与运维工具** — resume/discard、repair 粒度、LanceDB orphan cleanup 细节仍需结合现有 schema 与落盘方式细化。
- **Phase 4：自适应 batching / AST fallback** — provider runtime learning 与降级策略价值高，但实现边界和副作用需要额外验证。

Phases with standard patterns (skip research-phase):

- **Phase 1：真失败语义、timeout、retry matrix、结构化诊断** — 模式成熟，已有明确官方与项目内证据。
- **Phase 2：SQLite truth source + staged publish + snapshot-only reads** — 官方文档与研究结论都足够一致，可直接进入规划。

## Confidence Assessment

| Area         | Confidence | Notes                                                                                       |
| ------------ | ---------- | ------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | 关键建议大多有官方文档支撑，且与当前 brownfield 形态高度一致。                              |
| Features     | HIGH       | 结论与竞品趋势、项目当前痛点、生态预期高度一致；resume 是否已成普遍 table stakes 略有弹性。 |
| Architecture | HIGH       | SQLite/LanceDB 的职责划分、publish 语义、只读 published snapshot 有充分来源支持。           |
| Pitfalls     | HIGH       | 多数风险已被真实项目上下文或官方限制直接验证，尤其是 provider 限制与假成功问题。            |

**Overall confidence:** HIGH

### Gaps to Address

- **现有 schema 与状态字段的落地映射**：规划时要确认当前 SQLite/LanceDB 表结构如何最小代价引入 run ledger、published pointer、batch ledger。
- **LanceDB 当前读写刷新策略**：需要在实现前验证现有 reader/cache 生命周期，明确 publish 后 refresh/reopen 的最小改动路径。
- **index JSON 输出契约**：要决定给 CLI、Skill、后续 agent 的结构化状态字段，避免后续重复破坏兼容性。
- **resume 粒度**：是按 batch、按 file 还是按 generation 恢复，需要结合现有增量索引逻辑单独设计。
- **provider capability 数据来源**：首轮是静态 manifest、配置文件还是运行时学习，需要在 Phase 1 规划时定清楚边界。

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` — 当前里程碑范围、约束、失败语义目标。
- `.planning/research/STACK.md` — 运行时、存储、provider orchestration 与操作性建议。
- `.planning/research/FEATURES.md` — table stakes、differentiators、功能依赖与 MVP 优先级。
- `.planning/research/ARCHITECTURE.md` — run-based publish/recovery、组件边界、数据流与 build order。
- `.planning/research/PITFALLS.md` — 关键故障模式、预防策略与阶段警告。
- SQLite 官方文档（transactions / WAL / PRAGMA / FTS5）— 事务、WAL、FTS 与 checkpoint 语义。
- Node.js 官方文档（fetch / AbortSignal.timeout / AbortSignal.any）— provider 请求超时与取消边界。
- LanceDB 官方文档（consistency / versioning / reindexing）— staged/published 语义与 reader refresh 依据。

### Secondary (MEDIUM confidence)

- Cohere / Jina / Voyage AI 官方 API 文档 — 验证 provider 限制差异、批量与速率限制不可统一写死。
- Aider / OpenCode / Repomix / Gitingest 文档 — 验证多 provider、可诊断配置、结构化输出、范围控制已成为用户预期。

### Tertiary (LOW confidence)

- 无新增低置信度外部结论；主要未决点集中在本仓 brownfield 实现映射，而不是外部知识缺口。

---

_Research completed: 2026-03-31_
_Ready for roadmap: yes_
