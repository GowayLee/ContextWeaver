# Phase 1: Fail-fast Exit - Research

**Date:** 2026-04-01
**Phase:** 01-fail-fast-exit
**Discovery level:** Level 0 — brownfield change on established indexing pipeline, no new dependency selection required

## Research Question

How should Phase 1 make `contextweaver index` fail fast after a fatal embedding error, while preserving the current 429/network retry behavior and ensuring the CLI never prints misleading success output?

## Code Paths Reviewed

- `src/api/embedding.ts`
- `src/indexer/index.ts`
- `src/scanner/index.ts`
- `src/cli.ts`
- `src/index.ts`
- `tests/indexCli.test.ts`
- `.planning/phases/01-fail-fast-exit/01-CONTEXT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`

## Current Behavior

### 1. Fatal embedding failure does not stop sibling batches cleanly

- `EmbeddingClient.embedBatch()` builds all batches up front and runs them with `Promise.all(...)`.
- `processWithRateLimit()` retries 429 and network failures, but every other error bubbles directly out of one batch.
- There is no shared fatal session state, so other batches can keep running until `Promise.all` rejects.
- Because there is no batch-level abort signal, late results can still complete and record progress after another batch already failed.

### 2. Indexer converts fatal embedding failure into a soft stats result

- `Indexer.batchIndex()` catches embedding failures, clears `vector_index_hash`, logs `Embedding 失败`, then returns `{ success: 0, errors: files.length }`.
- `Indexer.indexFiles()` still logs `向量索引完成` and returns `IndexStats` instead of throwing.
- That means upper layers cannot distinguish “scan finished with some stats” from “embedding failed fatally”.

### 3. Scanner and CLI always emit success-path completion text

- `scan()` always calls `options.onProgress?.(100, 100, '索引完成')` after `indexer.indexFiles(...)` returns.
- `src/index.ts` always prints `索引完成 (${duration}s)` and the success statistics if `runIndexCommand()` resolves.
- This directly conflicts with D-05, D-06, D-07 and SAFE-02.

## Constraints Confirmed from Context

- **D-01 / D-02:** Keep current 429 and network retry behavior; Phase 1 must not introduce provider-specific fatal classification.
- **D-03 / D-04:** First post-retry fatal embedding failure must flip shared fatal state, stop not-yet-started batches, best-effort cancel in-flight requests, and discard late results.
- **D-05 / D-06 / D-07 / D-08:** Failure output must report a failure verdict plus stage context, and must not print `索引完成`, `向量索引完成`, or success statistics after fatal failure.

## Recommended Design

### A. Add a shared fatal embedding session in `src/api/embedding.ts`

Introduce a per-`embedBatch()` session object instead of relying only on the process-global rate limiter:

- `fatalError: Error | null`
- `startedBatchCount`
- `completedBatchCount`
- `AbortController[]` for in-flight requests
- helper methods like `markFatal(error)`, `throwIfFatalBeforeStart()`, `registerController()`, `abortInFlight()`, `discardLateSuccess()`

Why this shape fits the codebase:

- It keeps CLI exit logic at the boundary (`src/index.ts`), matching repository conventions.
- It localizes fail-fast semantics to embedding orchestration instead of spreading low-level `process.exit()` calls.
- It preserves current rate-limit retry logic because the session wraps batch lifecycle, not provider classification.

### B. Throw a dedicated fatal indexing error from the indexer

`Indexer.batchIndex()` should stop returning a soft `{ success: 0, errors: files.length }` on embedding fatal failure.

Instead:

- clear `vector_index_hash` for all files in the failing indexing set
- throw a typed error carrying stage context, for example `stage: 'embed'`
- suppress `向量索引完成` when the indexer exits through that fatal path

This is the key change that lets scanner and CLI differentiate true success from fail-fast termination.

### C. Keep stage context flowing upward through scanner -> CLI -> entrypoint

Recommended propagation chain:

1. `src/api/embedding.ts` throws a fatal embedding error
2. `src/indexer/index.ts` wraps/normalizes it as indexing-stage fatal error
3. `src/scanner/index.ts` rethrows with scan-stage context and skips `onProgress(..., '索引完成')`
4. `src/index.ts` catches it, logs a failure verdict with stage context, exits non-zero, and never prints success stats

This respects the current layering already documented in `ARCHITECTURE.md`.

## Implementation Notes

### Best-effort cancel

- Use `AbortController` on each `fetch()` call in `processBatch()`.
- When the first fatal failure is confirmed, abort registered in-flight requests.
- Treat `AbortError` triggered by a prior fatal failure as expected cleanup, not as a new failure category.

### Late-result discard

- After `fetch()` resolves but before `progress.recordBatch(...)` or returning embeddings, check whether session is already fatal.
- If fatal, drop the result and throw/return through the fatal path so no progress or success bookkeeping advances.

### Logging boundary

- `src/api/embedding.ts` and `src/indexer/index.ts` may still log debug/error details.
- Human-facing final verdict belongs in `src/index.ts`.
- `src/scanner/index.ts` should avoid success progress message once a fatal error is thrown.

## Testing Strategy

Repository test coverage is thin around indexing internals, so Phase 1 should add targeted regression tests before code changes.

### High-value automated tests

1. **Embedding session test**
   - first batch fails fatally after retries
   - unstarted batches never begin
   - late successful batch does not report progress or return embeddings

2. **Indexer fatal propagation test**
   - embedding fatal failure clears `vector_index_hash`
   - `indexFiles()` throws instead of returning success stats
   - `向量索引完成` is not logged on fatal exit

3. **CLI failure verdict test**
   - when scan/index path throws fatal embed-stage error, top-level command exits non-zero
   - no `索引完成` success line or success statistics are logged
   - failure log contains stage context such as `向量嵌入阶段失败`

## Common Pitfalls to Avoid

- Do not change 429/network retries into immediate fatal failures in Phase 1.
- Do not add provider classification or diagnostic taxonomy yet; that belongs to Phase 2.
- Do not let scanner/CLI reuse success-only strings on the failure path.
- Do not swallow fatal embedding errors into `IndexStats.errors`; that recreates the misleading-success problem.

## Validation Architecture

Phase 1 can be validated with the existing Vitest setup. No Wave 0 infra work is needed.

- **Quick run:** `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts tests/indexCli.test.ts`
- **Build sanity:** `pnpm build`
- **Requirements mapping:**
  - SAFE-01 -> embedding session + indexer fatal propagation tests
  - SAFE-02 -> CLI failure verdict tests

## Planning Implications

Recommended plan split:

- **Plan 01 (Wave 1):** add fail-fast embedding/indexer tests and implement fatal propagation contract
- **Plan 02 (Wave 2):** wire scanner/CLI failure verdicts and suppress misleading success output

This keeps shared-file overlap low and matches the actual dependency chain: embedding/indexer contract first, CLI wording second.
