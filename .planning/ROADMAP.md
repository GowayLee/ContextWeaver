# Roadmap: ContextWeaver 索引可靠性修复

## Overview

本里程碑不是功能扩展，而是将现有 `index` 命令改造为"说真话、能失败、可诊断、状态一致、可恢复"的可靠索引作业系统。五个阶段按依赖链推进：先让系统停止撒谎，再让失败可诊断，再让过程可观测，再让状态可信，最后让恢复安全。

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Fail-fast Exit** — Embedding 致命错误立即停机，退出码与输出与真实结果一致
- [ ] **Phase 2: Provider Diagnostics** — 嵌入失败输出包含 provider 类型、HTTP 状态、错误分类与安全诊断摘要
- [ ] **Phase 3: Index Visibility** — 索引过程按阶段可见，跳过原因可追溯，最终摘要诚实反映真实结果
- [ ] **Phase 4: State Consistency** — 失败后跨存储状态一致，search 只读健康快照
- [ ] **Phase 5: Safe Recovery** — 失败后可安全恢复，兼容现有 `index --force`

## Phase Details

### Phase 1: Fail-fast Exit

**Goal**: `index` 在 Embedding API 返回致命错误时立即停止后续工作，且绝不打印误导性成功信息
**Depends on**: Nothing (first phase)
**Requirements**: SAFE-01, SAFE-02
**Success Criteria** (what must be TRUE):

1. When embedding API returns a fatal error (4xx/5xx), `index` stops scheduling further embedding batches immediately and cancels in-flight work
2. When `index` fails, CLI exits with non-zero code and prints no "索引完成" or success statistics
3. When `index` succeeds, CLI exits with code 0 and prints success statistics; when it fails, the final output clearly states failure
   **Plans**: 2 plans

Plans:

- [x] 01-01-PLAN.md — 为 embedding/indexer 建立 fail-fast 契约与回归测试
- [x] 01-02-PLAN.md — 收紧 scanner/CLI 失败出口并抑制误导性成功输出

### Phase 2: Provider Diagnostics

**Goal**: 用户看到足够详细的嵌入失败诊断信息，能自助定位 batch size、provider 限制、认证等常见问题
**Depends on**: Phase 1
**Requirements**: DIAG-01, DIAG-02, DIAG-03
**Success Criteria** (what must be TRUE):

1. User can see provider type, failing stage, HTTP status, and upstream error summary when `index` fails due to an embedding error
2. User can see a safe diagnostic request summary (model name, batch size, dimensions, endpoint host) without any API keys or secrets being exposed
3. User can distinguish failure categories: authentication, rate limit, batch-too-large, dimension mismatch, timeout, network failure, and incompatible response format
   **Plans**: TBD

Plans:

- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Index Visibility

**Goal**: 索引过程可观测、可追溯，最终摘要与真实结果完全一致
**Depends on**: Phase 1
**Requirements**: VIS-01, VIS-02, VIS-03
**Success Criteria** (what must be TRUE):

1. User can see which major stage `index` is currently working on (crawl, process, chunk, embed, persist)
2. User can see how many files were skipped and the reason distribution for those skipped files
3. User can see a final indexing summary whose success/failure state matches the actual exit code and indexing outcome — success shows stats, failure shows failure details
   **Plans**: TBD

Plans:

- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: State Consistency

**Goal**: 索引失败后 SQLite、FTS、LanceDB 和 published 状态始终一致，search/prompt-context 只消费健康快照
**Depends on**: Phase 1
**Requirements**: SAFE-03, SAFE-04
**Success Criteria** (what must be TRUE):

1. After a fatal indexing failure, SQLite metadata, FTS records, and LanceDB vectors all reflect the same failure state — no partial success posing as complete
2. After a failed indexing run, search and prompt-context commands only read from the last healthy published index snapshot, never from the failed run
3. User can observe that the published index status accurately reflects whether the last run succeeded or failed
   **Plans**: TBD

Plans:

- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Safe Recovery

**Goal**: 用户能安全地从失败索引中恢复，有清晰的 resume 路径，且不与现有 `index --force` 冲突
**Depends on**: Phase 4
**Requirements**: RECV-01, RECV-02
**Success Criteria** (what must be TRUE):

1. User can recover from a failed indexing run using a clear resume path that coexists with (not replaces) existing `index --force` reindex behavior
2. User can inspect a partial-failure report identifying failed, skipped, or incomplete files/chunks after an interrupted or failed run
3. User can run `index --force` after a failure to get a clean reindex with no risk of stale or corrupted state leaking into the new index
   **Plans**: TBD

Plans:

- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase                   | Plans Complete | Status      | Completed  |
| ----------------------- | -------------- | ----------- | ---------- |
| 1. Fail-fast Exit       | 2/2            | Completed   | 2026-04-01 |
| 2. Provider Diagnostics | 0/?            | Not started | -          |
| 3. Index Visibility     | 0/?            | Not started | -          |
| 4. State Consistency    | 0/?            | Not started | -          |
| 5. Safe Recovery        | 0/?            | Not started | -          |
