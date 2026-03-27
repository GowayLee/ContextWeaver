# Architecture Patterns

**Domain:** 本地代码语义检索 CLI（远程 Embedding Provider + 本地 SQLite/LanceDB）
**Researched:** 2026-03-31
**Overall confidence:** HIGH

## Recommended Architecture

可靠的本地代码检索/索引系统，通常不是“扫描 → 调 embedding → 直接写两个库”这么短，而是**显式分层的索引作业系统**：`扫描快照`、`内容规范化/切块`、`远程向量化`、`本地暂存写入`、`原子发布`、`检索读取`、`观测与恢复`。真正决定可靠性的，不是召回算法，而是**失败发生时谁可以回滚、谁只能补偿、什么时候算“发布成功”**。

对 ContextWeaver 这类 brownfield CLI，我建议把 **SQLite 视为控制面和发布真相源（control plane / source of truth）**，把 **LanceDB 视为已发布向量读模型（derived read model）**。原因很简单：SQLite 有明确事务边界；LanceDB 适合向量读写、索引和版本化，但它与 SQLite 之间没有跨存储事务。既然做不到真正的双库原子提交，就不要假装有，而要改成 **run-based publish + recovery**。

进一步说，索引过程应以 **index run** 为中心，而不是以“当前文件是否处理完”这种零散状态为中心。每次执行 `contextweaver index` 都先创建一个 `run_id`，扫描得到不可变 manifest，再按批次处理 chunk 与 embedding。只有当：1）SQLite 中该 run 的文件/块元数据已 durable；2）LanceDB 中该 run 的向量数据已 durable；3）检索侧已切换到这个 published run，才能把 CLI 结果视为成功。

这意味着检索侧也要遵守发布语义：**搜索永远只读最后一个 published run**，绝不读“正在写入中”的 run。这样即使 embedding provider 半路报错、进程崩溃、LanceDB 索引尚未重建，用户看到的仍然是上一个健康版本，而不是半成品。

```text
Index Command
  ↓
Run Coordinator
  ↓
Manifest Builder (repo snapshot)
  ↓
Chunk/Normalize Pipeline
  ↓
Embedding Gateway (timeouts / retry / classify)
  ↓
Local Staging
  ├─ SQLite: files / chunks / run ledger / health markers
  └─ LanceDB: vectors for run_id (staged namespace/table/version)
  ↓
Publish Switch
  ├─ mark run published in SQLite
  └─ refresh search readers / clear caches / reopen latest table
  ↓
Search Runtime reads only published run
```

## Component Boundaries

| Component                  | Responsibility                                                     | Communicates With                                 |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| CLI / Run Coordinator      | 创建 `run_id`、获取项目锁、汇总结果、决定退出码                    | Manifest Builder、Run Ledger、Observability       |
| Manifest Builder           | 基于一次扫描快照产出文件清单、变更集、删除集                       | Chunk Pipeline、SQLite                            |
| Chunk / Normalize Pipeline | 读取文件、语言识别、AST/文本 fallback、产出 chunk                  | Embedding Gateway、SQLite                         |
| Embedding Gateway          | 批量调用远程 provider，做 timeout、retry、错误分类、batch 限制诊断 | Chunk Pipeline、Vector Staging、Observability     |
| SQLite Control Plane       | 保存 `index_runs`、files、chunks、FTS、健康标记、published pointer | 全部索引组件、Search Runtime                      |
| LanceDB Vector Staging     | 保存某个 `run_id` 的 chunk vectors、向量索引状态、版本             | Embedding Gateway、Publish Switch、Search Runtime |
| Publish Switch             | 在双存储 durable 后切换“当前生效 run”，并触发 reader refresh       | SQLite、LanceDB、Search Runtime                   |
| Search Runtime             | 只读取 published run，做 hybrid recall / expand / pack             | SQLite、LanceDB                                   |
| Recovery / Cleanup Worker  | 恢复失败 run、清理孤儿数据、重建 FTS / 向量索引                    | SQLite、LanceDB                                   |
| Observability Layer        | span、metrics、结构化日志、run 级诊断摘要                          | 所有组件                                          |

## Data Flow

### Indexing Flow（显式方向）

1. **CLI → Run Ledger**：创建 `run_id`，状态设为 `running`，记录配置快照、provider、模型、起始时间。
2. **Run Coordinator → Manifest Builder**：在项目锁内扫描仓库，产出本次 immutable manifest。
3. **Manifest Builder → Chunk Pipeline**：仅把本次 manifest 中的 changed/new/deleted 文件交给后续步骤。
4. **Chunk Pipeline → SQLite**：先写入文件元数据、chunk 元数据、删除 tombstone、待向量化状态；这一段应尽量放在 SQLite 事务里。
5. **Chunk Pipeline → Embedding Gateway**：按 batch 拉取待向量化 chunk，附带 `run_id` / `chunk_id` / provider metadata。
6. **Embedding Gateway → LanceDB Vector Staging**：embedding 成功后，把 vectors 写入当前 run 的 staged 数据集；失败则只更新 run/batch 状态，不发布。
7. **Vector Staging / FTS Sync → SQLite**：回写该 batch 的完成状态、FTS 健康状态、失败分类、统计信息。
8. **Run Coordinator → Publish Switch**：仅当所有 required batch 都成功且本地一致性检查通过，才把 `published_run_id` 切换到新 run。
9. **Publish Switch → Search Runtime**：显式 refresh/reopen 读者，失效缓存，之后新查询读取新 run。

### Retrieval Flow（显式方向）

1. **Search Request → Search Runtime**：读取 `published_run_id`。
2. **Search Runtime → SQLite**：读取 files/chunks/FTS 元数据与 chunk 内容。
3. **Search Runtime → LanceDB**：只查询 `published_run_id` 对应向量数据。
4. **Search Runtime → Expansion / Packing**：图扩展、上下文打包。
5. **Search Runtime → CLI / Skill**：输出结果，并记录 query-side metrics/logs。

关键约束：**search 永远不能读取 `running` / `failed` / `staged` run。**

## Failure Boundaries and Transaction Semantics

### 1. 远程 Embedding 调用是硬失败边界，不属于本地事务

远程 provider 调用无法纳入 SQLite/LanceDB 的本地事务，因此它必须被当作**外部副作用边界**。正确语义不是“失败了再看看还能不能继续”，而是：

- provider 返回 4xx（例如 batch 过大、参数非法）→ **立即终止该 run**；
- provider 返回 5xx / 超时 / 网络错误 → 在预算内 retry，超预算后终止该 run；
- 终止后 run 状态必须是 `failed`，CLI 退出码非 0，且不得打印“索引完成”。

Node.js 已提供 `AbortController` / `AbortSignal.timeout()`，所以每个请求都应有明确 deadline，而不是只靠 provider 自己超时。[HIGH]

### 2. SQLite 事务只负责“本地控制面一致性”

SQLite 适合承担以下原子单元：

- `index_runs` 状态迁移；
- file/chunk/FTS 元数据更新；
- publish pointer 切换；
- 失败批次/重试计数/诊断信息落盘。

SQLite 官方文档明确：事务有清晰的 `BEGIN/COMMIT/ROLLBACK` 语义；同一时刻只有一个写事务；WAL 模式下读写并发更好，但应用仍应准备处理 `SQLITE_BUSY` 与 checkpoint 行为。[HIGH] 对本地 CLI，这反而说明**单项目单写者**是正确结构，不应同时跑多个 index writer。

### 3. LanceDB 与 SQLite 之间用“发布切换”而非伪双写事务

LanceDB 有版本化、`checkoutLatest`、一致性刷新间隔等能力，但默认并不会自动对跨进程写入做“每次读取都刷新”。官方文档明确：默认 unset 时**不会自动 cross-process refresh**；要么显式 `checkoutLatest()`，要么把 `readConsistencyInterval` 设为 0。[HIGH]

所以推荐语义是：

- `run_id` 的向量先写到 staged run；
- SQLite 中记录该 run 的 vector/fts health；
- 只有当 staged run 完整后，才在 SQLite 内事务性更新 `published_run_id`；
- publish 完成后，search 侧必须 reopen/refresh Lance table，并清理 `GraphExpander` 一类缓存。

这比“边写边查最新数据”可靠得多。

### 4. FTS 与向量索引要分开记健康度，不能共用一个 convergence bit

现有代码库的已知问题之一，就是 FTS 失败后仍可能把向量状态视为“已收敛”。对可靠系统来说，至少要分开：

- `content_state`
- `embedding_state`
- `vector_state`
- `fts_state`
- `publish_state`

只有 `publish_state = published` 时，run 才能对检索生效。否则最多是 `staged` 或 `failed`。

### 5. 删除必须是 run-aware tombstone，不是即时物理删除

删除文件时，先在 SQLite 里写 tombstone，并在当前 run 的向量/FTS 视图中把该文件标为不可见；等发布成功后再做物理清理。这样进程中断时不会出现“旧 run 被删掉，新 run 又没发布”的空窗。

### 6. 恢复策略应该是“resume or discard run”，不是模糊自愈

推荐为每个 run 记录：

- manifest hash
- provider/model/config snapshot
- batch cursor
- failed batch ids
- last durable step

恢复时只做两类动作：

1. **resume**：同配置下从未完成 batch 继续；
2. **discard**：放弃整个 failed run，保留上一个 published run。

不要在没有 run ledger 的前提下做“隐式补写”，那最容易制造半完成状态。

## Patterns to Follow

### Pattern 1: Run Ledger First

**What:** 先建 `index_runs`，后做任何扫描/写入。  
**When:** 所有 index 命令。  
**Why:** 没有 run ledger，就没有可靠的失败恢复和真实统计。

### Pattern 2: Manifest Before Mutation

**What:** 先确定本次 repo 快照和处理范围，再进入写阶段。  
**When:** 任何增量索引。  
**Why:** 避免扫描和写入交错，导致“本次到底索引了什么”不可复现。

### Pattern 3: Stage Then Publish

**What:** 先写 staged run，验证后再切换 `published_run_id`。  
**When:** 涉及 SQLite + LanceDB 双存储。  
**Why:** 这是本地多存储系统最实用的伪两阶段提交。

### Pattern 4: Search Reads Published Snapshot Only

**What:** 检索只读已发布快照。  
**When:** 所有 search / prompt-context / skill 调用。  
**Why:** 用户宁可看到旧但一致的数据，也不要看到新但半坏的数据。

### Pattern 5: Instrument by Run, Batch, Provider

**What:** 日志、trace、metrics 都带 `project_id`、`run_id`、`batch_id`、`provider`。  
**When:** 所有网络调用和持久化边界。  
**Why:** 没有这些维度，失败定位会退化成纯文本猜谜。

## Anti-Patterns to Avoid

### Anti-Pattern 1: 边 embedding 边宣告成功

**Why bad:** 最终用户看到“索引完成”，但实际上 run 已失败或未发布。  
**Instead:** 只有 publish 成功后才输出完成统计。

### Anti-Pattern 2: 用单个 `vector_index_hash` 代表全部健康状态

**Why bad:** 内容、FTS、向量、发布状态会被混为一谈。  
**Instead:** 分离状态机，并把 published 作为唯一对外生效状态。

### Anti-Pattern 3: Search 直接读“最新写入数据”

**Why bad:** LanceDB 默认不保证每次跨进程读都自动刷新，缓存和 singleton 还会放大脏读问题。  
**Instead:** 读取 published run，并在 publish 后显式 refresh/reopen。

### Anti-Pattern 4: 没有 request deadline 的 provider 调用

**Why bad:** 会把“远端挂住”伪装成“本地程序还在努力”。  
**Instead:** 每请求 timeout + run 级总预算 + 失败分类。

### Anti-Pattern 5: 失败后局部补写但不记录 batch ledger

**Why bad:** 无法判断哪些向量已 durable、哪些只是打印过日志。  
**Instead:** 所有批次状态都落盘：pending / running / succeeded / failed / abandoned。

## Observability Expectations

可靠系统至少要有三层可观测性：

1. **结构化日志**：每条日志带 `run_id`、阶段、文件数、batch 大小、provider HTTP status、可分享的错误摘要；敏感 token 必须脱敏。
2. **指标**：
   - `index_run_duration_seconds`
   - `embedding_batch_latency_seconds`
   - `embedding_batch_failures_total`
   - `sqlite_commit_failures_total`
   - `published_run_age_seconds`
   - `unpublished_chunks_total`
   - `fts_sync_failures_total`
   - `vector_staging_rows`
3. **trace/span**：至少覆盖 `scan`、`chunk`、`embed_batch`、`sqlite_txn`、`lancedb_write`、`publish_switch`。

OpenTelemetry 官方建议把 traces、metrics、logs 作为统一 signals；Collector 文档也明确推荐监控队列容量、队列长度、发送失败与数据流量。[HIGH] 对本项目虽然不一定要上完整 Collector，但**指标命名和 span 边界可以直接沿用这套思路**。

## Scalability Considerations

| Concern              | At 100 users / small repos | At 10K users / many repos             | At 1M queries / large monorepos               |
| -------------------- | -------------------------- | ------------------------------------- | --------------------------------------------- |
| Index concurrency    | 单项目单 writer 足够       | 需要项目级锁与作业排队                | 需要独立 worker 进程与调度层                  |
| Embedding throughput | 手动 batch + retry 即可    | 需要 provider 限流、deadlines、resume | 需要异步 job queue / 多 provider 策略         |
| SQLite contention    | WAL + 单 writer 即可       | checkpoint / BUSY 处理重要            | 可能要拆 control DB 或按项目分库              |
| LanceDB freshness    | publish 后 reopen 即可     | 需标准化 refresh 机制                 | 需 run-aware reader pool / cache invalidation |
| Index maintenance    | 手动 optimize 可接受       | 需定期 reindex/cleanup                | 需后台 maintenance 与容量监控                 |

## Suggested Build Order for Reliability Work

1. **Truthful run status and exit semantics**
   - 先修“失败还显示成功”问题。
   - 建 `index_runs` / batch ledger / non-zero exit code。
   - 这是所有后续恢复能力的地基。

2. **Publish boundary and search snapshot isolation**
   - 引入 `published_run_id`。
   - search / prompt-context 只读 published run。
   - publish 后显式 refresh LanceDB reader 与搜索缓存。

3. **State decomposition: content / embedding / vector / fts / publish**
   - 去掉单 bit 收敛假象。
   - 允许精确发现“向量好了但 FTS 没好”这类半失败。

4. **Provider reliability envelope**
   - 给 embedding 请求加 timeout、abort、retry budget、错误分类、batch-size 诊断。
   - 这是当前用户最直接感知的问题面。

5. **Recovery and cleanup**
   - 支持 resume/discard failed run。
   - 增加 orphan data 清理、Lance optimize/reindex、FTS rebuild。

6. **Deep observability and test harness**
   - 增加 OTel-style spans/metrics。
   - 做 provider 4xx/5xx、超时、SQLite BUSY、Lance write failure、publish crash 的集成测试。

这个顺序的核心逻辑是：**先让系统说真话，再让系统不暴露半成品，再让系统能恢复，最后再做优化。**

## Sources

- SQLite Transactions — https://www.sqlite.org/lang_transaction.html (HIGH)
- SQLite WAL — https://www.sqlite.org/wal.html (HIGH)
- LanceDB Consistency — https://docs.lancedb.com/tables/consistency (HIGH)
- LanceDB Versioning — https://docs.lancedb.com/tables/versioning (HIGH)
- LanceDB Table Updates / Merge Insert — https://docs.lancedb.com/tables/update (HIGH)
- LanceDB Reindexing / Optimize — https://docs.lancedb.com/indexing/reindexing (HIGH)
- LanceDB basic docs index / table operations — https://docs.lancedb.com/llms.txt , https://lancedb.com/docs/tables/ (HIGH)
- Node.js AbortController / AbortSignal timeout — https://nodejs.org/api/globals.html#class-abortcontroller (HIGH)
- OpenTelemetry Collector Resiliency — https://opentelemetry.io/docs/collector/resiliency/ (HIGH)
- OpenTelemetry Collector Internal Telemetry — https://opentelemetry.io/docs/collector/internal-telemetry/ (HIGH)
