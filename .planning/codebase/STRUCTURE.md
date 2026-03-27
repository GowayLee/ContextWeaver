# Codebase Structure

**Analysis Date:** 2026-03-31

## Directory Layout

```text
ContextWeaver/
├── src/                 # TypeScript application source for CLI, indexing, search, and storage
├── skills/              # Bundled distributable skill assets copied by `contextweaver install-skills`
├── tests/               # Vitest suites for CLI helpers, retrieval, prompt context, scanner, and skills
├── .github/workflows/   # Release automation for npm publish and GitHub release creation
├── assets/              # Repository documentation assets such as `assets/architecture.png`
├── package.json         # Package metadata, scripts, binaries, runtime dependencies
├── tsconfig.json        # TypeScript compiler settings
├── vitest.config.ts     # Test runner configuration
├── biome.json           # Formatting/linting configuration
└── cwconfig.json        # Repository-local indexing scope configuration template/example
```

## Directory Purposes

**`src/`:**

- Purpose: All runtime code shipped in the npm package.
- Contains: CLI entrypoint, config loading, scanner, chunker, indexer, storage adapters, retrieval pipeline, prompt context helpers.
- Key files: `src/index.ts`, `src/cli.ts`, `src/config.ts`

**`src/api/`:**

- Purpose: Outbound API clients.
- Contains: embedding and reranker HTTP clients.
- Key files: `src/api/embedding.ts`, `src/api/reranker.ts`

**`src/chunking/`:**

- Purpose: Semantic chunk generation.
- Contains: parser pool, language specs, source index-domain adapter, semantic splitter.
- Key files: `src/chunking/SemanticSplitter.ts`, `src/chunking/ParserPool.ts`, `src/chunking/LanguageSpec.ts`

**`src/scanner/`:**

- Purpose: Repo traversal, filtering, content reading, and file diffing.
- Contains: crawler, language detection, hashing, processor, scan orchestrator.
- Key files: `src/scanner/index.ts`, `src/scanner/processor.ts`, `src/scanner/crawler.ts`

**`src/db/`:**

- Purpose: SQLite metadata and file-level persistence.
- Contains: schema creation, FTS initialization hooks, metadata helpers, project identity helpers.
- Key files: `src/db/index.ts`

**`src/indexer/`:**

- Purpose: Embedding plus vector-index write orchestration.
- Contains: `Indexer` service and singleton factory cache.
- Key files: `src/indexer/index.ts`

**`src/search/`:**

- Purpose: Retrieval, ranking, graph expansion, and packing.
- Contains: search config, FTS helpers, `SearchService`, `GraphExpander`, `ContextPacker`, resolver implementations.
- Key files: `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/search/ContextPacker.ts`, `src/search/resolvers/index.ts`

**`src/retrieval/`:**

- Purpose: Stable module-level API for code context retrieval and rendering.
- Contains: result DTOs, formatting helpers, search orchestration.
- Key files: `src/retrieval/index.ts`

**`src/promptContext/`:**

- Purpose: Prompt enhancement evidence packaging.
- Contains: prompt language detection, technical term extraction, retrieval flattening.
- Key files: `src/promptContext/index.ts`, `src/promptContext/detect.ts`, `src/promptContext/technicalTerms.ts`

**`src/utils/`:**

- Purpose: Shared infrastructure helpers.
- Contains: logger, lock management, encoding conversion.
- Key files: `src/utils/logger.ts`, `src/utils/lock.ts`, `src/utils/encoding.ts`

**`skills/`:**

- Purpose: Agent-facing assets bundled with the package.
- Contains: markdown instructions, templates, and helper scripts.
- Key files: `skills/using-contextweaver/SKILL.md`, `skills/using-contextweaver/scripts/search-context.mjs`, `skills/enhancing-prompts/SKILL.md`, `skills/enhancing-prompts/scripts/prepare-enhancement-context.mjs`

**`tests/`:**

- Purpose: Project-level tests under the `vitest.config.ts` include pattern.
- Contains: top-level `*.test.ts` files plus feature subdirectories.
- Key files: `tests/indexCli.test.ts`, `tests/retrieval/index.test.ts`, `tests/promptContext/index.test.ts`, `tests/scanner/filter.test.ts`

## Key File Locations

**Entry Points:**

- `src/index.ts`: Main executable entrypoint and command registration.
- `src/cli.ts`: Command helpers and orchestration utilities used by `src/index.ts`.
- `src/retrieval/index.ts`: Reusable retrieval API behind the `search` command.
- `src/promptContext/index.ts`: Reusable prompt evidence API behind `prompt-context`.

**Configuration:**

- `src/config.ts`: Environment variable loading and API config access.
- `src/projectConfig.ts`: `cwconfig.json` schema, defaults, and serialization.
- `tsconfig.json`: TypeScript compile boundaries (`src/**/*.ts`).
- `vitest.config.ts`: Test discovery (`tests/**/*.test.ts`).
- `biome.json`: Formatter/linter settings for source code.

**Core Logic:**

- `src/scanner/index.ts`: End-to-end scan pipeline.
- `src/indexer/index.ts`: Vector indexing and FTS synchronization.
- `src/search/SearchService.ts`: Hybrid retrieval orchestration.
- `src/search/GraphExpander.ts`: Post-recall context expansion.
- `src/chunking/SemanticSplitter.ts`: AST-based chunking engine.

**Testing:**

- `tests/indexCli.test.ts`: CLI helper behavior.
- `tests/projectConfig.test.ts`: project config parsing and defaults.
- `tests/retrieval/index.test.ts`: retrieval rendering and flow.
- `tests/promptContext/index.test.ts`: prompt context behavior.

## Module Boundaries

**Keep command wiring in `src/index.ts`:**

- Add a new CLI command here only when it is user-invoked from the terminal.
- Move business logic into a dedicated module under `src/` and keep `src/index.ts` as thin orchestration.

**Keep repo scanning concerns inside `src/scanner/`:**

- File discovery, filter checks, hash/mtime change detection, and raw file reading belong here.
- Do not place embedding, vector writes, or retrieval logic in this directory.

**Keep chunk semantics inside `src/chunking/`:**

- Parser setup, AST traversal, and chunk metadata generation belong here.
- New language-aware split behavior should extend `src/chunking/LanguageSpec.ts` or related chunking modules, not `src/scanner/`.

**Keep persistent storage adapters isolated:**

- SQLite and project identity logic belong in `src/db/index.ts`.
- LanceDB record and query logic belong in `src/vectorStore/index.ts`.
- Registry bookkeeping across repositories belongs in `src/indexRegistry.ts`.

**Keep retrieval logic inside `src/search/` and `src/retrieval/`:**

- Ranking, recall, expansion, and packing should stay in `src/search/`.
- Output DTO shaping and text/JSON rendering should stay in `src/retrieval/index.ts`.

## Naming Conventions

**Files:**

- Service/adapter classes use PascalCase filenames: `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/chunking/SemanticSplitter.ts`.
- Utility and module files use lowercase or camel-style nouns: `src/config.ts`, `src/projectConfig.ts`, `src/indexRegistry.ts`, `src/scanner/processor.ts`.
- Tests use `*.test.ts` under `tests/`: `tests/indexRegistry.test.ts`.

**Directories:**

- Runtime source directories are lowercase by responsibility: `src/search/`, `src/scanner/`, `src/vectorStore/`.
- Skill package directories are kebab-case: `skills/using-contextweaver/`, `skills/enhancing-prompts/`.

## Where to Add New Code

**New CLI Feature:**

- Primary code: add command registration in `src/index.ts`.
- Orchestration/helper logic: extend `src/cli.ts` or create a focused module under `src/`.
- Tests: add `tests/<feature>.test.ts` or a scoped file under `tests/<feature>/`.

**New Retrieval Behavior:**

- Recall/ranking/packing logic: `src/search/`.
- User-visible output shape: `src/retrieval/index.ts`.
- Prompt-oriented reuse: `src/promptContext/index.ts` only if the behavior changes prompt evidence packaging.

**New Language Support:**

- Chunk parsing support: `src/chunking/ParserPool.ts` and `src/chunking/LanguageSpec.ts`.
- Extension mapping: `src/scanner/language.ts`.
- Cross-file import resolution: add a resolver in `src/search/resolvers/` and register it in `src/search/resolvers/index.ts`.

**New Storage/Index Metadata:**

- SQLite-backed metadata: `src/db/index.ts`.
- Vector-backed chunk operations: `src/vectorStore/index.ts`.
- Cross-project registry state: `src/indexRegistry.ts`.

**Utilities:**

- Shared process-wide helpers: `src/utils/`.
- Avoid placing general-purpose helpers directly in feature directories unless they are feature-private.

## Special Directories

**`.github/workflows/`:**

- Purpose: Release automation.
- Generated: No.
- Committed: Yes.

**`skills/`:**

- Purpose: Distributed agent assets copied out by the CLI.
- Generated: No.
- Committed: Yes.

**`node_modules/`:**

- Purpose: Installed dependencies.
- Generated: Yes.
- Committed: No.

**`.planning/codebase/`:**

- Purpose: Generated repository analysis documents for downstream planning/execution.
- Generated: Yes.
- Committed: Repository-dependent; currently present as a workspace directory.

---

_Structure analysis: 2026-03-31_
