# Requirements: ContextWeaver

**Defined:** 2026-03-31
**Core Value:** Agent 能稳定、可信地从本地代码库中获得可用的检索结果与上下文证据，而不是在索引或搜索主链路中遇到误导性成功状态或难以诊断的失败。

## v1 Requirements

Requirements for this milestone focus on making the existing `index` command honest, diagnosable, and safe to recover from.

### Diagnostics

- [x] **DIAG-01**: User can see provider-aware embedding failure details that include the failing stage, provider type, HTTP status, and upstream error summary when `index` fails
- [x] **DIAG-02**: User can see a safe diagnostic request summary for embedding failures, including model name, batch size, dimensions, and endpoint host without exposing secrets
- [x] **DIAG-03**: User can distinguish common embedding failure categories such as authentication, rate limit, batch-too-large, dimension mismatch, timeout, network failure, and incompatible response format

### Visibility

- [ ] **VIS-01**: User can see `index` progress by major stages, including crawl, process, chunk, embed, and persist
- [x] **VIS-02**: User can see how many files were skipped during indexing and the reason distribution for those skipped files
- [x] **VIS-03**: User can see a final indexing summary whose success or failure state matches the actual exit code and indexing outcome

### Safety

- [x] **SAFE-01**: User can rely on `index` to stop scheduling further embedding work immediately after a fatal embedding error is detected
- [x] **SAFE-02**: User never sees misleading success messages or success statistics after a fatal indexing failure
- [ ] **SAFE-03**: User can trust that indexing state remains consistent across SQLite metadata, FTS records, LanceDB vectors, and published index status after a fatal failure
- [ ] **SAFE-04**: User can rely on search-side consumers to read only the last healthy published index snapshot after a failed indexing run

### Recovery

- [ ] **RECV-01**: User can explicitly recover from a failed indexing run using a clear resume path that does not conflict with existing `index --force` reindex behavior
- [ ] **RECV-02**: User can inspect a partial-failure report that identifies failed, skipped, or otherwise incomplete indexing work after an interrupted or failed run

## v2 Requirements

Deferred requirements acknowledged during scoping but not committed to this roadmap.

### Diagnostics

- **DIAG-04**: User can run preflight health checks for API credentials, base URL compatibility, model availability, dimensions, and writable local index directories before a full indexing run

### Visibility

- **VIS-04**: User can consume structured JSON index status output for scripting and skill-driven automation

### Recovery

- **RECV-03**: User can clean up failed runs, orphaned vector data, or other abandoned indexing artifacts with an explicit recovery command or guided workflow

## Out of Scope

Explicitly excluded from this milestone to keep the roadmap focused on reliable indexing.

| Feature                                                       | Reason                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| New search subcommands or retrieval features                  | This milestone is about restoring trust in the existing `index` pipeline, not expanding the search surface |
| Functional rewrites of `search` or `prompt-context`           | These commands may need small guardrail changes, but they are not the primary work target                  |
| Automatic continuation after fatal embedding failures         | The agreed default behavior is fail-fast, not silent partial success                                       |
| Implicit provider fallback across multiple embedding backends | Adds complexity before failure states and consistency semantics are trustworthy                            |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase                         | Status  |
| ----------- | ----------------------------- | ------- |
| SAFE-01     | Phase 1: Fail-fast Exit       | Done    |
| SAFE-02     | Phase 1: Fail-fast Exit       | Done    |
| DIAG-01     | Phase 2: Provider Diagnostics | Complete |
| DIAG-02     | Phase 2: Provider Diagnostics | Complete |
| DIAG-03     | Phase 2: Provider Diagnostics | Complete |
| VIS-01      | Phase 3: Index Visibility     | Pending |
| VIS-02      | Phase 3: Index Visibility     | Complete |
| VIS-03      | Phase 3: Index Visibility     | Complete |
| SAFE-03     | Phase 4: State Consistency    | Pending |
| SAFE-04     | Phase 4: State Consistency    | Pending |
| RECV-01     | Phase 5: Safe Recovery        | Pending |
| RECV-02     | Phase 5: Safe Recovery        | Pending |

**Coverage:**

- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---

_Requirements defined: 2026-03-31_
_Last updated: 2026-04-01 after Phase 1 execution_
