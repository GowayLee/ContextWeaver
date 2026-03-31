---
phase: 01-fail-fast-exit
plan: 02
subsystem: cli
tags: [cli, scanner, fail-fast, output-contract, testing]
requires:
  - phase: 01-fail-fast-exit
    provides: embedding fatal 已能抛到上层
provides:
  - CLI 成功文案仅出现在真实成功路径
  - fatal 失败输出包含阶段上下文且退出非零
affects: [Phase 2, Phase 3]
tech-stack:
  added: []
  patterns: [success-only completion logs, failure verdict with stage context]
key-files:
  created: []
  modified: [tests/indexCli.test.ts, src/scanner/index.ts, src/index.ts]
key-decisions:
  - scanner 只在真实成功路径发出 `索引完成`
  - 顶层 CLI 用单独 helper 收口成功/失败输出契约，便于测试
patterns-established:
  - 失败路径允许保留已发生的过程日志，但禁止任何 success-only 收尾文案
  - 顶层 CLI 的最终 verdict 通过可测试 helper 收口
requirements-completed: [SAFE-02]
duration: 20min
completed: 2026-04-01
---

# Phase 1 Plan 02 Summary

**CLI 现在只会在真实成功时输出完成摘要，而 fatal 向量失败会以带阶段上下文的失败结论结束。**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-01T01:05:00Z
- **Completed:** 2026-04-01T01:25:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- 为 fatal CLI 出口新增回归测试，直接断言失败输出不含成功文案
- scanner 在向量阶段 fatal 时不再落到最终 `索引完成` 进度
- `src/index.ts` 增加可测试的 `runIndexCliCommand()`，把最终 success/failure verdict 收口到一处

## Task Commits

- 未创建提交，本次执行未收到用户的显式提交指令

## Files Created/Modified

- `tests/indexCli.test.ts` - 覆盖 fatal 输出与成功输出分支
- `src/scanner/index.ts` - 传播向量阶段 fatal 并避免成功收尾
- `src/index.ts` - 收紧 CLI 最终输出契约并支持测试导入

## Decisions Made

- 把顶层 `index` action 提炼为 `runIndexCliCommand()`，避免为测试导入 `src/index.ts` 时触发 CLI parse
- 失败分支只输出 `索引失败: <阶段上下文>`，不复述任何成功统计

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None

## User Setup Required

- None - no external service configuration required.

## Next Phase Readiness

- Phase 1 的用户可见输出契约已锁定，后续 provider 诊断可以在失败消息内继续丰富
- Phase 3 可基于现有 scanner 进度链路继续增强阶段可见性

---

_Phase: 01-fail-fast-exit_
_Completed: 2026-04-01_
