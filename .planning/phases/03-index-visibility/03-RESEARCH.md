# Phase 3: Index Visibility - Research

**Date:** 2026-04-01
**Phase:** 03-index-visibility
**Discovery level:** Level 0 — brownfield visibility work on the existing indexing pipeline, no new dependency selection required

## Research Question

How should Phase 3 make `cw index` visibly stage-driven, skipped-file reasons traceable, and final summaries honest without breaking Phase 1 fail-fast or Phase 2 diagnostics behavior?

## Code Paths Reviewed

- `src/cli.ts`
- `src/index.ts`
- `src/scanner/index.ts`
- `src/scanner/processor.ts`
- `src/indexer/index.ts`
- `tests/indexCli.test.ts`
- `.planning/phases/03-index-visibility/03-CONTEXT.md`
- `.planning/phases/01-fail-fast-exit/01-02-SUMMARY.md`
- `.planning/phases/02-provider-diagnostics/02-02-SUMMARY.md`

## Current Behavior

### 1. User sees coarse percentage logs, not real stage transitions

- `runIndexCommand()` in `src/cli.ts` only logs `索引进度: {percent}% - {message}` when progress crosses a 30% threshold.
- `scan()` in `src/scanner/index.ts` emits only a few generic messages like `正在准备向量索引...`, `正在生成向量嵌入...`, and final `索引完成`.
- There is no explicit user-visible `crawl -> process -> chunk/embed -> persist` contract, so VIS-01 is not satisfied.

### 2. Skipped-file counts exist, but skipped reasons are not structured

- `ProcessResult` has `status` and optional `error`, but `src/scanner/processor.ts` stores skip causes as free-form strings such as `File too large (...)`, `Binary file detected (...)`, and `Lock file or node_modules JSON`.
- `src/scanner/index.ts` only counts `skipped` totals; it does not produce a stable reason distribution.
- Files with zero chunks are counted as skipped inside `src/indexer/index.ts`, but their cause is only implied by control flow and not surfaced as a reusable bucket.

### 3. Final CLI summary is success-only and too generic for edge cases

- `runIndexCliCommand()` in `src/index.ts` prints the same success template whenever `runIndexCommand()` resolves: `索引完成 (...)` plus one stats line.
- Failure output still comes from the Phase 1/2 single verdict path, without partial Phase 3 stats or specialized edge-case conclusions.
- Cases like “no indexable changes”, “delete/self-heal only”, or “failed before embedding started” are not distinguished.

## Constraints Confirmed from Context

- **D-01 / D-02 / D-03:** user-visible progress must be stage-first, not percentage-first; required stages are `crawl`, `process`, `chunk/embed`, `persist`, and embedding keeps batch counts.
- **D-04 / D-05 / D-06:** final output must show skipped total plus reason buckets, reusing current pipeline causes instead of inventing a disconnected taxonomy, and must not print per-file path lists by default.
- **D-07 / D-08 / D-09:** success and failure summaries must be separate templates; failure summary must stay honest, show failure stage, and only include safe known stats.
- **D-10 / D-11:** edge cases need dedicated conclusion lines rather than forcing everything into one generic template.
- **Phase 1 carry-forward:** no success-only wording on failure.
- **Phase 2 carry-forward:** provider diagnostics remain rendered at the CLI boundary after the failure verdict; Phase 3 must layer on top of that, not replace it.

## Recommended Design

### A. Promote visibility data into stable scanner contracts

Extend scanner-side contracts instead of letting CLI infer semantics from ad hoc strings.

Recommended additions in `src/scanner/index.ts` and `src/scanner/processor.ts`:

- `IndexStage = 'crawl' | 'process' | 'chunk/embed' | 'persist'`
- `SkipReasonBucket = 'large_file' | 'binary_file' | 'ignored_json' | 'no_indexable_chunks' | 'processing_error'`
- `ScanStats.skippedByReason: Partial<Record<SkipReasonBucket, number>>`
- `ScanStats.visibility` carrying safe counts needed for summaries, such as processed files, embedding file count, deleted count, and self-heal count
- a typed stage error (for example `ScanStageError`) that carries `stage` plus `partialStats`

Why here:

- `src/scanner/processor.ts` knows the real skip causes.
- `src/scanner/index.ts` already orchestrates the full indexing pipeline and is the right place to attach stage semantics and partial stats.
- `src/index.ts` should only render, not guess whether `chunks.length === 0` means “skip because no indexable chunks”.

### B. Make stage progress message-driven, not percentage-driven

Keep the existing `onProgress(current, total, message)` callback shape, but make the `message` authoritative and stage-specific.

Recommended emitted messages:

- `阶段 crawl: 发现 {N} 个候选文件`
- `阶段 process: 已处理 {completed}/{total} 个文件`
- `阶段 chunk/embed: 待嵌入 {N} 个文件`
- `阶段 chunk/embed: 已完成 {completed}/{total} 个批次`
- `阶段 persist: 正在同步 SQLite / LanceDB / FTS`

Then update `runIndexCommand()` to log those stage messages directly and stop using the current 30% gating. This satisfies D-01/D-02 while still reusing the existing callback chain.

### C. Keep final summary rendering in `src/index.ts`

The CLI boundary should continue to own user-facing verdicts, but Phase 3 needs two distinct renderers:

- **Success template**
  - first line is a conclusion, not just a duration line
  - include the existing numeric stats
  - include `跳过原因: ...` buckets when `skipped > 0`
- **Failure template**
  - first line is `索引失败: ...`
  - include `失败阶段: {stage}`
  - include safe partial stats if available
  - then preserve Phase 2 diagnostics block when the failure is an `EmbeddingFatalError`

Recommended conclusion lines for D-10/D-11:

- normal success: `索引完成：索引已更新`
- no indexable changes: `索引完成：没有检测到新的可索引变更`
- delete/self-heal only: `索引完成：已同步删除或自愈，无新增向量嵌入`
- pre-embed failure: `索引失败：在 {stage} 阶段终止`

## Testing Strategy

### High-value automated tests

1. **Scanner visibility contract tests**
   - skipped reasons are bucketed into stable keys
   - zero-chunk files surface as `no_indexable_chunks`
   - stage failure preserves `stage` and `partialStats`

2. **Index progress logging tests**
   - `runIndexCommand()` logs stage lines instead of `索引进度: 30%`
   - embedding stage includes batch counts
   - persist stage is visible when vector/FTS/metadata writes begin

3. **CLI summary tests**
   - success and failure templates are separate
   - skipped reason buckets appear on success when relevant
   - failure summary stays honest and preserves Phase 2 diagnostics
   - edge-case conclusion lines are specialized

## Common Pitfalls to Avoid

- Do not reintroduce percent-only output as the primary user signal.
- Do not build skip buckets by parsing localized CLI strings at the top layer.
- Do not show per-file skipped paths by default; D-06 explicitly rejects that as the default terminal shape.
- Do not let failure summary reuse `索引完成` or success-only statistic wording.
- Do not drop Phase 2 diagnostics block while adding Phase 3 failure summary metadata.

## Validation Architecture

Phase 3 can use the current Vitest setup; no Wave 0 infra work is needed.

- **Quick run:** `pnpm test -- tests/scanner/indexVisibility.test.ts tests/indexVisibilityProgress.test.ts tests/indexVisibilitySummary.test.ts`
- **Build sanity:** `pnpm build`
- **Requirements mapping:**
  - `VIS-01` -> stage progress contract + CLI progress logging tests
  - `VIS-02` -> skip-reason bucket tests + success summary skip distribution assertions
  - `VIS-03` -> separate success/failure summary tests with edge-case conclusions

## Planning Implications

Recommended plan split:

- **Plan 01 (Wave 1):** establish scanner visibility contracts, skip-reason buckets, and partial failure stats
- **Plan 02 (Wave 2):** render stage-based progress logs in the command flow
- **Plan 03 (Wave 2):** render honest final success/failure summaries and edge-case conclusions

This keeps interface-producing work first, then lets the progress and summary plans implement against the same scanner contract in parallel.
