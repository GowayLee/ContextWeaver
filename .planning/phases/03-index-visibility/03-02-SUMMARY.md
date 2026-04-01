---
phase: 03-index-visibility
plan: 02
subsystem: indexing
tags: [scanner, cli, progress, vitest]
requires:
  - phase: 03-index-visibility
    provides: scanner visibility stats and stage metadata from 03-01
provides:
  - 阶段化 index progress 日志
  - chunk/embed 批次进度可见性
  - CLI 直接消费 scanner progress 消息
affects: [src/index.ts, phase-03-plan-03, terminal-output]
tech-stack:
  added: []
  patterns:
    [scanner 通过 onProgress 发送阶段消息, CLI 对阶段消息直接打印并做重复去重]
key-files:
  created: [tests/indexVisibilityProgress.test.ts]
  modified: [src/scanner/index.ts, src/cli.ts]
key-decisions:
  - "继续复用现有 scanner -> CLI 的 onProgress 通道，而不是新增第二套进度事件系统。"
  - "CLI 以 message 为主信号直接打印阶段消息，只做重复消息去重，不再依赖 30% 百分比门槛。"
patterns-established:
  - "Pattern: progress 文案以 `阶段 <stage>:` 开头，携带关键计数。"
  - "Pattern: chunk/embed 阶段既展示待嵌入文件数，也展示批次进度。"
requirements-completed: [VIS-01]
duration: 3min
completed: 2026-04-01
---

# Phase 3 Plan 02: Stage-first progress visibility Summary

**`cw index` 现在会直接输出 crawl/process/chunk/embed/persist 阶段消息，并在 chunk/embed 阶段保留批次进度。**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T02:25:22Z
- **Completed:** 2026-04-01T02:28:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- 用回归测试锁定阶段优先的进度输出契约，要求显示 crawl/process/chunk/embed/persist 和 embedding 批次计数。
- 在 `src/scanner/index.ts` 中把阶段消息接入现有 `onProgress` 通道，补充候选文件数、已处理文件数、待嵌入文件数、批次进度和 persist 同步提示。
- 在 `src/cli.ts` 中移除 30% 百分比门槛，改为直接打印 scanner 传来的阶段消息，并做简单去重。

## Task Commits

Each task was committed atomically:

1. **Task 1: Add progress logging tests for stage-first visibility** - `a09bfbd` (test)
2. **Task 2: Emit and render stage-based progress messages through the existing callback chain** - `21bd8c9` (feat)

## Files Created/Modified

- `tests/indexVisibilityProgress.test.ts` - 锁定阶段化进度日志与 chunk/embed 批次计数。
- `src/scanner/index.ts` - 发出 `阶段 crawl/process/chunk/embed/persist` 进度消息。
- `src/cli.ts` - 直接渲染阶段消息，替代旧的 `索引进度: 30%` 阶梯输出。

## Decisions Made

- 保持单一 progress 通道：scanner 生成消息，CLI 只负责展示。
- 进度契约从“百分比阈值”切换为“阶段消息 + 关键计数”，更贴近真实索引状态。
- 对重复阶段消息只做轻量去重，避免终端刷屏但不丢失阶段语义。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm build` 仍命中既有 `src/chunking/ParserPool.ts(104,22)` DTS 类型错误，和本计划的 progress 改动无关，已追加记录到 `.planning/phases/03-index-visibility/deferred-items.md`。

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `03-03` 现在可以直接基于真实阶段消息和 03-01 的 `partialStats` 渲染诚实的成功/失败摘要。
- 当前终端已经具备阶段化过程可见性，剩余工作聚焦在最终结论模板与边界场景文案。
- 全量构建验证仍受既有 `ParserPool.ts` DTS 问题阻塞。

## Self-Check

PASSED

---

_Phase: 03-index-visibility_
_Completed: 2026-04-01_
