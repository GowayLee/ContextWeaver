---
phase: 02-provider-diagnostics
plan: 01
subsystem: api
tags: [embedding, diagnostics, indexer, vitest, provider-errors]
requires:
  - phase: 01-fail-fast-exit
    provides: embedding fatal error propagation and success-only failure boundaries
provides:
  - Typed embedding diagnostics carrying provider fields and safe request context
  - Conservative failure classification for common provider, network, and response-shape failures
  - Indexer rethrows that preserve diagnostics while keeping embed-stage context
affects: [Phase 2, CLI diagnostics rendering, Phase 3]
tech-stack:
  added: []
  patterns:
    [
      typed fatal diagnostics,
      conservative provider failure classification,
      diagnostics-preserving rethrow,
    ]
key-files:
  created: []
  modified:
    [
      src/api/embedding.ts,
      src/indexer/index.ts,
      tests/api/embedding.test.ts,
      tests/indexer/index.test.ts,
    ]
key-decisions:
  - 在 API 层生成并携带 EmbeddingFailureDiagnostics，避免 CLI 再次猜测上游错误语义
  - 仅对高置信信号映射标准类别，其他情况保留 unknown 并继续展示 provider 原始 message/type/code
  - indexer 重抛继续使用 `向量嵌入阶段失败` 上下文，但直接复用 upstream diagnostics
patterns-established:
  - EmbeddingFatalError 既承担 fatal 控制流，也承担跨层安全诊断载体
  - 成功但 payload 异常的 provider 响应必须显式归类为 incompatible_response
requirements-completed: [DIAG-01, DIAG-03]
duration: 11 min
completed: 2026-04-01
---

# Phase 2 Plan 01: Provider Diagnostics Summary

**Embedding fatal 现在会携带 provider 原始字段、请求摘要和标准分类，并在 indexer 重抛时完整保留。**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-31T17:26:56Z
- **Completed:** 2026-03-31T17:38:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- 为 embedding 和 indexer 增加了 provider diagnostics 契约测试，覆盖 8 类失败分类和字段保留
- `EmbeddingFatalError` 现在携带 typed diagnostics，包含 provider 原始字段与安全请求摘要
- indexer 重抛保留 `向量嵌入阶段失败` 阶段文案，同时不再丢失 diagnostics 元信息

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock provider diagnostics and category mapping with regression tests** - `f0b8b4a` (test)
2. **Task 2: Implement typed embedding diagnostics and preserve them through indexer rethrow** - `eccefe0` (feat)

## Files Created/Modified

- `tests/api/embedding.test.ts` - 锁定 provider diagnostics 字段和 8 类失败分类回归断言
- `tests/indexer/index.test.ts` - 断言 indexer 重抛后 diagnostics 仍可读取且保持 `stage: 'embed'`
- `src/api/embedding.ts` - 新增 diagnostics 类型、分类逻辑、成功响应校验和 fatal 诊断封装
- `src/indexer/index.ts` - 重抛 diagnostics-bearing fatal error 并保留 embed 阶段上下文

## Decisions Made

- 在 `src/api/embedding.ts` 生成 `EmbeddingFailureDiagnostics`，因为这里只有这里同时掌握请求配置与上游响应字段
- 分类策略保持保守，只对认证、限流、batch 过大、维度不匹配、超时、网络和响应结构异常做明确映射
- indexer 不重新分类 provider 错误，只负责在阶段消息外层包一层 `向量嵌入阶段失败`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 修复 HTTP provider 错误构建 diagnostics 时的空值崩溃**

- **Found during:** Task 2 (Implement typed embedding diagnostics and preserve them through indexer rethrow)
- **Issue:** HTTP 失败路径在无底层异常对象时仍调用超时/网络检测，导致读取 `undefined.message` 并覆盖原始 provider message
- **Fix:** 为网络/超时 helper 增加空值保护，确保 diagnostics 分类不会破坏原始上游错误内容
- **Files modified:** `src/api/embedding.ts`
- **Verification:** `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts`; `pnpm build`
- **Committed in:** `eccefe0`

**2. [Rule 1 - Bug] 将 429 重试收紧为真正的 HTTP 429，避免 quota 类诊断进入长时间重试**

- **Found during:** Task 2 (Implement typed embedding diagnostics and preserve them through indexer rethrow)
- **Issue:** 新增标准分类后，任何被归类为 `rate_limit` 的错误都会触发退避重试，导致非 429 quota/provider 拒绝也被当作可恢复限流处理
- **Fix:** 仅对 `httpStatus === 429` 的 fatal 继续沿用 Phase 1 退避重试，其它 quota/rate 失败直接作为可诊断 fatal 抛出
- **Files modified:** `src/api/embedding.ts`, `tests/api/embedding.test.ts`
- **Verification:** `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts`; `pnpm build`
- **Committed in:** `eccefe0`

---

**Total deviations:** 2 auto-fixed (2 bug)
**Impact on plan:** 两个修复都属于落地 diagnostics 契约时暴露的正确性问题，没有扩大计划边界。

## Issues Encountered

- 网络失败分类测试会触发真实重试回路，验证耗时约 7 秒，但仍在阶段验证预算内

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLI 顶层已经可以直接消费 typed diagnostics，下一计划可专注渲染安全的双层终端输出
- provider diagnostics contract 已被测试锁定，后续 Phase 2/3 可复用相同错误对象而不必重新解析字符串

---

_Phase: 02-provider-diagnostics_
_Completed: 2026-04-01_

## Self-Check: PASSED
