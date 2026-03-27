# Technology Stack

**Project:** ContextWeaver
**Researched:** 2026-03-31
**Scope:** 2025 标准本地优先代码语义检索 CLI（混合搜索 + 本地索引 + 外部 Embedding/Rerank Provider）

## Recommended Stack

### Core Framework

| Technology                      | Version                                        | Purpose            | Why                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                         | **22 LTS minimum, 24 LTS primary test target** | CLI runtime        | 2025/2026 生产标准应跟随偶数 LTS；Node 24 已是 Active LTS，Node 22 仍是稳定基线。对 `better-sqlite3`、Tree-sitter、LanceDB 这类原生依赖来说，缩窄到 22+/24 可显著降低兼容面。 **Confidence: HIGH** |
| TypeScript                      | **5.9.x**                                      | 主语言与类型边界   | 代码库已经是 TS-first；后续需要把 provider 错误、索引状态机、诊断事件做成可判别联合类型。 **Confidence: HIGH**                                                                                     |
| `cac`                           | 6.x                                            | CLI 命令层         | 现有产品已稳定使用，继续保留即可；这类工具不是瓶颈，不值得迁移。 **Confidence: MEDIUM**                                                                                                            |
| Tree-sitter + language grammars | current 0.23-0.26 line                         | 语义切分、符号边界 | 代码检索 CLI 在 2025 依然以 AST-aware chunking 为正解；正则切分会直接拉低召回和上下文边界质量。 **Confidence: HIGH**                                                                               |

### Database

| Technology                       | Version                                              | Purpose                               | Why                                                                                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite + `better-sqlite3`        | SQLite **3.51.3+** via current `better-sqlite3` 12.x | 元数据、文件内容、索引状态、FTS       | 本地 CLI 的事实标准仍是 SQLite。`better-sqlite3` 继续是 Node 里最稳的同步封装，支持事务、WAL、worker thread。**必须跟进 SQLite 3.51.3+ 或带 backport 修复的版本**，因为 SQLite 官方 2026-03 公布了 WAL-reset bug 修复，影响多连接/并发 checkpoint 场景。 **Confidence: HIGH** |
| SQLite FTS5                      | built into SQLite                                    | 词法召回、BM25、prefix/substring 兜底 | 混合搜索里，FTS5 仍是本地桌面/CLI 产品的标准搭档：快、稳定、零额外服务依赖。 **Confidence: HIGH**                                                                                                                                                                             |
| LanceDB OSS (`@lancedb/lancedb`) | 0.22+ line, pin exact minor after validation         | 本地向量存储                          | LanceDB 仍适合本地嵌入式向量检索，支持本地路径直接连接；比把向量塞进 SQLite 扩展更符合当前代码库形态。**但它不该成为唯一真相源**，一致性必须由 SQLite manifest 驱动。 **Confidence: MEDIUM**                                                                                  |

### Infrastructure

| Technology                                      | Version             | Purpose                         | Why                                                                                                                                   |
| ----------------------------------------------- | ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Node built-in `fetch` + `AbortSignal.timeout()` | Node 22/24 built-in | Provider HTTP 调用              | 2025 标准做法是优先用 Node 自带 `fetch`，必要时再用 undici dispatcher 做连接池；不要把核心接口绑死到某一家 SDK。 **Confidence: HIGH** |
| `pino`                                          | 10.x                | 结构化日志                      | CLI 需要可分享、可过滤、可脱敏的 JSON 日志；文本拼接日志不够诊断 provider 限制问题。 **Confidence: HIGH**                             |
| `zod`                                           | 4.x                 | 配置/响应校验                   | provider 响应结构并不统一，错误对象尤其混乱；运行时校验很值。 **Confidence: HIGH**                                                    |
| `p-limit`                                       | 7.x                 | 本地 CPU/文件处理并发           | 适合文件读取、解析、chunking 并发。 **Confidence: HIGH**                                                                              |
| `p-queue`                                       | 8.x                 | Provider 请求队列、RPM/TPM 节流 | 仅靠 `p-limit` 不够表达“每秒/每分钟限流”；provider 层建议单独引入 `p-queue`。 **Confidence: MEDIUM**                                  |
| `p-retry`                                       | 6.x                 | 幂等请求重试                    | 把重试边界收敛到统一策略，避免每个 provider adapter 各写一套。 **Confidence: MEDIUM**                                                 |

### Supporting Libraries / Interfaces

| Library / Interface               | Version           | Purpose                      | When to Use                                                                                                                                                               |
| --------------------------------- | ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmbeddingProvider` (自定义接口)  | project interface | 统一 embedding provider 适配 | 必须有。暴露 `embed({ texts, model, dimensions?, signal })`，返回规范化 usage / providerError / normalizedLimitHints。                                                    |
| `RerankProvider` (自定义接口)     | project interface | 统一 rerank provider 适配    | 必须有。暴露 `rerank({ query, documents, topN, signal })`，同时返回 provider 原始 request id。                                                                            |
| `ProviderCapabilities` manifest   | project interface | 记录 provider 差异           | 必须有。包含 `maxItemsPerRequest`、`maxTokensPerRequest`、`maxDocsPerRerank`、`defaultTimeoutMs`、`retryableStatusCodes`、`supportsDimensions`、`supportsNormalization`。 |
| `RunManifest` + `GenerationState` | project interface | 索引阶段状态机               | 必须有。用于把 SQLite 与 LanceDB 的跨存储一致性从“碰运气”变成“可恢复”。                                                                                                   |

## Prescriptive Architecture Choices For This Product

### 1) 用 **SQLite 作为真相源**，LanceDB 作为派生索引

**必须这样做。**

- SQLite 保存：`project`, `files`, `chunks`, `fts rows`, `index_runs`, `provider_runs`, `vector_generations`, `diagnostics`。
- LanceDB 只保存：`chunk_id`, `generation_id`, `vector`, `search fields`。
- 查询时只读取 `committed_generation_id` 对应的向量代。

**原因：** SQLite 事务强、恢复语义清晰；LanceDB 更适合做向量近邻，但不适合承担跨阶段提交语义。把两者都当真相源，失败时最容易留下半完成状态。

### 2) Provider 层不要直接暴露 SDK；统一走 HTTP adapter

**推荐模式：**

- provider adapter 接收统一输入；
- 内部用 `fetch` 发请求；
- 所有失败都转成统一错误类型：
  - `ProviderAuthError`
  - `ProviderRateLimitError`
  - `ProviderValidationError`
  - `ProviderTimeoutError`
  - `ProviderTransientError`
  - `ProviderFatalError`

**原因：** 2025 的 embedding/rerank 市场仍然碎片化。很多供应商兼容 OpenAI 风格，但限制、错误体、header、token 计量都不一致。直接依赖 SDK 会把 CLI 核心行为绑到供应商私有抽象上。

### 3) 混合搜索仍然是：**FTS5 first-class + dense vectors + RRF + rerank**

这是本项目当前方向，也仍然是对的：

- FTS5 负责精确词、标识符、路径、异常名；
- 向量召回负责语义相关性；
- RRF 做粗融合；
- rerank 只处理已经缩小后的候选集。

**不要**把 rerank 放到大候选集上硬顶成本；本地 CLI 的体验会被 provider 延迟拖垮。

## Operational Guidance

### Provider-specific batch-size limits

**结论：不要写死一个全局 batch size。按 provider + model 维护上限。**

推荐字段：

```ts
type ProviderCapabilities = {
  maxItemsPerRequest?: number;
  maxTokensPerRequest?: number;
  maxCharsPerRequest?: number;
  maxDocsPerRerank?: number;
  defaultEmbeddingBatchSize: number;
  defaultRerankBatchSize: number;
  defaultTimeoutMs: number;
  retryableStatusCodes: number[];
};
```

**操作建议：**

- embedding 默认从 **16-32 items/batch** 起步，而不是 128/256 这种拍脑袋大批次。
- rerank 默认从 **50-100 docs/request** 起步；只有 provider 明确允许时再放大。
- Cohere 官方 v2 rerank 文档明确写了：**不建议单次请求超过 1,000 documents**。这说明 rerank 上限至少要 provider-specific，而不是产品统一常量。 **Confidence: HIGH**
- Jina 官方公开了 RPM/TPM 额度，说明有些 provider 限制重点不是 items，而是 **tokens per minute**。 **Confidence: HIGH**
- 如果 provider 返回 400/422 且 message 指向输入过大，立即把该 provider+model 的运行时上限降档，并在日志中打印“当前批次 items/tokens/bytes”。

### Timeout strategy

**标准做法：分层超时，不要一个全局 30s 走天下。**

建议默认值：

- Embedding: **20s** 单请求超时
- Rerank: **25s** 单请求超时
- Provider health probe: **5s**
- Full index run: 不设硬总超时，只设可取消 signal

**实现方式：**

- 用 `AbortSignal.timeout(ms)` 做请求级超时；
- 用 `AbortSignal.any([userSignal, timeoutSignal])` 组合用户取消和系统超时；
- 超时必须区分：`connect/headers timeout`、`body parse timeout`、`user cancelled`。

### Retry boundaries

**只重试“幂等且暂时性”的失败。**

可重试：

- `429`
- `408`
- `5xx`
- 明确的网络错误 / ECONNRESET / ETIMEDOUT

不可重试：

- `400/401/403/404/422`
- 维度不匹配
- 模型名错误
- provider 返回“input too long / too many items”

**退避建议：**

- 指数退避 + full jitter
- 最多 **3 次**
- respect `Retry-After` 优先于本地退避
- 429 不要无限降并发重试；连续失败后应**整次索引失败退出**，因为本项目当前目标是失败语义清晰，不是假成功。

### Storage consistency

**核心原则：不要假装 SQLite 与 LanceDB 之间有单事务。没有。要显式做代际提交。**

推荐写入顺序：

1. 在 SQLite 创建 `index_run`，状态 `running`
2. 为本次写入生成 `generation_id`
3. 先把 chunk metadata / pending vector manifest 写入 SQLite（事务内）
4. 调 provider 生成 embeddings
5. 写 LanceDB，记录 `generation_id`
6. 成功后再在 SQLite 事务内把该代标记为 `committed`
7. 最后切换 `project.active_generation_id = generation_id`
8. 清理旧代向量

失败时：

- 如果 4/5 失败，SQLite 里只留下 `failed run + pending generation`，**绝不打印“索引完成”**；
- 下次启动先扫描并清理 `pending/abandoned generations`；
- search 只认 `active_generation_id`，这样半完成写入天然不可见。

### SQLite settings that make sense here

推荐：

- `PRAGMA journal_mode=WAL;`
- `PRAGMA synchronous=NORMAL;`
- `PRAGMA busy_timeout=5000;`
- 成功索引后执行 `wal_checkpoint(PASSIVE)`；如果是维护/清理命令可执行 `TRUNCATE`

**原因：** WAL 对本地 CLI 的读写并发和吞吐更合适；SQLite 官方文档明确说明 WAL 通常更快、读写可并发，但 checkpoint 需要被应用显式关注。 **Confidence: HIGH**

**额外注意：**

- 不要把 SQLite 数据文件放在网络文件系统上跑 WAL；SQLite 官方明确说 WAL 不适用于 network filesystem。 **Confidence: HIGH**
- 既然官方刚披露过 WAL-reset bug，Node 端要尽量避免无意义多连接并发 checkpoint；**单进程单 writer** 是更稳的运营姿势。 **Confidence: HIGH**

## Alternatives Considered

| Category             | Recommended                     | Alternative                                       | Why Not                                                                                          |
| -------------------- | ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Local metadata DB    | SQLite + `better-sqlite3`       | Prisma + SQLite                                   | ORM 不适合 FTS、pragma、busy_timeout、checkpoint、手写恢复语义这些热路径；会让诊断和性能都变差。 |
| Vector store         | LanceDB OSS local               | Remote vector DB (Pinecone/Weaviate/Milvus Cloud) | 这会破坏本地优先产品形态，引入联网依赖、成本和更多故障面。                                       |
| Provider integration | Thin HTTP adapters              | Provider SDK as core dependency                   | SDK 更新节奏、错误抽象、兼容层都不可控；多 provider 很快会被锁死。                               |
| Full-text search     | SQLite FTS5                     | 单纯向量检索                                      | 标识符、路径、报错文案、函数名召回会明显变差。                                                   |
| Local persistence    | Disk-backed indexes             | In-memory ephemeral index                         | CLI 用户需要可重复、可恢复、可离线的索引。                                                       |
| FTS sync pattern     | 显式 rebuild / app-managed sync | FTS5 external-content + 无恢复方案                | SQLite 官方明确警告 external-content 容易失一致；没有完善 rebuild/repair 时不建议。              |

## What NOT to Use

- **不要**把 provider 限制抽象成单一 `MAX_BATCH_SIZE` 常量。
- **不要**在索引成功前输出成功统计。
- **不要**让 search 读到未提交 generation。
- **不要**把 LanceDB 与 SQLite 同时当成“当前状态真相源”。
- **不要**默认自动 fallback 到第二 provider 并吞掉原始错误；这会让诊断失真。
- **不要**为了“异步”改用较弱的 SQLite 包装层；本地 CLI 更需要确定性事务。
- **不要**在 NFS/SMB 这类网络盘上依赖 SQLite WAL。

## Installation

```bash
# Core runtime
npm install @lancedb/lancedb better-sqlite3 cac pino zod ignore fdir p-limit

# Recommended for provider operations
npm install p-queue p-retry

# Dev
npm install -D typescript vitest @types/node
```

## Confidence Assessment

| Recommendation                               | Confidence | Notes                                                                   |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| Node 22/24 LTS as runtime target             | HIGH       | 直接来自 Node 官方 release 状态                                         |
| SQLite + better-sqlite3 as local truth store | HIGH       | 官方 SQLite + better-sqlite3 README 都支持这个方向                      |
| LanceDB OSS as local vector store            | MEDIUM     | 官方文档明确支持本地路径嵌入式用法，但长期 Node 生态成熟度仍低于 SQLite |
| HTTP adapter over provider SDK               | MEDIUM     | 主要基于生态经验与 brownfield 适配需求，属于强工程建议                  |
| `p-queue` + `p-retry` provider orchestration | MEDIUM     | 业界常规做法，适配本产品问题面很好，但不是唯一解                        |
| Per-provider capability manifests            | HIGH       | 直接对应供应商限制差异和当前已知故障模式                                |

## Sources

- Node.js Releases — https://nodejs.org/en/about/previous-releases
- Node.js globals (`fetch`, `AbortSignal.timeout`, `AbortSignal.any`) — https://nodejs.org/docs/latest-v24.x/api/globals.html
- LanceDB Quickstart / local embedded usage — https://lancedb.com/docs/quickstart/
- SQLite WAL — https://sqlite.org/wal.html
- SQLite PRAGMA docs (`journal_mode`, `busy_timeout`, `optimize`) — https://sqlite.org/pragma.html
- SQLite FTS5 — https://www.sqlite.org/fts5.html
- better-sqlite3 README — https://github.com/WiseLibs/better-sqlite3
- Cohere Rerank v2 Reference — https://docs.cohere.com/v2/reference/rerank
- Jina Embeddings / Rate Limit docs — https://jina.ai/embeddings/
