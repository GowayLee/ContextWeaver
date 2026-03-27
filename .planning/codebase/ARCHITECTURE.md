# Architecture

**Analysis Date:** 2026-03-31

## Pattern Overview

**Overall:** CLI-first layered pipeline with persistent local indexing and retrieval services.

**Key Characteristics:**

- `src/index.ts` is the single runtime entry point and wires all user-facing commands onto imported service functions.
- Indexing and search are separated into explicit pipelines: file discovery and processing live under `src/scanner/`, retrieval and expansion live under `src/search/`.
- Persistent state is split by responsibility: SQLite metadata/FTS in `src/db/index.ts`, LanceDB vectors in `src/vectorStore/index.ts`, and project registry bookkeeping in `src/indexRegistry.ts`.

## Layers

**CLI / Command Layer:**

- Purpose: Parse CLI arguments, validate command prerequisites, and translate terminal input into service calls.
- Location: `src/index.ts`, `src/cli.ts`
- Contains: CAC command registration, interactive confirmations, preview logging, skill installation, cleanup orchestration.
- Depends on: `src/config.ts`, `src/scanner/index.ts`, `src/retrieval/index.ts`, `src/promptContext/index.ts`, `src/indexRegistry.ts`.
- Used by: End users invoking `contextweaver` or `cw` binaries declared in `package.json`.

**Configuration Layer:**

- Purpose: Centralize environment loading and project-scoped indexing rules.
- Location: `src/config.ts`, `src/projectConfig.ts`
- Contains: env loading from `~/.contextweaver/.env`, embedding/reranker config getters, built-in exclude patterns, `cwconfig.json` parsing and validation.
- Depends on: Node filesystem/path modules and `dotenv`.
- Used by: CLI startup, scanner setup, API clients, search services.

**Index Preparation Layer:**

- Purpose: Discover indexable files, detect changes, read content, infer language, and split content into semantic chunks.
- Location: `src/scanner/crawler.ts`, `src/scanner/filter.ts`, `src/scanner/processor.ts`, `src/scanner/index.ts`, `src/chunking/SemanticSplitter.ts`, `src/chunking/ParserPool.ts`
- Contains: include/ignore filtering, incremental file diffing by `mtime` and hash, AST-based chunking with plain-text fallback, scan progress reporting.
- Depends on: `src/config.ts`, `src/db/index.ts`, `src/indexer/index.ts`, `src/chunking/*`, `src/utils/encoding.ts`.
- Used by: `runIndexCommand()` in `src/cli.ts` and automatic indexing in `src/retrieval/index.ts`.

**Persistence Layer:**

- Purpose: Store file metadata, raw content, FTS records, vector chunks, and index registry state.
- Location: `src/db/index.ts`, `src/search/fts.ts`, `src/vectorStore/index.ts`, `src/indexRegistry.ts`
- Contains: `files` and `metadata` SQLite tables, FTS initialization and updates, LanceDB `chunks` table, `~/.contextweaver/indexes.json` registry records.
- Depends on: `better-sqlite3`, `@lancedb/lancedb`, local project identity from `src/db/index.ts`.
- Used by: scanner, indexer, search, cleanup commands.

**Indexing Orchestration Layer:**

- Purpose: Turn processed chunks into embeddings, write vectors, synchronize FTS, and mark vector convergence.
- Location: `src/indexer/index.ts`, `src/api/embedding.ts`
- Contains: batch embedding, monotonic upsert strategy, chunk-to-record transformation, vector index hash self-healing.
- Depends on: `src/vectorStore/index.ts`, `src/db/index.ts`, `src/search/fts.ts`, `src/scanner/processor.ts`.
- Used by: `src/scanner/index.ts` during vector indexing.

**Retrieval Layer:**

- Purpose: Execute hybrid recall, rerank, expand graph context, and pack output for CLI/skills.
- Location: `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/search/ContextPacker.ts`, `src/search/resolvers/*`, `src/api/reranker.ts`
- Contains: vector recall, chunk/file FTS fallback, RRF fusion, rerank cutoff, same-file neighbor expansion, breadcrumb expansion, import resolution, budget-aware segment packing.
- Depends on: `src/db/index.ts`, `src/vectorStore/index.ts`, `src/search/config.ts`, `src/api/embedding.ts`, `src/api/reranker.ts`.
- Used by: `src/retrieval/index.ts` and indirectly by `src/promptContext/index.ts`.

**Presentation / Skill Output Layer:**

- Purpose: Convert retrieval output into human-readable text or JSON and expose skill-ready evidence packages.
- Location: `src/retrieval/index.ts`, `src/promptContext/index.ts`, `skills/using-contextweaver/`, `skills/enhancing-prompts/`
- Contains: search result rendering, prompt-context evidence extraction, bundled skill assets and helper scripts.
- Depends on: retrieval/search services and CLI validation helpers.
- Used by: `search`, `prompt-context`, and `install-skills` commands from `src/index.ts`.

## Data Flow

**Indexing Flow:**

1. `src/index.ts` registers `index` and delegates to `runIndexCommand()` in `src/cli.ts`.
2. `runIndexCommand()` ensures `cwconfig.json` exists, previews scope via `buildIndexPreview()`, then calls `scan()` in `src/scanner/index.ts` under `src/utils/lock.ts`.
3. `scan()` initializes filters, loads known file metadata from `src/db/index.ts`, crawls the repo via `src/scanner/crawler.ts`, and processes files through `processFiles()` in `src/scanner/processor.ts`.
4. `processFiles()` reads text, detects language with `src/scanner/language.ts`, splits content through `src/chunking/SemanticSplitter.ts`, and returns chunk-rich `ProcessResult` objects.
5. `scan()` writes file metadata/content to SQLite, computes deletions, then hands changed and healing results to `Indexer.indexFiles()` in `src/indexer/index.ts`.
6. `Indexer` calls `src/api/embedding.ts`, writes chunk vectors into LanceDB with `src/vectorStore/index.ts`, syncs chunk FTS in `src/search/fts.ts`, and updates `vector_index_hash` in `src/db/index.ts`.

**Search Flow:**

1. `src/index.ts` registers `search` and invokes `retrieveCodeContext()` from `src/retrieval/index.ts`.
2. `retrieveCodeContext()` validates env vars, derives `projectId` using `getProjectIdentity()` from `src/db/index.ts`, and ensures the project is indexed.
3. `SearchService.buildContextPack()` in `src/search/SearchService.ts` runs vector recall through `Indexer.textSearch()` and lexical recall through FTS helpers in `src/search/fts.ts`.
4. `SearchService` fuses recall candidates, reranks them with `src/api/reranker.ts`, applies smart cutoff, and sends seed chunks into `GraphExpander`.
5. `GraphExpander` expands same-file neighbors, breadcrumb-related chunks, and language-specific import links using resolvers from `src/search/resolvers/`.
6. `ContextPacker` reads full file content from SQLite and emits segment groups by file; `src/retrieval/index.ts` renders the result as text or JSON.

**Prompt Context Flow:**

1. `prompt-context` in `src/index.ts` calls `buildPromptContext()` from `src/promptContext/index.ts`.
2. `src/promptContext/detect.ts` and `src/promptContext/technicalTerms.ts` derive language and technical terms from the prompt.
3. `buildPromptContext()` reuses `retrieveCodeContext()` with a tighter packing override and flattens returned segments into evidence objects.
4. `renderPromptContext()` emits a lightweight text or JSON summary for agent-side prompt enhancement scripts in `skills/enhancing-prompts/`.

**State Management:**

- Persistent repository state is file-backed under `~/.contextweaver/` rather than kept in-process.
- `src/db/index.ts` stores file metadata, raw content, and indexing metadata per `projectId`.
- `src/vectorStore/index.ts` stores chunk vectors per `projectId` in `vectors.lance`.
- `src/indexRegistry.ts` stores cross-project bookkeeping and confirmation state in `~/.contextweaver/indexes.json`.
- Runtime singleton caches are process-local Maps inside `src/indexer/index.ts` and `src/vectorStore/index.ts`.

## Key Abstractions

**Project Identity:**

- Purpose: Stable key for all persisted artifacts of one indexed repository.
- Examples: `src/db/index.ts`, `src/indexRegistry.ts`, `src/retrieval/index.ts`
- Pattern: `projectPath + birthtime -> md5 -> 10-char projectId`.

**ProcessResult:**

- Purpose: Canonical handoff object from scanner/processor to indexer.
- Examples: `src/scanner/processor.ts`, `src/scanner/index.ts`, `src/indexer/index.ts`
- Pattern: status-driven discriminated object carrying content, hash, language, chunks, and file metadata.

**ChunkRecord / ScoredChunk / Segment:**

- Purpose: Represent retrieval units across storage, ranking, and final output.
- Examples: `src/vectorStore/index.ts`, `src/search/types.ts`, `src/search/ContextPacker.ts`
- Pattern: vector-store record -> scored retrieval candidate -> packed file segment.

**ImportResolver:**

- Purpose: Encapsulate language-specific import parsing for cross-file expansion.
- Examples: `src/search/resolvers/JsTsResolver.ts`, `src/search/resolvers/PythonResolver.ts`, `src/search/resolvers/index.ts`
- Pattern: pluggable strategy list built by `createResolvers()` and consumed by `GraphExpander`.

## Entry Points

**CLI Binary:**

- Location: `src/index.ts`
- Triggers: `contextweaver` / `cw` binaries from `package.json`.
- Responsibilities: load config first, print version, register commands, dispatch to services.

**Index Command Orchestrator:**

- Location: `src/cli.ts`
- Triggers: `contextweaver index`, `contextweaver init-project`, `contextweaver clean`, `contextweaver install-skills`.
- Responsibilities: confirmation-first preview, config bootstrapping, stale-index cleanup, bundled skill copying.

**Retrieval API Entry:**

- Location: `src/retrieval/index.ts`
- Triggers: CLI `search` command and test calls from `tests/retrieval/index.test.ts`.
- Responsibilities: ensure env and index availability, execute search, render output.

**Prompt Evidence Entry:**

- Location: `src/promptContext/index.ts`
- Triggers: CLI `prompt-context` command and tests under `tests/promptContext/`.
- Responsibilities: derive technical terms, reuse retrieval, flatten evidence for prompt enhancement.

## Error Handling

**Strategy:** Fail fast at command boundaries, return structured statuses inside pipelines, and tolerate partial degradation where lower-priority subsystems fail.

**Patterns:**

- CLI actions in `src/index.ts` wrap command bodies in `try/catch`, log via `src/utils/logger.ts`, and `process.exit(1)` on fatal failures.
- File processing in `src/scanner/processor.ts` downgrades unreadable, binary, oversized, or parse-failed files into `skipped`/`error` `ProcessResult` values.
- `src/indexer/index.ts` treats FTS sync failure as warning-only after successful vector writes, but clears vector convergence markers on embedding/vector write failure.
- `src/promptContext/index.ts` converts retrieval failures into `retrieval.status = 'error'` instead of throwing past the module boundary.

## Cross-Cutting Concerns

**Logging:** `src/utils/logger.ts` is used across CLI, indexing, API, and retrieval modules for progress and failure reporting.
**Validation:** `src/config.ts` validates required env vars; `src/projectConfig.ts` validates `cwconfig.json`; `src/cli.ts` validates interactive confirmation requirements.
**Authentication:** External API authentication is header-based and pulled from env vars by `src/api/embedding.ts` and `src/api/reranker.ts`.

---

_Architecture analysis: 2026-03-31_
