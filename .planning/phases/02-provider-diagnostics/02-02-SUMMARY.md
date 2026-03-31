---
phase: 02-provider-diagnostics
plan: 02
subsystem: cli
tags: [cli, diagnostics, embedding, vitest, safe-output]
requires:
  - phase: 02-provider-diagnostics
    provides: typed embedding diagnostics contract from API and indexer layers
provides:
  - Dual-layer CLI failure output with a first-line verdict and multiline diagnostics block
  - Safe provider diagnostics rendering for endpoint, model, batch size, dimensions, and request count
  - Secret-safe terminal output that keeps provider raw fields visible without leaking credentials
affects: [Phase 2, Phase 3, index CLI UX]
tech-stack:
  added: []
  patterns:
    [
      cli diagnostics formatter,
      safe endpoint rendering,
      diagnostics-at-boundary output contract,
    ]
key-files:
  created: []
  modified: [tests/indexCli.test.ts, src/index.ts]
key-decisions:
  - 在 `src/index.ts` 顶层边界渲染 diagnostics，而不是在 CLI 层重新分类或重建 provider 错误语义
  - diagnostics helper 固定输出字段顺序，并对缺失值统一显示 `<unknown>` 或 `<none>`
  - Endpoint 默认只显示 `host + path`，并额外剥离 query string 作为终端输出安全兜底
patterns-established:
  - 顶层 CLI 失败输出先给 verdict，再给诊断块，避免用户从单行字符串里猜上下文
  - provider diagnostics 的默认可见范围以安全请求摘要为界，不渲染凭据、Authorization 或原始请求体
requirements-completed: [DIAG-01, DIAG-02]
duration: 2 min
completed: 2026-03-31
---

# Phase 2 Plan 02: Provider Diagnostics Summary

**`cw index` 失败时现在会先给出明确结论，再输出安全的 provider 诊断块，直接展示阶段、状态和请求摘要。**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T17:42:27Z
- **Completed:** 2026-03-31T17:43:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- 为 CLI 顶层失败出口补上回归测试，锁定双层输出结构和安全约束
- `runIndexCliCommand()` 现在会在 fatal verdict 后逐行打印 provider diagnostics
- 终端默认可见 endpoint、model、batch size、dimensions、request items 等排障字段，同时继续隐藏 secrets

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CLI regression tests for dual-layer provider diagnostics** - `4abf93d` (test)
2. **Task 2: Render safe multiline diagnostics in the top-level CLI failure path** - `766d0e4` (feat)

## Files Created/Modified

- `tests/indexCli.test.ts` - 锁定 CLI 失败 verdict 顺序、诊断字段可见性和 secret redaction 断言
- `src/index.ts` - 新增 diagnostics formatting helper，并在顶层 catch 分支输出多行安全诊断块

## Decisions Made

- 在 `src/index.ts` 直接消费 `EmbeddingFatalError.diagnostics`，避免 CLI 重新猜测 provider 错误类型
- 诊断块字段固定为阶段、类别、HTTP 状态、provider 原始字段和安全请求摘要，保证输出稳定可测试
- Endpoint 输出额外去掉 query string，即使上游 contract 未来误传路径参数，也不会在默认终端输出泄露

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 的 CLI 默认输出契约已经补齐，provider diagnostics 能直接在终端边界落地
- Phase 3 可以在现有 verdict + diagnostics 基础上继续增强索引过程可见性，而不必再改失败诊断结构

---

_Phase: 02-provider-diagnostics_
_Completed: 2026-03-31_

## Self-Check: PASSED
