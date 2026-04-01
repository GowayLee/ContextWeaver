---
phase: 03-index-visibility
plan: 03
subsystem: cli
tags: [cli, summaries, diagnostics, visibility, vitest]
requires:
  - phase: 03-index-visibility
    provides: skip buckets, partial stats, and stage metadata from plans 01-02
  - phase: 02-provider-diagnostics
    provides: safe diagnostics block rendering at the CLI boundary
provides:
  - 成功/失败双模板索引摘要
  - 跳过原因分桶终端呈现
  - 明确边界场景结论文案
affects: [terminal-output, docs, future-index-ux]
tech-stack:
  added: []
  patterns:
    [
      CLI 顶层通过独立 success/failure renderer 输出最终摘要,
      failure 摘要先 verdict 再 partial stats 再 diagnostics,
    ]
key-files:
  created: [tests/indexVisibilitySummary.test.ts]
  modified: [src/index.ts, tests/indexCli.test.ts]
key-decisions:
  - "最终摘要在 src/index.ts 拆成 success/failure 两套 renderer，避免失败路径复用成功模板。"
  - "failure renderer 优先输出 verdict、失败阶段和已知统计，再追加 Phase 2 diagnostics block。"
patterns-established:
  - "Pattern: success 结论按 normal/no-change/sync-only 三类边界场景分流。"
  - "Pattern: skip bucket 统一映射为稳定中文标签并在 `跳过原因:` 行聚合输出。"
requirements-completed: [VIS-02, VIS-03]
duration: 4min
completed: 2026-04-01
---

# Phase 3 Plan 03: Honest final summary rendering Summary

**`cw index` 现在会输出独立的成功/失败摘要模板，并在终端总结里展示跳过原因分桶与明确边界场景结论。**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T02:30:17Z
- **Completed:** 2026-04-01T02:33:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- 用新的 summary 回归测试锁定成功/失败双模板、跳过原因输出和 no-change / sync-only / pre-embed-failure 三类边界结论。
- 在 `src/index.ts` 中新增 success/failure formatter，把 `skippedByReason`、`partialStats` 和 `ScanStageError.stage` 纳入最终终端摘要。
- 保留 Phase 2 diagnostics 契约：当失败链路里包含 `EmbeddingFatalError` 时，仍在诚实 verdict 之后输出安全 diagnostics block。

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CLI summary tests for honest verdicts, skip distributions, and edge cases** - `e6d4c9e` (test)
2. **Task 2: Implement separate summary renderers with skip buckets and explicit edge-case conclusions** - `41058e7` (feat)

## Files Created/Modified

- `tests/indexVisibilitySummary.test.ts` - 锁定 final summary 的 success/failure 模板、skip bucket 输出和边界场景结论。
- `src/index.ts` - 新增 summary render helpers，输出跳过原因、失败阶段和已知统计。
- `tests/indexCli.test.ts` - 同步更新既有 CLI 顶层断言以匹配新的诚实摘要契约。

## Decisions Made

- 顶层 CLI 继续承担最终人类可读 verdict 的职责，但不再复用单一模板。
- `EmbeddingFatalError` 若包在 `ScanStageError.cause` 里，也要继续识别并输出 Phase 2 diagnostics。
- skip reason 最终文案保持聚合，不引入默认逐文件路径列表。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 更新既有 CLI 回归测试以匹配新摘要契约**

- **Found during:** Task 2
- **Issue:** `tests/indexCli.test.ts` 仍锁定旧的 `索引完成 (...)` / `索引失败:` 文案，导致 03-03 的正确实现会让既有回归测试误报失败。
- **Fix:** 将既有断言同步到新的 success/failure summary contract，同时保留 Phase 2 diagnostics 顺序验证。
- **Files modified:** `tests/indexCli.test.ts`
- **Verification:** `pnpm test -- tests/indexVisibilitySummary.test.ts tests/indexCli.test.ts`
- **Committed in:** `41058e7`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 只是让既有测试跟随已批准的新输出契约，没有扩大实现范围。

## Issues Encountered

- `pnpm build` 继续被既有 `src/chunking/ParserPool.ts(104,22)` DTS 类型错误阻塞，已再次记录到 `.planning/phases/03-index-visibility/deferred-items.md`。

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 的三项可见性目标已全部落地：过程阶段可见、skip 分桶可见、最终 verdict 诚实。
- 后续 Phase 4 可以直接基于当前诚实终端输出继续推进状态一致性，而不需要再回补 summary 契约。
- 全量构建验证仍受既有 `ParserPool.ts` DTS 问题影响。

## Self-Check

PASSED

---

_Phase: 03-index-visibility_
_Completed: 2026-04-01_
