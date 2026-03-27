# Domain Pitfalls

**Domain:** 本地代码语义检索 / 索引 CLI（多 Embedding Provider + 本地 SQLite/LanceDB 索引）
**Researched:** 2026-03-31

## Critical Pitfalls

### Pitfall 1: 把 provider 限制当成“通用常量”

**Confidence:** HIGH

**What goes wrong:** 用固定 batch size、固定并发、固定维度去适配所有 Embedding API，结果在某些 provider 上直接触发 400/422/429，或被静默截断。

**Why it happens:** 多 provider 的请求上限、输入条数、token 长度、截断策略、输出维度都不一样。比如 Cohere 官方文档明确写了每次 `embed` 最多 `96` 个 texts/input；超长输入还受 `truncate` 策略影响。现有项目上下文也已经表明社区经常踩到 batch size/provider 限制问题。

**Consequences:**

- 大仓库在中后段才失败，浪费大量 API 成本和时间
- 同一套配置在 A provider 可用，在 B provider 直接报错
- 用户以为是“偶发 API 波动”，实际是可复现的请求整形错误

**Warning signs:**

- 错误集中为 `HTTP 400/422`，且发生在特定 batch 或大仓库
- 更换模型/供应商后才开始失败
- 日志里只有 `Embedding API 错误: HTTP 400`，没有 request shape、batch token、provider message

**Prevention:**

- 建立 provider capability registry：`maxInputsPerCall`、`maxTokensPerInput`、`supportedDimensions`、`truncateBehavior`、`rateLimitHints`
- 发送前做本地 preflight：按 provider 规则切 batch、估 token、校验 dimension/model 组合
- 把“配置错误/请求错误”和“暂时性上游错误”分开分类，400/401/403/404/422 默认不重试

**Phase should address it:** Phase 1（Provider-aware batching & validation）

### Pitfall 2: 对不可恢复错误也重试，或没有超时/取消语义

**Confidence:** HIGH

**What goes wrong:** 400/401/403 这类永久错误被统一纳入重试；反过来，真正该重试的 429/503/504 没有指数退避、也没有请求超时和取消控制。

**Why it happens:** 很多 CLI 只做“有错就重试”的粗暴策略，没有错误 taxonomy。代码库现状也已指出 embedding/reranker `fetch()` 缺少 `AbortController` 或 deadline。

**Consequences:**

- 永久错误被重复放大，制造额外费用和噪音
- 卡死请求让整个索引看起来“还在跑”，但实际已无进展
- fatal 失败后仍有并发中的请求继续返回，污染进度日志和状态机

**Warning signs:**

- fatal error 之后日志还继续刷 Embedding 进度
- 用户只能强杀 CLI，无法安全停止
- 相同 400 错误连续出现多次，且没有任何 batch 缩减或参数调整

**Prevention:**

- 建立 retry matrix：仅对 `429/5xx/网络抖动/SQLITE_BUSY(可恢复场景)` 重试
- 所有 provider 请求加 deadline、`AbortController`、全局 cancellation token
- 首个 fatal error 触发“停止调度 + 取消在途请求 + 拒绝新写入”
- 对 429/503 使用指数退避+jitter，并记录 provider request id

**Phase should address it:** Phase 1（Failure classification & cancellation）

### Pitfall 3: 失败了却显示“索引完成”

**Confidence:** HIGH

**What goes wrong:** 实际索引失败、向量未落盘、部分批次报错时，CLI 仍打印“向量索引完成”“索引完成”或成功统计。

**Why it happens:** 扫描阶段、向量阶段、FTS 阶段、汇总阶段各算各的，没有统一的最终状态机；错误被记录了，但没有提升为命令退出语义。`error.log` 已直接证明这一点：`HTTP 400` 后仍打印“向量索引完成”“索引完成”，且后续还有 Embedding 进度继续输出。

**Consequences:**

- 用户误以为索引可搜索，实际结果是旧数据或空结果
- 下游 Skill/agent 消费到“假成功”索引，进一步放大诊断难度
- 后续 repair/resume 失去可信起点

**Warning signs:**

- 日志中同一轮出现 `ERROR` 和 “索引完成”
- CLI exit code 为 0，但没有新增向量记录
- `search` 能跑，但结果明显缺块、缺文件、缺最近变更

**Prevention:**

- 设计单一 truth source：`SUCCESS | FAILED | FAILED_DIRTY | PARTIAL_RECOVERABLE`
- 汇总统计只能基于 durable commit 成功后的结果，不基于“计划处理数”
- fatal error 后禁止继续输出成功文案；进度条必须终止并标记失败
- `search/prompt-context` 在检测到 dirty index 时显式告警或拒绝继续

**Phase should address it:** Phase 0（Truthful failure semantics）

### Pitfall 4: SQLite、FTS、LanceDB 分开写，缺少原子提交边界

**Confidence:** HIGH

**What goes wrong:** 元数据、全文索引、向量记录分阶段写入；中间任一环失败就留下半完成状态。最常见的是 SQLite 已更新、LanceDB 没写完，或者向量写成了但 FTS 刷新失败。

**Why it happens:** 本地域检索项目经常同时维护多个持久化层，但只把“单表事务”当成整体事务。SQLite 官方文档明确说明：事务和错误回滚语义只覆盖 SQLite 自己，不能自动替你回滚外部存储。现有代码关切也已指出 FTS 一致性现在只是 best-effort。

**Consequences:**

- 搜索召回层彼此不一致：向量能召回，词法召回不全，或反过来
- 文件被标记为已收敛，实际局部索引损坏
- 用户只能靠全量重建，而不是定点修复

**Warning signs:**

- `vector_index_hash` 已更新，但 `chunks_fts/files_fts` 数据不全
- CLI 声称 indexed 成功，但 LanceDB 实际没有对应记录
- 一次失败后，后续增量索引不再触碰受影响文件

**Prevention:**

- 引入 staged write protocol：先写临时批次状态，再执行 SQLite/FTS/vector，最后一次性提交 batch manifest
- SQLite 内部使用显式事务或 savepoint；跨存储则用 commit barrier + compensating cleanup
- 把 “vector healthy / fts healthy / metadata healthy” 分开建模，不允许单一 hash 假装全部成功
- 提供 `repair`/`verify`，校验 record count、hash、sample query、一致性标记

**Phase should address it:** Phase 2（Atomicity, consistency & repair）

### Pitfall 5: 把空结果/失败文件错误地标为“已索引”

**Confidence:** HIGH

**What goes wrong:** AST 失败、chunk 为空、Embedding 批次失败、写入失败后，文件仍被打上“已处理/已收敛”标记，导致后续增量索引跳过它。

**Why it happens:** 项目常把“尝试过”误当成“成功写入过”。当前代码库 concern 已明确指出：某些语言 AST 失败会产生 `0 chunks`，但仍可能被视为 settled；这类 bug 一旦进入增量链路就很难自愈。

**Consequences:**

- 文件永久从检索结果中消失
- 用户只能通过修改文件、删库重建、或手工清 metadata 才能恢复
- 数据质量问题被错误地伪装成“增量优化”

**Warning signs:**

- 某些文件永远搜不到，但扫描里并未显示错误
- 失败文件数量与实际缺失文件数量对不上
- reindex 后问题文件始终不再进入处理队列

**Prevention:**

- 把 file state 明确拆成：`pending / chunk_failed / embed_failed / write_failed / indexed`
- 只有在 chunk、vector、fts、metadata 全部满足成功条件时，才更新 convergence marker
- 对 `0 chunks` 设为异常态或 degraded fallback，不允许静默成功
- 增量索引优先重试非 `indexed` 状态文件

**Phase should address it:** Phase 2（State model correctness）

### Pitfall 6: 没有可恢复的恢复点，只能“重跑碰碰运气”

**Confidence:** MEDIUM-HIGH

**What goes wrong:** 索引中断后，没有批次级 checkpoint、dirty marker、失败清单、resume token，用户只能整仓重跑，或者在不确定状态下继续增量索引。

**Why it happens:** 很多 CLI 先做 happy path，等出问题时才发现没有 recovery ledger。对于本地工具尤其常见：因为“都在本机”而低估 crash recovery 的必要性。

**Consequences:**

- 大仓库反复消耗 API 配额
- 同一批次失败无法精确定位和复算
- dirty 状态越积越多，最后只能删库重建

**Warning signs:**

- 用户的常见自救动作是 `rm -rf ~/.contextweaver/...`
- 索引失败后没有“可恢复/需清理/可重试”提示
- 无法回答“哪些文件已 durable 写入、哪些没有”

**Prevention:**

- 为每个 batch 记录 manifest：输入文件、chunk ids、provider request fingerprint、预期写入数、提交结果
- 失败时写入 durable dirty marker；下次启动先做 recovery check
- 支持 `resume-last-index` 或等价恢复流程：只重跑未提交批次
- 提供 `verify-index` / `repair-index`，不要把恢复责任留给用户手工删目录

**Phase should address it:** Phase 3（Recovery & operator tooling）

## Moderate Pitfalls

### Pitfall 7: 模型/维度漂移后仍复用旧索引

**Confidence:** HIGH

**What goes wrong:** 用户切换 embedding model、provider 或输出维度后，CLI 继续把新向量写进旧表或旧索引目录。

**Why it happens:** 本地项目常只把“项目路径”当索引 identity，没有把 `provider + model + dimensions + tokenizer/chunker version` 纳入 schema version。

**Consequences:**

- 混入不同维度或不同语义空间的向量，召回质量直接失真
- 查询向量与历史文档向量不兼容，轻则质量下滑，重则写入/搜索直接报错

**Warning signs:**

- 更换模型后搜索结果突然大幅漂移
- 某些批次写入时报 dimension mismatch
- 配置变更后没有触发任何迁移或重建提示

**Prevention:**

- 索引元数据必须绑定 provider/model/dimension/chunker/schema 版本
- 不兼容变更默认要求新建索引或完整重建
- 启动阶段先做 compatibility check，再允许 search/index

**Phase should address it:** Phase 1（Compatibility validation）

### Pitfall 8: 诊断信息过粗，导致“能报错但不能排障”

**Confidence:** HIGH

**What goes wrong:** 日志只给 HTTP status，不给 provider 响应体、request id、模型名、维度、batch 大小、token 估算、文件样本、重试分类。

**Why it happens:** 团队担心泄露敏感信息，于是把一切都抹平；结果用户连最基本的自助诊断都做不了。

**Consequences:**

- issue 报告质量低，维护者要来回追问
- 用户误判为“随机失败”而不是“固定配置错误”
- 很难做自动化恢复，因为系统自己也不知道失败类型

**Warning signs:**

- 典型报错只有 `HTTP 400`
- 用户需要翻源码才能猜是 batch size、权限还是模型不支持
- 社区 issue 大量出现“同样报错，不知道怎么办”

**Prevention:**

- 记录可安全分享的诊断字段：provider、model、dimension、batch count、estimated tokens、status code、provider message、request id
- 默认脱敏：不记录 API key、不打印完整文本，只打印 chunk/file 指纹和样本路径
- 错误输出给出操作建议：`reduce batch size`、`check dimensions`、`rebuild index`、`resume with repair`

**Phase should address it:** Phase 0（Diagnostics & operator UX）

## Minor Pitfalls

### Pitfall 9: 把“清理失效索引”当作恢复机制

**Confidence:** MEDIUM

**What goes wrong:** 产品只提供清理命令，没有 verify/repair/resume。长期来看，用户把“删库重建”当唯一恢复路径。

**Prevention:** 先补 health check、dirty marker、repair，再把 clean 保留为最后手段，而不是主要运维动作。

**Phase should address it:** Phase 3（Recovery tooling）

## Phase-Specific Warnings

| Phase Topic               | Likely Pitfall                                     | Mitigation                                                                 |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| Phase 0: 真失败语义与诊断 | 出错后仍显示成功；错误只有 HTTP 状态码             | 统一最终状态机；失败即非 0 退出；补 provider message/request id/batch 指纹 |
| Phase 1: Provider 适配层  | 固定 batch/concurrency/dimension 跨 provider 复用  | 建 capability registry + preflight validation + compatibility check        |
| Phase 1: 重试与取消       | 对 400 重试、对 hung request 不超时                | retry matrix + deadline + cancellation token + stop scheduling on fatal    |
| Phase 2: 多存储一致性     | SQLite/FTS/LanceDB 半写入后互相漂移                | staged write protocol + batch manifest + repairable health markers         |
| Phase 2: 文件状态机       | `0 chunks` 或 embedding 失败仍被视为 indexed       | 引入细粒度 file state，只有 durable success 才标记 indexed                 |
| Phase 3: 恢复与运维       | 失败后只能全量重跑或手工删目录                     | dirty marker + resume + verify/repair CLI                                  |
| Phase 4: 测试与混沌验证   | 并发中的 fatal error、部分写入、SQLITE_BUSY 没覆盖 | 增加 provider mock、fault injection、crash-recovery、idempotency 测试      |

## Sources

- 内部项目上下文：`.planning/PROJECT.md` — HIGH
- 内部代码库关切：`.planning/codebase/CONCERNS.md` — HIGH
- 真实失败日志：`error.log` — HIGH
- 项目产品/架构说明：`README.md` — HIGH
- Cohere Embed API v2（官方）：https://docs.cohere.com/v2/reference/embed — HIGH
  - 关键验证点：`texts/inputs` 每次调用最多 `96`；存在 400/422/429/503/504；支持 truncate 与 output dimension
- Voyage AI Embeddings API（官方）：https://docs.voyageai.com/reference/embeddings-api — MEDIUM
  - 关键用途：验证“provider 间请求契约不同，不能把 batch/shape 写死”
- SQLite Transaction Control（官方）：https://www.sqlite.org/lang_transaction.html — HIGH
  - 关键验证点：事务语义只覆盖 SQLite；错误与 `SQLITE_BUSY`/rollback 行为需要应用层显式处理
