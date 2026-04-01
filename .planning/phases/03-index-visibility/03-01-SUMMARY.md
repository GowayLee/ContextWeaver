---
phase: 03-index-visibility
plan: 01
subsystem: indexing
tags: [scanner, visibility, vitest, typescript]
requires:
  - phase: 01-fail-fast-exit
    provides: 失败路径必须诚实退出且不能复用成功结论
  - phase: 02-provider-diagnostics
    provides: CLI 顶层继续统一渲染失败诊断
provides:
  - scanner 跳过原因稳定分桶
  - scanner partial stats 与阶段化失败元数据
  - scanner 可见性回归测试
affects: [src/index.ts, src/cli.ts, phase-03-plan-02, phase-03-plan-03]
tech-stack:
  added: []
  patterns:
    [
      scanner 层输出结构化 skip bucket,
      scanner 失败使用 ScanStageError 上传阶段与 partial stats,
    ]
key-files:
  created: [tests/scanner/indexVisibility.test.ts]
  modified: [src/scanner/processor.ts, src/scanner/index.ts]
key-decisions:
  - "在 scanner/processor.ts 内直接产出 skipReason，避免 CLI 再从自由文本猜分类。"
  - "用 ScanStageError 在 scanner 边界上传 stage 与 partialStats，让后续 CLI 计划只负责渲染。"
patterns-established:
  - "Pattern: skippedByReason 只暴露聚合计数，不默认暴露逐文件路径。"
  - "Pattern: no_indexable_chunks 视为明确 skip bucket，而不是隐含在 indexer 控制流里。"
requirements-completed: [VIS-02, VIS-03]
duration: 6min
completed: 2026-04-01
---

# Phase 3 Plan 01: Scanner visibility contracts Summary

**Scanner 现在会产出稳定 skip buckets、visibility 计数和带 partial stats 的阶段化失败元数据。**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-01T02:16:52Z
- **Completed:** 2026-04-01T02:22:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- 用 TDD 锁定 scanner 跳过原因分桶、聚合统计和 typed stage failure 契约。
- 在 `src/scanner/processor.ts` 中补充 `SkipReasonBucket` / `skipReason`，把大文件、二进制、忽略 JSON、无可索引 chunk、处理失败统一映射到稳定分类。
- 在 `src/scanner/index.ts` 中补充 `skippedByReason`、`visibility` 和 `ScanStageError`，为后续 CLI 计划提供真实失败阶段与安全 partial stats。

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scanner visibility regression tests for skip buckets and partial failure stats** - `273cc45` (test)
2. **Task 2: Implement stable skip-reason buckets and typed scanner failure metadata** - `37806ce` (feat)

## Files Created/Modified

- `tests/scanner/indexVisibility.test.ts` - 锁定 skip bucket、聚合可见性字段和 `ScanStageError` 回归契约。
- `src/scanner/processor.ts` - 导出 `SkipReasonBucket`，并在文件处理结果上附加稳定 `skipReason`。
- `src/scanner/index.ts` - 汇总 `skippedByReason` / `visibility`，并在 crawl/process/chunk/embed/persist 失败时抛出 `ScanStageError`。

## Decisions Made

- 在 processor 层而不是 CLI 层完成 skip reason 分类，保证后续渲染直接消费事实数据。
- 把 `no_indexable_chunks` 计入显式 skip bucket，使“无 chunk 文件”不再被隐藏在 indexer 内部行为里。
- scanner 失败改为携带 `stage` 和 `partialStats`，为后续 Phase 3 CLI 摘要计划复用。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 修正回归测试夹具以命中真实分支**

- **Found during:** Task 2
- **Issue:** 初版测试夹具里的二进制样本与空 TypeScript 文件没有稳定触发目标分支，导致 RED 用例无法真实覆盖 `binary_file` 与 `no_indexable_chunks`。
- **Fix:** 把二进制样本调整为包含 NULL 字节的内容，并把无 chunk 样本改为空 `.txt` 文件，确保测试覆盖真实运行路径。
- **Files modified:** `tests/scanner/indexVisibility.test.ts`
- **Verification:** `pnpm test -- tests/scanner/indexVisibility.test.ts`
- **Committed in:** `37806ce`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 只修正了测试夹具，不影响计划范围，且保证契约测试真实有效。

## Issues Encountered

- `pnpm build` 命中既有 DTS 构建错误：`src/chunking/ParserPool.ts(104,22)` 的类型问题与本计划改动无关，已记录到 `.planning/phases/03-index-visibility/deferred-items.md`。

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `03-02` 可以直接复用 `visibility` 计数和 `ScanStageError.stage` 做阶段化进度输出。
- `03-03` 可以直接复用 `skippedByReason` 和 `partialStats` 渲染成功/失败双模板摘要。
- 全量 `pnpm build` 仍受既有 `ParserPool.ts` DTS 错误阻塞，后续计划或单独修复需要先处理该问题。

## Self-Check

PASSED

---

_Phase: 03-index-visibility_
_Completed: 2026-04-01_
