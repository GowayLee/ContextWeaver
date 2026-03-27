# Codebase Concerns

**Analysis Date:** 2026-03-31

## Tech Debt

**Search-side singleton lifecycle and cache invalidation:**

- Issue: `GraphExpander` caches `allFilePaths` in memory and exposes `invalidateFileIndex()`, but no caller invokes it. `getGraphExpander()` also keeps a process-wide singleton in `expanders`, while scan teardown in `src/scanner/index.ts` only clears indexers/vector stores.
- Files: `src/search/GraphExpander.ts`, `src/scanner/index.ts`
- Impact: long-lived processes can resolve imports against stale file lists after reindexing, producing outdated or missing expansion results.
- Fix approach: add explicit search-side teardown/reset, or invoke `invalidateFileIndex()` after successful scans and before reuse.

**Core search/indexing logic is concentrated in very large files:**

- Issue: retrieval and indexing behavior is concentrated in large modules (`790` lines in `src/search/SearchService.ts`, `540` lines in `src/search/GraphExpander.ts`, `548` lines in `src/api/embedding.ts`, `527` lines in `src/chunking/SemanticSplitter.ts`).
- Files: `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/api/embedding.ts`, `src/chunking/SemanticSplitter.ts`, `src/indexer/index.ts`
- Impact: changes couple ranking, expansion, chunking, persistence, and network behavior; regressions are harder to isolate and review.
- Fix approach: split scoring, FTS fallback, import expansion, API transport, and chunk assembly into smaller testable units.

**FTS consistency is best-effort, not self-healing:**

- Issue: vector writes are treated as successful even when chunk FTS refresh fails; the code only logs a warning and still marks vector index state as converged.
- Files: `src/indexer/index.ts`, `src/db/index.ts`, `src/search/fts.ts`
- Impact: lexical recall can stay stale or incomplete indefinitely, while metadata says the file is fully indexed.
- Fix approach: track FTS health separately from `vector_index_hash`, or retry/fail the batch so lexical indexes cannot silently drift.

## Known Bugs

**AST parse failures on primary languages can permanently drop files from retrieval:**

- Symptoms: files with failed AST parsing can produce zero chunks, then be marked as settled via `batchUpdateVectorIndexHash()`, so later healing skips them.
- Files: `src/scanner/processor.ts`, `src/indexer/index.ts`
- Trigger: `processFile()` only plain-text-fallbacks languages in `FALLBACK_LANGS` (`python`, `go`, `rust`, `java`, `markdown`, `json`). For `typescript`, `javascript`, `c`, `cpp`, `c_sharp`, an AST failure leaves `chunks.length === 0`; `indexFiles()` then treats the file as converged.
- Workaround: force a code fix in parser/chunker or temporarily add a plain-text fallback for affected languages before reindexing.

**Large-file threshold is inconsistent with its own comment:**

- Symptoms: files above `100 * 1024` bytes are skipped even though the adjacent comment says `500KB`.
- Files: `src/scanner/processor.ts`
- Trigger: any source file between roughly 100KB and 500KB is silently excluded from indexing with status `skipped`.
- Workaround: adjust `MAX_FILE_SIZE` or the comment so operators know the real indexing ceiling.

## Security Considerations

**Indexed source code is persisted unencrypted in the user home directory:**

- Risk: full file contents are stored in SQLite and chunk text is stored in LanceDB under `~/.contextweaver/<projectId>/`, which increases local data exposure if the workstation or shared home directory is compromised.
- Files: `src/db/index.ts`, `src/vectorStore/index.ts`, `src/retrieval/index.ts`
- Current mitigation: project IDs are hashed and data stays local.
- Recommendations: add at-rest protection guidance, an opt-out for storing `files.content`, and cleanup tooling/policies for sensitive repos.

**Logs can capture query fragments and repository metadata:**

- Risk: debug/error logs include query excerpts, retry errors, repository paths, and index metadata; those logs are written to `~/.contextweaver/logs/`.
- Files: `src/api/reranker.ts`, `src/retrieval/index.ts`, `src/utils/logger.ts`
- Current mitigation: no API keys are explicitly logged in these paths.
- Recommendations: redact or hash user query text, reduce path detail in default logs, and document log sensitivity.

## Performance Bottlenecks

**Network calls have retries but no hard timeout/cancellation:**

- Problem: `fetch()` in embedding and reranker clients does not use `AbortController` or request deadlines.
- Files: `src/api/embedding.ts`, `src/api/reranker.ts`
- Cause: requests depend on remote completion and retry logic only handles errors after a response/failure arrives.
- Improvement path: add per-request timeout, global deadline propagation, and clearer failure classification for hung connections.

**Line-number calculation rescans file content repeatedly:**

- Problem: `ContextPacker.offsetToLine()` walks from the start of the file for every segment.
- Files: `src/search/ContextPacker.ts`
- Cause: line offsets are computed with repeated O(n) scans instead of a precomputed newline index.
- Improvement path: precompute newline positions once per file and binary-search them when building segments.

**Fallback lexical retrieval performs sequential per-file chunk reads:**

- Problem: file-level FTS fallback loops over files and awaits `getFileChunks()` one by one.
- Files: `src/search/SearchService.ts`
- Cause: `lexicalRetrieveFromFilesFts()` uses per-file reads instead of the available batch method.
- Improvement path: reuse `VectorStore.getFilesChunks()` here, as already done in chunk-FTS and graph expansion paths.

## Fragile Areas

**Graph expansion state survives scans but is not refreshed:**

- Files: `src/search/GraphExpander.ts`, `src/scanner/index.ts`
- Why fragile: `expanders` is never cleared, `db` handles stay attached to the singleton, and the only refresh hook is unused.
- Safe modification: if scan/search lifecycle changes, add a `closeAllGraphExpanders()` path and invalidate caches immediately after successful indexing.
- Test coverage: no dedicated tests exist under `tests/search/` for expander cache refresh or post-reindex behavior.

**Chunking fallback behavior depends on language allowlists:**

- Files: `src/scanner/processor.ts`, `src/chunking/ParserPool.ts`, `src/chunking/SemanticSplitter.ts`
- Why fragile: parser load failures are logged to console, but only selected languages receive plain-text fallback; unsupported failure modes become retrieval gaps instead of degraded search.
- Safe modification: treat parser failure as a first-class state and keep fallback policy aligned with the languages declared in `GRAMMAR_MODULES`.
- Test coverage: no dedicated tests exist under `tests/chunking/` or `tests/scanner/` for parser failure recovery.

## Scaling Limits

**Indexed file size ceiling:**

- Current capacity: files must be `<= 100 * 1024` bytes to be processed.
- Limit: larger source files are returned as `skipped` before hashing, chunking, or vectorization.
- Scaling path: make the threshold configurable and support streaming/plain-text indexing for oversized files.

**Search metadata grows with repository size:**

- Current capacity: `GraphExpander` loads all indexed paths into a `Set`, and SQLite stores full `content` for every indexed file.
- Limit: large monorepos increase memory pressure during expansion and disk usage under `~/.contextweaver/`.
- Scaling path: store slimmer metadata for expansion, add selective content persistence, and page large path indexes instead of loading all paths eagerly.

## Dependencies at Risk

**Native dependency surface is large:**

- Risk: `@lancedb/lancedb`, `better-sqlite3`, `@keqingmoe/tree-sitter`, and multiple `tree-sitter-*` grammar packages require native/binary compatibility.
- Impact: install/build failures or runtime incompatibilities can block indexing and retrieval on unsupported environments.
- Migration plan: keep Node/runtime requirements explicit, add startup diagnostics for native dependency health, and isolate vector/parser backends behind narrower adapters.

## Missing Critical Features

**No explicit health marker for lexical indexes:**

- Problem: vector/index metadata tracks `vector_index_hash`, but there is no equivalent convergence marker for `chunks_fts` or `files_fts`.
- Blocks: reliable self-healing after FTS write failures in `src/indexer/index.ts` and predictable lexical recall guarantees.

**No teardown path for search-side singletons:**

- Problem: there is no exported cleanup companion to `getGraphExpander()` even though scanner teardown already handles indexers/vector stores.
- Blocks: safe reuse in long-lived processes and deterministic post-scan behavior.

## Test Coverage Gaps

**Search, indexing, vector, and API transport flows are largely untested:**

- What's not tested: hybrid retrieval, SmartTopK, graph expansion, vector upsert/delete flows, embedding retry behavior, reranker failure handling, and chunking fallback behavior.
- Files: `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/indexer/index.ts`, `src/vectorStore/index.ts`, `src/api/embedding.ts`, `src/api/reranker.ts`, `src/chunking/SemanticSplitter.ts`, `src/scanner/processor.ts`
- Risk: ranking regressions, stale-index bugs, and network edge cases can ship unnoticed because current tests are concentrated in `tests/indexCli.test.ts`, `tests/projectConfig.test.ts`, `tests/scanner/filter.test.ts`, `tests/retrieval/index.test.ts`, `tests/promptContext/index.test.ts`, and `tests/skills/skillAssets.test.ts`.
- Priority: High

---

_Concerns audit: 2026-03-31_
