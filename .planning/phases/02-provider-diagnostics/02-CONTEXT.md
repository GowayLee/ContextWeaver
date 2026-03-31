# Phase 2: Provider Diagnostics - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

在不改变现有 `index` 命令、fail-fast 语义和产品形态的前提下，增强 embedding 失败路径的 provider 诊断能力，让用户在一次失败输出里就能看清 provider 侧错误、请求上下文和可排查线索。预检能力、新命令、恢复流程和跨阶段状态一致性不属于本阶段。

</domain>

<decisions>
## Implementation Decisions

### 诊断输出结构

- **D-01:** CLI 失败输出采用双层结构：先输出一句失败结论，再输出多行诊断块；不把全部信息压成单行，也不要求用户额外查日志才能拿到核心诊断。
- **D-02:** 诊断块面向终端直接阅读，后续 planner/researcher 应优先围绕 CLI 默认输出设计与测试，而不是只补结构化日志字段。

### 错误分类策略

- **D-03:** 诊断信息优先保留 provider 原始 `type`、`code`、`status` 和 message，不做重型强映射。
- **D-04:** 为满足 `DIAG-03`，仅在能够明确判断时补充标准类别（如认证、限流、batch-too-large、维度不匹配、超时、网络、响应格式不兼容）；无法可靠判断时保留为 `unknown` 或等价兜底类别。

### 安全诊断摘要

- **D-05:** 失败时默认显示扩展安全诊断摘要，而不是只给最小摘要或只放 debug 日志。
- **D-06:** 默认诊断块应包含安全字段：failing stage、provider/endpoint host、endpoint path、model、batch size、dimensions、HTTP status、provider `error.type/code`、请求条目数，以及足以支持排障的其他非敏感上下文。
- **D-07:** 任何默认输出都不得暴露 API key、token、原始 Authorization header 或其他敏感凭据。

### the agent's Discretion

- 标准类别命名的精确枚举值、显示顺序和 unknown 兜底文案由后续 research/planning 决定，但必须符合 `DIAG-03`。
- 多行诊断块的具体排版、缩进和测试断言粒度由后续实现决定，但必须保持 CLI 可读性。

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements

- `.planning/ROADMAP.md` — Phase 2 的目标、成功标准和阶段边界
- `.planning/REQUIREMENTS.md` — `DIAG-01`、`DIAG-02`、`DIAG-03` 的正式约束，以及本里程碑 out-of-scope 边界
- `.planning/PROJECT.md` — 项目级非协商约束：保留本地 CLI 形态、fail-fast 语义、诊断信息必须安全可分享

### Prior phase carry-forward

- `.planning/STATE.md` — Phase 1 已落地的 fail-fast 决策、当前阶段焦点和跨阶段连续性说明

### Codebase concerns informing this phase

- `.planning/codebase/CONCERNS.md` — 已识别的 API transport、索引异常路径和测试覆盖薄弱点，尤其是 `src/api/embedding.ts`、`src/indexer/index.ts`、`src/scanner/index.ts`
- `.planning/codebase/CONVENTIONS.md` — 错误处理、日志、测试和模块边界的仓库约定

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/api/embedding.ts`: 已有 `EmbeddingFatalError`、`EmbeddingSession`、`RateLimitController` 和 `EmbeddingClient`，是补充 provider diagnostics 的第一落点
- `src/indexer/index.ts`: 已有 embedding 阶段统一捕获与重新抛错逻辑，可作为诊断对象从 API 层传递到 CLI 边界的中间节点
- `src/index.ts`: `runIndexCliCommand()` 已经统一控制成功/失败终端输出，适合承接双层失败展示
- `src/config.ts`: `getEmbeddingConfig()` 已集中暴露 `baseUrl`、`model`、`dimensions`、`maxConcurrency`，可复用来生成安全请求摘要

### Established Patterns

- CLI 边界负责 `process.exit(1)` 和最终人类可读输出，底层模块更偏向抛显式错误对象
- 仓库偏好 `logger.info/warn/error` 结构化日志，但本阶段用户已明确默认 CLI 也要直接可读
- 现有错误链路是 `src/api/embedding.ts` -> `src/indexer/index.ts` -> `src/scanner/index.ts` -> `src/index.ts`，适合沿链携带更丰富但安全的诊断元信息

### Integration Points

- API transport 层需要产出 provider 诊断元数据：`src/api/embedding.ts`
- 阶段级包装和错误归一入口位于 `src/indexer/index.ts` 与 `src/scanner/index.ts`
- 最终终端展示和失败摘要在 `src/index.ts` 的 `runIndexCliCommand()`
- 回归测试主要应补在 `tests/api/embedding.test.ts`、`tests/indexer/index.test.ts`、`tests/indexCli.test.ts`

</code_context>

<specifics>
## Specific Ideas

- 默认输出偏向工程排障优先，而不是极简用户提示
- 保留 provider 原话很重要，不希望 CLI 只输出“被框架翻译过”的抽象类别
- 扩展安全字段默认可见，不要求用户切到 debug 模式才看到 endpoint path 或 provider error code

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 02-provider-diagnostics_
_Context gathered: 2026-04-01_
