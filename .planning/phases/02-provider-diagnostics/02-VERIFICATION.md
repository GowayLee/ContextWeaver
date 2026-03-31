---
phase: 02-provider-diagnostics
verified: 2026-03-31T17:48:50Z
status: passed
score: 3/3 must-haves verified
---

# Phase 2: Provider Diagnostics Verification Report

**Phase Goal:** 用户看到足够详细的嵌入失败诊断信息，能自助定位 batch size、provider 限制、认证等常见问题
**Verified:** 2026-03-31T17:48:50Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                        | Status     | Evidence                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `index` 因 embedding 失败时，用户能看到 provider type、失败阶段、HTTP 状态和上游错误摘要                                     | ✓ VERIFIED | `src/index.ts:27-48,111-119` 渲染诊断块；`src/api/embedding.ts:628-639,821-853` 生成 diagnostics；`tests/indexCli.test.ts:442-490` 断言终端输出                  |
| 2   | 默认 CLI 输出包含安全请求摘要（endpoint host/path、model、batch size、dimensions、request items），且不暴露 secrets          | ✓ VERIFIED | `src/index.ts:33-59` 仅输出 host+path 并去掉 query string；`tests/indexCli.test.ts:485-490` 明确断言不包含 `test-key`、`Bearer `、`Authorization`、query secret  |
| 3   | 系统能区分 authentication、rate limit、batch-too-large、dimension mismatch、timeout、network、incompatible response、unknown | ✓ VERIFIED | `src/api/embedding.ts:856-912` 明确分类；`tests/api/embedding.test.ts:163-279` 覆盖 8 类失败分类；`tests/indexer/index.test.ts:41-100` 验证 indexer 重抛保留分类 |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact                      | Expected                                       | Status     | Details                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/embedding.ts`        | typed diagnostics contract + conservative 分类 | ✓ VERIFIED | 存在；导出 `EmbeddingFailureCategory`/`EmbeddingFailureDiagnostics`；`EmbeddingFatalError` 持有 diagnostics；HTTP/网络/超时/响应结构异常均生成真实 diagnostics |
| `src/indexer/index.ts`        | 保留 diagnostics 的 fatal 重抛                 | ✓ VERIFIED | `clearVectorIndexHash()` 后以 `向量嵌入阶段失败: ...` 重抛并透传 `diagnostics`                                                                                 |
| `src/index.ts`                | CLI 双层失败输出和安全诊断块                   | ✓ VERIFIED | `formatEmbeddingFailureDiagnostics()` 固定输出字段；catch 分支先输出 verdict 再逐行输出 diagnostics                                                            |
| `tests/api/embedding.test.ts` | diagnostics/分类回归覆盖                       | ✓ VERIFIED | 覆盖 provider raw fields、请求摘要和 8 类分类                                                                                                                  |
| `tests/indexer/index.test.ts` | indexer 透传 diagnostics 回归覆盖              | ✓ VERIFIED | 断言 `stage: 'embed'`、`category`、provider 字段和 hash 清理                                                                                                   |
| `tests/indexCli.test.ts`      | CLI 输出结构与 secret redaction 回归覆盖       | ✓ VERIFIED | 断言 verdict 顺序、字段可见性、敏感信息不泄露                                                                                                                  |

### Key Link Verification

| From                   | To                     | Via                                                       | Status  | Details                                                              |
| ---------------------- | ---------------------- | --------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `src/api/embedding.ts` | `src/indexer/index.ts` | `EmbeddingFatalError.diagnostics` 跨 batch/index 边界传递 | ✓ WIRED | `src/indexer/index.ts:218-223` 读取上游 diagnostics 并重新包装后保留 |
| `src/api/embedding.ts` | failure categories     | 显式分类 helper                                           | ✓ WIRED | `src/api/embedding.ts:856-912` 明确返回 8 类，不依赖 CLI 二次猜测    |
| `src/index.ts`         | CLI terminal output    | 渲染 `EmbeddingFatalError.diagnostics`                    | ✓ WIRED | `src/index.ts:27-48,113-118` 直接消费 diagnostics 输出终端可读块     |
| `src/index.ts`         | terminal output safety | host+path 渲染且 query 被剥离                             | ✓ WIRED | `src/index.ts:50-59` 只显示安全 endpoint 摘要                        |

### Data-Flow Trace (Level 4)

| Artifact               | Data Variable          | Source                                                                                                  | Produces Real Data                                                         | Status    |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| `src/index.ts`         | `error.diagnostics`    | `EmbeddingFatalError.diagnostics` from `src/api/embedding.ts` via `src/indexer/index.ts`                | Yes — 来自真实 response status/provider error/network error/request config | ✓ FLOWING |
| `src/api/embedding.ts` | `diagnostics.category` | `classifyFailure()` over HTTP status / provider type / provider code / upstream message / runtime error | Yes — 由真实失败信号分类，不是静态占位                                     | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                     | Command                                                                | Result                        | Status |
| -------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- | ------ |
| embedding/indexer diagnostics contract works | `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts` | 退出 0，相关测试通过          | ✓ PASS |
| CLI dual-layer diagnostics output works      | `pnpm test -- tests/indexCli.test.ts`                                  | 退出 0，CLI 输出/脱敏断言通过 | ✓ PASS |
| code builds after phase changes              | `pnpm build`                                                           | 退出 0，tsup build success    | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan                      | Description                                                                                    | Status      | Evidence                                                                                             |
| ----------- | -------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `DIAG-01`   | `02-01-PLAN.md`, `02-02-PLAN.md` | `index` 失败时可见 provider-aware 失败详情（stage/provider type/HTTP status/upstream summary） | ✓ SATISFIED | `src/api/embedding.ts:27-40,632-639`; `src/index.ts:36-42,113-118`; `tests/indexCli.test.ts:442-490` |
| `DIAG-02`   | `02-02-PLAN.md`                  | 默认显示安全请求摘要且不暴露 secrets                                                           | ✓ SATISFIED | `src/index.ts:33-59`; `tests/indexCli.test.ts:479-490`                                               |
| `DIAG-03`   | `02-01-PLAN.md`                  | 用户可区分常见 embedding failure categories                                                    | ✓ SATISFIED | `src/api/embedding.ts:856-912`; `tests/api/embedding.test.ts:163-279`                                |

Phase 2 在 `REQUIREMENTS.md` 中映射的 requirement 仅有 `DIAG-01`、`DIAG-02`、`DIAG-03`，且都已在计划 frontmatter 中声明；**无 orphaned requirements**。

### Anti-Patterns Found

| File                   | Line | Pattern                          | Severity | Impact                                                         |
| ---------------------- | ---- | -------------------------------- | -------- | -------------------------------------------------------------- |
| `src/index.ts`         | 29   | `return null` in formatter guard | ℹ️ Info  | 这是“非 EmbeddingFatalError 不输出诊断块”的正常分支，不是 stub |
| `src/api/embedding.ts` | 398  | `return []` for empty input      | ℹ️ Info  | 合法空输入短路，不影响阶段目标                                 |

未发现会阻断 Phase 2 目标的 TODO/placeholder/空实现类问题。

### Human Verification Required

None.

### Gaps Summary

无阻断缺口。Phase 2 的核心目标已经落地：embedding 失败会沿 API → indexer → CLI 链路携带真实 diagnostics，CLI 默认输出可直接看到 provider 原始字段、HTTP 状态、错误类别与安全请求摘要，并且测试明确覆盖 secret redaction。

---

_Verified: 2026-03-31T17:48:50Z_
_Verifier: the agent (gsd-verifier)_
