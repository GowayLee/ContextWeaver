# Phase 3: Index Visibility - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

让 `index` 的执行过程对用户可观测、可追溯，并让最终摘要和真实结果严格一致。范围包含主阶段进度展示、跳过文件统计、成功/失败收尾摘要，以及关键边界场景的用户可见文案；不扩展新命令、不提前引入恢复能力，也不处理跨存储一致性语义。

</domain>

<decisions>
## Implementation Decisions

### 阶段进度展示

- **D-01:** `index` 的主过程采用“阶段名 + 关键计数”的展示方式，而不是只给统一百分比或更细碎的逐动作日志。
- **D-02:** 进度展示应围绕 roadmap 中的主阶段组织，至少让用户能看见 `crawl`、`process`、`chunk/embed`、`persist` 这些阶段切换；其中耗时阶段可以附带必要计数。
- **D-03:** embedding 阶段保留批次级关键计数，用于说明当前进展；但总体仍以阶段语义优先，而不是让批次数字喧宾夺主。

### 跳过原因统计

- **D-04:** 最终输出不能只给 `skipped` 总数，必须同时给出按原因分桶的统计分布。
- **D-05:** 跳过原因分桶应复用现有处理链路已经能识别的原因来源，例如大文件、二进制文件、JSON 锁文件/不应索引文件、无可索引 chunk、读取/处理失败等，而不是重新发明一套与现状脱节的分类。
- **D-06:** Phase 3 的默认终端输出以“总数 + 原因分桶”为准，不要求默认列出每个被跳过文件的完整路径清单。

### 最终摘要形态

- **D-07:** 成功和失败采用两套明确分离的收尾模板，不能为了格式统一复用同一套摘要而引入误读风险。
- **D-08:** 成功路径继续输出完整统计摘要；失败路径输出失败结论、失败阶段，以及到失败时为止可安全表达的已知统计，不得复用任何成功结论文案。
- **D-09:** 最终摘要必须与真实退出码和索引结果完全一致，延续 Phase 1 的“失败不说成成功”和 Phase 2 的“失败诊断在 CLI 边界统一呈现”。

### 边界场景文案

- **D-10:** 对“无可索引变更”“仅同步删除/自愈”“在 embedding 之前失败”等边界场景，CLI 要显式说明实际发生了什么，而不是让用户从通用模板自行猜测。
- **D-11:** 边界场景文案优先使用专门结论，而不是勉强套用主流程成功模板或只把细节藏进 debug 日志。

### the agent's Discretion

- `chunk` 与 `embed` 在最终用户文案里是合并成一个阶段标签，还是拆成两个连续标签，只要仍满足 roadmap 的主阶段可见性要求。
- 成功/失败摘要里的字段顺序、排版和是否分多行展示。
- 跳过原因桶的精确命名和归并规则，只要能稳定映射现有处理原因并保持用户可理解。
- 边界场景文案的具体措辞与是否补充轻量提示语，只要不引入新的恢复语义或误导性成功语义。

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and acceptance

- `.planning/ROADMAP.md` — Phase 3 的目标、success criteria，以及主阶段可见性要求（crawl/process/chunk/embed/persist）
- `.planning/REQUIREMENTS.md` — `VIS-01`、`VIS-02`、`VIS-03` 的正式约束与本轮 out-of-scope 边界
- `.planning/PROJECT.md` — 项目级约束：保持现有 CLI 形态、失败语义诚实、诊断安全可分享
- `.planning/STATE.md` — 需要承接的既有决策，尤其是 Phase 1/2 已锁定的 fail-fast 与顶层 diagnostics 语义

### Prior phase carry-forward

- `.planning/phases/01-fail-fast-exit/01-CONTEXT.md` — 失败后不得继续打印成功收尾、失败阶段结论必须真实
- `.planning/phases/02-provider-diagnostics/02-CONTEXT.md` — 失败诊断由 CLI 顶层统一渲染，并保留 provider 原始语义

### Codebase guidance

- `.planning/codebase/CONCERNS.md` — 当前 indexing/visibility 相关脆弱点，尤其是 FTS 一致性和测试覆盖空洞
- `.planning/codebase/STRUCTURE.md` — `src/index.ts`、`src/cli.ts`、`src/scanner/index.ts`、`src/indexer/index.ts` 的职责边界
- `.planning/codebase/TESTING.md` — Vitest 测试组织和现有 CLI/integration 测试模式

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/scanner/index.ts`：已经集中串起扫描、统计、向量阶段进度和最终 `onProgress` 完成信号，是 Phase 3 最直接的主阶段可见性落点。
- `src/index.ts`：`runIndexCliCommand()` 已统一控制成功摘要与失败出口，适合承接成功/失败双模板。
- `src/scanner/processor.ts`：`ProcessResult` 已带 `status` 和 `error`，现有跳过原因可以在这里归并为用户可见分桶。
- `src/indexer/index.ts`：向量阶段已经有批处理和进度回调，可复用来表达 embedding 阶段的关键计数。
- `tests/indexCli.test.ts`：已有成功/失败摘要契约测试，是补 Phase 3 回归测试的首选基座。

### Established Patterns

- CLI 顶层边界负责最终人类可读输出和退出码，深层模块更偏向抛错并上传阶段上下文。
- 当前进度链路是 `src/api/embedding.ts` / `src/indexer/index.ts` -> `src/scanner/index.ts` -> `src/index.ts`，Phase 3 应沿这条现有链路补可见性，而不是重做新输出通道。
- 统计信息目前在 scanner 层按状态汇总，但跳过原因尚未结构化沉淀；这意味着 Phase 3 更像“补统计语义和渲染契约”，而不是重建扫描流程。

### Integration Points

- `src/cli.ts`：`runIndexCommand()` 负责把 scan 结果交给 CLI 边界，若要扩充最终摘要字段，这里是重要桥接点。
- `src/scanner/index.ts`：主阶段切换、边界场景进度、最终完成信号和原始状态统计都在这里发生。
- `src/scanner/processor.ts`：需要把跳过原因稳定地转成可汇总类别。
- `src/index.ts`：成功/失败双模板和最终用户可见契约需要在这里落地。
- `tests/indexCli.test.ts`：应补 success/failure/edge-case 输出断言，防止以后再次出现“过程说不清”或“失败像成功”的回归。

</code_context>

<specifics>
## Specific Ideas

- 进度信息优先表达“现在处在哪个主阶段”，不是只展示一个抽象百分比。
- 跳过统计以原因分桶为默认输出，不把逐文件清单作为默认终端负担。
- 边界场景要直接说清楚发生了什么，避免用户自己从日志猜语义。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 03-index-visibility_
_Context gathered: 2026-04-01_
