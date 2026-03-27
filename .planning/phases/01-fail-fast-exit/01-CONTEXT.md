# Phase 1: Fail-fast Exit - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

让 `index` 在 embedding 在现有重试后仍失败时立即停止后续工作，并保证 CLI 退出码与最终输出和真实结果一致。这个 phase 只处理 fail-fast 与诚实退出，不扩展 provider 细分类诊断、可视化增强、跨存储一致性事务语义或恢复能力。

</domain>

<decisions>
## Implementation Decisions

### 失败判定范围

- **D-01:** 保留现有 429 和网络错误重试策略；只要 embedding 请求在现有重试后仍失败，就视为本次 `index` 的 fatal failure。
- **D-02:** Phase 1 不引入 provider/config 错误与 transient 错误的细分类 fatal 策略；更细的错误分类和诊断留到 Phase 2。

### 在途批次处理

- **D-03:** 首个 fatal embedding failure 出现后，批处理进入共享 fatal 状态；所有尚未启动的批次必须立即停止，不得继续发起新的 embedding 请求。
- **D-04:** 已经发出的请求采用 best-effort cancel；无法及时中止的晚到结果一律丢弃，不得再推进成功路径、完成日志或成功统计。

### 失败输出形态

- **D-05:** CLI 失败出口采用“失败结论 + 阶段上下文”的形式，明确失败发生在预览、扫描或向量嵌入等哪一阶段。
- **D-06:** 失败路径绝不能打印 `索引完成`、成功统计或任何会让用户误读为成功的完成文案。

### 部分进度表述

- **D-07:** 运行中的阶段进度可以保留，但最终失败输出只能说明失败阶段，不复述任何成功计数或成功摘要。
- **D-08:** Phase 1 不引入 `partial success`、`interrupted but usable` 之类语义；这类可见性与可用性定义留给后续 visibility / consistency / recovery phases。

### the agent's Discretion

- 失败阶段名的具体文案和展示位置
- fatal 信号触发后，如何最小化收敛已有进度日志的噪音
- best-effort cancel 的内部状态命名与错误包装方式，只要不改变上面的用户可见语义

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition

- `.planning/ROADMAP.md` — Phase 1 的目标、依赖关系与 success criteria
- `.planning/REQUIREMENTS.md` — SAFE-01、SAFE-02 及它们与 Phase 1 的映射

### Project constraints

- `.planning/PROJECT.md` — 本轮只修 `index` 主链路、Embedding 错误默认立即失败、恢复能力后置等项目级约束
- `.planning/STATE.md` — 当前阶段焦点与已确认的里程碑级决策

### Codebase guidance

- `.planning/codebase/CONCERNS.md` — `src/api/embedding.ts`、`src/indexer/index.ts`、`src/scanner/index.ts` 的现有脆弱点与风险
- `.planning/codebase/STRUCTURE.md` — CLI、scanner、indexer、storage 的模块边界和连接点
- `.planning/codebase/CONVENTIONS.md` — CLI 错误处理在边界退出、共享模块抛错的既有约定

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/api/embedding.ts`: 已有批处理、429/网络重试、进度追踪和并发控制；适合作为共享 fatal 信号和 best-effort cancel 的落点。
- `src/cli.ts`: `runIndexCommand()` 已集中管理索引预览、进度日志和命令级调用链，是统一失败输出契约的关键入口。
- `src/index.ts`: CLI 顶层已经负责最终成功/失败日志与退出码，是收口单一 failure verdict 的天然边界。

### Established Patterns

- CLI 边界使用抛错 + `process.exit(1)` 结束失败流程；共享 helpers 更偏向抛出可操作错误，而不是在深层直接退出。
- `scan()` 负责阶段编排，`Indexer.indexFiles()` 负责向量阶段；Phase 1 的 fail-fast 需要沿这条现有分层向上贯通，而不是重做架构。
- 进度信息通过回调链从 embedding/indexer 传到 scanner/CLI；最终失败输出必须在这条链路上抑制成功收尾文案。

### Integration Points

- `src/api/embedding.ts`: 增加 fatal 状态、未启动批次拦截、best-effort abort 和晚到结果丢弃逻辑。
- `src/indexer/index.ts`: fatal embedding failure 不再被吞成普通错误统计，而要传播到上层失败路径。
- `src/scanner/index.ts`: fatal 发生时不能再发出 `索引完成` 进度；阶段上下文需要从这里向上提供。
- `src/index.ts`: 成功摘要只允许出现在真正成功路径；失败路径输出改为失败结论 + 阶段上下文。

</code_context>

<specifics>
## Specific Ideas

- 失败时保留“卡在哪个阶段”的上下文，但不在 Phase 1 提前引入 provider-aware 细诊断。
- 不使用 `partial` / `interrupted but usable` 一类措辞，避免在状态一致性和恢复语义落地前制造误解。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 01-fail-fast-exit_
_Context gathered: 2026-04-01_
