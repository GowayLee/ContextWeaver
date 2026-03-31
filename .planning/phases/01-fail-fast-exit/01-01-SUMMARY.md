---
phase: 01-fail-fast-exit
plan: 01
subsystem: api
tags: [embedding, indexer, fail-fast, abortcontroller, testing]
requires: []
provides:
  - Embedding 层共享 fatal session、best-effort abort 和晚到结果丢弃逻辑
  - Indexer 在 embedding fatal 时清理 vector_index_hash 并改为抛错
affects: [Phase 1, Phase 2, Phase 3]
tech-stack:
  added: []
  patterns:
    [共享 fatal session, embedding fatal error propagation, regression tests]
key-files:
  created: [tests/api/embedding.test.ts, tests/indexer/index.test.ts]
  modified: [src/api/embedding.ts, src/indexer/index.ts]
key-decisions:
  - 保留现有 429 和网络错误重试，仅把重试后仍失败的 embedding 视为 fatal
  - 用单次 embedBatch 级别的共享 fatal session 阻止未启动批次并丢弃晚到成功结果
patterns-established:
  - Embedding fatal 必须沿调用链抛出，不能降级成 success-looking stats
  - fatal 前已发出的请求只做 best-effort abort，晚到成功结果必须忽略
requirements-completed: [SAFE-01]
duration: 30min
completed: 2026-04-01
---

# Phase 1 Plan 01 Summary

**Embedding 批处理现在会在 fatal 失败后立即收敛，并把向量阶段失败真实地抛给 indexer 上层。**

## Performance

- **Duration:** 30 min
- **Started:** 2026-04-01T00:30:00Z
- **Completed:** 2026-04-01T01:05:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- 为 embedding/indexer 补了针对 Phase 1 契约的回归测试
- `embedBatch()` 新增共享 fatal session，fatal 后不再启动新批次
- indexer 遇到 embedding fatal 时会清理 `vector_index_hash` 并抛出阶段化错误

## Task Commits

- 未创建提交，本次执行未收到用户的显式提交指令

## Files Created/Modified

- `tests/api/embedding.test.ts` - 覆盖未启动批次停止和晚到结果丢弃
- `tests/indexer/index.test.ts` - 覆盖 hash 清理和 fatal 抛错
- `src/api/embedding.ts` - 实现共享 fatal session、AbortController 和晚到结果保护
- `src/indexer/index.ts` - fatal embedding 改为清理后抛出阶段错误

## Decisions Made

- 保持现有 429/网络错误重试策略不变，避免提前引入 provider 级错误分类
- 用 `EmbeddingFatalError` 统一表达 Phase 1 的向量 fatal 失败

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 重置全局 rate limiter 以隔离并发测试**

- **Found during:** Task 1 (Add fail-fast regression tests for embedding and indexer)
- **Issue:** `EmbeddingClient` 的全局速率控制器会跨测试复用，导致并发 fatal 场景测试不稳定
- **Fix:** 新增仅供测试使用的重置函数，确保每个测试用例从干净状态开始
- **Files modified:** `src/api/embedding.ts`, `tests/api/embedding.test.ts`
- **Verification:** `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts tests/indexCli.test.ts`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 仅用于稳定测试，不改变生产语义。

## Issues Encountered

- 由于全局单例复用，初版并发测试误退化成串行执行；通过最小测试重置钩子解决。

## User Setup Required

- None - no external service configuration required.

## Next Phase Readiness

- scanner/CLI 已可接收阶段化 fatal error，可继续收紧最终输出契约
- Phase 2 可以在现有阶段错误基础上补 provider 诊断细节

---

_Phase: 01-fail-fast-exit_
_Completed: 2026-04-01_
