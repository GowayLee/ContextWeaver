<!-- GSD:project-start source:PROJECT.md -->

## Project

**ContextWeaver**

ContextWeaver 是一个面向 AI Agent 的代码语义检索上下文引擎，由本地 CLI 和可分发 Skill 资产组成。它为本地代码库提供索引、混合搜索、上下文扩展和 prompt 证据准备能力，当前工作重点是在保留既有能力的前提下修复索引链路中的稳定性问题。

**Core Value:** Agent 能稳定、可信地从本地代码库中获得可用的检索结果与上下文证据，而不是在索引或搜索主链路中遇到误导性成功状态或难以诊断的失败。

### Constraints

- **Product shape**: 保持本地 CLI + Skill 的产品形态不变 — 当前 README、发布流程和用户心智都围绕这一模式建立
- **Tech stack**: 继续使用 Node.js + TypeScript + SQLite + LanceDB + 外部 Embedding/Rerank API — 这是现有实现与发布资产的基础
- **Brownfield compatibility**: 修复必须尽量复用现有命令接口与工作流 — 避免为了修 bug 打断已有用户脚本和文档
- **Failure semantics**: 上游 Embedding API 出错时以立即失败并退出为准 — 这是当前明确确认的目标行为
- **Diagnostics**: 错误输出必须比现在更可诊断，但不能泄露敏感凭据 — 社区需要定位线索，同时日志仍需安全可分享
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.x - 应用源码集中在 `src/**/*.ts`，编译入口是 `src/index.ts`，TypeScript 版本声明在 `package.json`
- JavaScript (ESM runtime output) - 构建产物发布到 `dist/**/*.js`，CLI bin 指向 `dist/index.js`，定义在 `package.json`
- Markdown - 用户文档和 Skill 文档位于 `README.md`、`README.en.md`、`skills/**/SKILL.md`
- YAML - 发布流水线定义位于 `.github/workflows/release.yml`

## Runtime

- Node.js >= 20 - 通过 `package.json` 的 `engines.node` 约束；运行模式是 ESM，见 `package.json` 的 `"type": "module"`
- pnpm - 项目脚本和 CI 都使用 pnpm，见 `package.json` 与 `.github/workflows/release.yml`
- Lockfile: present (`pnpm-lock.yaml`)

## Frameworks

- Node.js CLI + `cac` - 命令行入口和子命令定义在 `src/index.ts`
- Tree-sitter (`@keqingmoe/tree-sitter` + 多语言 grammar 包) - AST 分块和多语言解析，核心实现在 `src/chunking/SemanticSplitter.ts`、`src/chunking/ParserPool.ts`
- LanceDB (`@lancedb/lancedb`) - 向量索引存储，适配层位于 `src/vectorStore/index.ts`
- SQLite FTS5 (`better-sqlite3`) - 元数据和全文检索存储，初始化位于 `src/db/index.ts`、`src/search/fts.ts`
- Zod - 输入/配置校验依赖，声明在 `package.json`
- Vitest 4.x - 测试运行器，配置在 `vitest.config.ts`，测试文件位于 `tests/**/*.test.ts`
- tsup - ESM + d.ts 构建与 watch，脚本定义在 `package.json`
- TypeScript compiler - 语言和类型检查配置在 `tsconfig.json`
- Biome - 格式化和 lint，配置在 `biome.json`

## Key Dependencies

- `@lancedb/lancedb` - 向量召回底座；`src/vectorStore/index.ts` 负责 `vectors.lance` 读写
- `better-sqlite3` - 元数据、FTS 和项目索引状态；`src/db/index.ts` 负责 `index.db`
- `@keqingmoe/tree-sitter` 及 `tree-sitter-*` - 语义切分和多语言支持；使用点在 `src/chunking/*.ts`
- `cac` - CLI 命令解析；使用点在 `src/index.ts`
- `dotenv` - 环境变量加载；使用点在 `src/config.ts`
- `pino` - 结构化日志，实现在 `src/utils/logger.ts`
- `fdir` - 文件扫描，使用点在 `src/scanner/crawler.ts`
- `ignore` - `.gitignore` / 项目忽略规则处理，使用点在 `src/scanner/filter.ts`
- `p-limit` - 索引处理并发控制，使用点在 `src/scanner/processor.ts`
- `chardet` + `iconv-lite` - 文件编码检测与转换，使用点在 `src/utils/encoding.ts`

## Configuration

- 统一从 `src/config.ts` 加载环境变量；开发模式优先读取项目根目录的 `.env`，生产模式读取 `~/.contextweaver/.env`
- 运行搜索和索引前需要配置 `EMBEDDINGS_API_KEY`、`EMBEDDINGS_BASE_URL`、`EMBEDDINGS_MODEL`、`RERANK_API_KEY`、`RERANK_BASE_URL`、`RERANK_MODEL`，校验逻辑在 `src/config.ts`
- 项目级索引范围通过 `cwconfig.json` 控制，读取逻辑在 `src/projectConfig.ts`
- 仓库内未检测到 `.env*` 文件；运行时配置入口由 `src/index.ts` 和 `src/retrieval/index.ts` 在用户目录生成示例文件
- 构建配置由 `package.json` 脚本驱动：`build`、`build:release`、`dev`
- TypeScript 编译目标为 ES2022，模块解析为 Bundler，见 `tsconfig.json`
- 代码格式和 lint 规则使用 `biome.json`
- npm 发布流水线定义在 `.github/workflows/release.yml`

## Platform Requirements

- 需要 Node.js 20+、pnpm 10（CI 在 `.github/workflows/release.yml` 中显式安装 pnpm 10）
- 需要可用的 Embedding 与 Rerank HTTP API 凭据，入口由 `src/config.ts` 读取
- 本地运行会在用户目录 `~/.contextweaver/` 下创建 `.env`、日志和索引文件，相关代码在 `src/index.ts`、`src/utils/logger.ts`、`src/db/index.ts`、`src/vectorStore/index.ts`
- 交付形态是 npm 全局 CLI 包 `@haurynlee/contextweaver`，发布目标见 `package.json` 与 `.github/workflows/release.yml`
- 运行产物是本地命令行工具，不存在独立服务端部署清单；执行入口始终是 `dist/index.js`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Use `camelCase.ts` for most utility and feature modules, for example `src/projectConfig.ts`, `src/indexRegistry.ts`, `src/utils/logger.ts`, and `src/promptContext/technicalTerms.ts`.
- Use `PascalCase.ts` for class-centric modules, especially under `src/search/` and `src/chunking/`, for example `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/search/ContextPacker.ts`, and `src/chunking/SemanticSplitter.ts`.
- Keep test files under `tests/` with `*.test.ts` naming, for example `tests/indexCli.test.ts` and `tests/scanner/filter.test.ts`.
- Use `camelCase` for functions and methods, for example `buildPromptContext` in `src/promptContext/index.ts`, `loadProjectConfig` in `src/projectConfig.ts`, and `buildIndexScopeLogLines` in `src/cli.ts`.
- Prefer verb-led names for side-effecting helpers, such as `installBundledSkills` in `src/cli.ts`, `recordIndexedProject` in `src/cli.ts`, and `cleanupOldLogs` in `src/utils/logger.ts`.
- Use `camelCase` for local variables and object fields, such as `projectConfig` in `src/scanner/filter.ts`, `technicalTerms` in `src/promptContext/index.ts`, and `directorySummaries` in `src/cli.ts`.
- Use `UPPER_SNAKE_CASE` for constants, for example `DEFAULT_API_KEY_PLACEHOLDER` in `src/config.ts`, `DEFAULT_EXCLUDE_PATTERNS` in `src/config.ts`, and `LOG_RETENTION_DAYS` in `src/utils/logger.ts`.
- Use `PascalCase` for `interface` and class names, for example `ProjectConfig` in `src/projectConfig.ts`, `SearchResult` in `src/retrieval/index.ts`, and `SearchService` in `src/search/SearchService.ts`.
- Use string-literal unions for small output modes, for example `PromptContextOutputFormat = 'json' | 'text'` in `src/promptContext/index.ts` and `SearchOutputFormat = 'text' | 'json'` in `src/retrieval/index.ts`.

## Code Style

- Use Biome from `biome.json`.
- Format with spaces, 2-space indentation, single quotes, and `lineWidth: 100` as configured in `biome.json`.
- Run `pnpm fmt`; the script targets `./src` in `package.json`, so test files are not auto-formatted by an npm script.
- Use Biome linting from `biome.json` with `recommended: true` and `style.noUnusedTemplateLiteral: error`.
- Keep code compatible with strict TypeScript in `tsconfig.json`: `strict: true`, `moduleResolution: 'Bundler'`, `verbatimModuleSyntax: true`.

## Import Organization

- No path aliases are configured in `tsconfig.json`; use explicit relative imports.
- In TypeScript source, relative ESM imports resolve with `.js` extensions, for example `import { logger } from './utils/logger.js'` in `src/index.ts`.

## Error Handling

- Throw explicit `Error` objects with actionable messages for invalid state or invalid input, for example `src/projectConfig.ts`, `src/indexRegistry.ts`, and `src/cli.ts`.
- Catch low-level errors, narrow them with `as NodeJS.ErrnoException` or small inline shapes, then branch on `err.code`, as in `src/cli.ts` and `src/projectConfig.ts`.
- Convert recoverable workflow failures into structured results instead of throwing when the caller needs a soft failure path, as in `buildPromptContext` in `src/promptContext/index.ts`.
- Exit the CLI at the boundary with `process.exit(1)` after logging, rather than deep inside shared helpers; this pattern appears in `src/index.ts`.

## Logging

- Use `logger.info`, `logger.warn`, `logger.error`, and `logger.debug` instead of raw `console.log`; `console.error` is reserved for pre-logger bootstrapping or stdout-safe internal cleanup in `src/config.ts` and `src/utils/logger.ts`.
- Prefer structured metadata objects with a human-readable message, for example `logger.info({ envFile }, '已创建默认 .env 配置文件')` in `src/retrieval/index.ts` and `logger.error({ err, stack: error.stack }, ...)` in `src/index.ts`.
- Guard expensive debug payload construction with `isDebugEnabled()` from `src/utils/logger.ts`.

## Comments

- Add block comments and section dividers around non-trivial module setup or multi-step algorithms, as in `src/config.ts`, `src/utils/logger.ts`, and `src/search/SearchService.ts`.
- Keep straightforward CRUD-style helpers mostly self-documenting; files like `src/projectConfig.ts` rely on names plus a few focused comments.
- Use TSDoc-style comments on exported helpers and config sections where behavior needs explanation, for example `src/config.ts`, `src/search/SearchService.ts`, and `src/scanner/filter.ts`.
- Tests in `tests/**/*.test.ts` generally skip comments and let descriptive `describe`/`it` titles carry intent.

## Function Design

- Keep public helpers compact when possible, but allow larger orchestration functions at module boundaries, such as `runIndexCommand` in `src/cli.ts` and `buildContextPack` in `src/search/SearchService.ts`.
- Prefer an `options` object for multi-argument workflows, for example `buildPromptContext` in `src/promptContext/index.ts`, `resolveSkillInstallTarget` in `src/cli.ts`, and `retrieveCodeContext` in `src/retrieval/index.ts`.
- Use typed callback parameters for pluggable behavior in workflow code, such as `retrieve?: (...) => Promise<SearchResult>` in `src/promptContext/index.ts`.
- Return typed objects for structured outputs, for example `PromptContextResult` from `src/promptContext/index.ts` and `SearchResult` from `src/retrieval/index.ts`.
- Use discriminated object shapes for stateful outcomes, as in `ensureProjectConfigForIndex` in `src/cli.ts`.

## Module Design

- Use named exports almost exclusively across `src/`; a repository-wide search did not detect application `export default` usage.
- Co-locate interfaces, types, constants, and exported helpers in the same file when they describe one module boundary, as in `src/projectConfig.ts` and `src/retrieval/index.ts`.
- Barrel files are used selectively where they represent a subsystem boundary, for example `src/scanner/index.ts`, `src/chunking/index.ts`, and `src/search/resolvers/index.ts`.
- Prefer importing from the concrete file when only one module is needed, especially in tests such as `tests/projectConfig.test.ts` and `tests/promptContext/index.test.ts`.

## Configuration Conventions

- Load environment configuration centrally from `src/config.ts`, and import that module first in the CLI entrypoint `src/index.ts`.
- Treat `cwconfig.json` at repo root as the canonical project-level config; validation and canonical serialization live in `src/projectConfig.ts`.
- Persist user-global runtime state under `~/.contextweaver`, following the paths used in `src/index.ts`, `src/retrieval/index.ts`, `src/indexRegistry.ts`, and `src/utils/logger.ts`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Pattern Overview

- `src/index.ts` is the single runtime entry point and wires all user-facing commands onto imported service functions.
- Indexing and search are separated into explicit pipelines: file discovery and processing live under `src/scanner/`, retrieval and expansion live under `src/search/`.
- Persistent state is split by responsibility: SQLite metadata/FTS in `src/db/index.ts`, LanceDB vectors in `src/vectorStore/index.ts`, and project registry bookkeeping in `src/indexRegistry.ts`.

## Layers

- Purpose: Parse CLI arguments, validate command prerequisites, and translate terminal input into service calls.
- Location: `src/index.ts`, `src/cli.ts`
- Contains: CAC command registration, interactive confirmations, preview logging, skill installation, cleanup orchestration.
- Depends on: `src/config.ts`, `src/scanner/index.ts`, `src/retrieval/index.ts`, `src/promptContext/index.ts`, `src/indexRegistry.ts`.
- Used by: End users invoking `contextweaver` or `cw` binaries declared in `package.json`.
- Purpose: Centralize environment loading and project-scoped indexing rules.
- Location: `src/config.ts`, `src/projectConfig.ts`
- Contains: env loading from `~/.contextweaver/.env`, embedding/reranker config getters, built-in exclude patterns, `cwconfig.json` parsing and validation.
- Depends on: Node filesystem/path modules and `dotenv`.
- Used by: CLI startup, scanner setup, API clients, search services.
- Purpose: Discover indexable files, detect changes, read content, infer language, and split content into semantic chunks.
- Location: `src/scanner/crawler.ts`, `src/scanner/filter.ts`, `src/scanner/processor.ts`, `src/scanner/index.ts`, `src/chunking/SemanticSplitter.ts`, `src/chunking/ParserPool.ts`
- Contains: include/ignore filtering, incremental file diffing by `mtime` and hash, AST-based chunking with plain-text fallback, scan progress reporting.
- Depends on: `src/config.ts`, `src/db/index.ts`, `src/indexer/index.ts`, `src/chunking/*`, `src/utils/encoding.ts`.
- Used by: `runIndexCommand()` in `src/cli.ts` and automatic indexing in `src/retrieval/index.ts`.
- Purpose: Store file metadata, raw content, FTS records, vector chunks, and index registry state.
- Location: `src/db/index.ts`, `src/search/fts.ts`, `src/vectorStore/index.ts`, `src/indexRegistry.ts`
- Contains: `files` and `metadata` SQLite tables, FTS initialization and updates, LanceDB `chunks` table, `~/.contextweaver/indexes.json` registry records.
- Depends on: `better-sqlite3`, `@lancedb/lancedb`, local project identity from `src/db/index.ts`.
- Used by: scanner, indexer, search, cleanup commands.
- Purpose: Turn processed chunks into embeddings, write vectors, synchronize FTS, and mark vector convergence.
- Location: `src/indexer/index.ts`, `src/api/embedding.ts`
- Contains: batch embedding, monotonic upsert strategy, chunk-to-record transformation, vector index hash self-healing.
- Depends on: `src/vectorStore/index.ts`, `src/db/index.ts`, `src/search/fts.ts`, `src/scanner/processor.ts`.
- Used by: `src/scanner/index.ts` during vector indexing.
- Purpose: Execute hybrid recall, rerank, expand graph context, and pack output for CLI/skills.
- Location: `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/search/ContextPacker.ts`, `src/search/resolvers/*`, `src/api/reranker.ts`
- Contains: vector recall, chunk/file FTS fallback, RRF fusion, rerank cutoff, same-file neighbor expansion, breadcrumb expansion, import resolution, budget-aware segment packing.
- Depends on: `src/db/index.ts`, `src/vectorStore/index.ts`, `src/search/config.ts`, `src/api/embedding.ts`, `src/api/reranker.ts`.
- Used by: `src/retrieval/index.ts` and indirectly by `src/promptContext/index.ts`.
- Purpose: Convert retrieval output into human-readable text or JSON and expose skill-ready evidence packages.
- Location: `src/retrieval/index.ts`, `src/promptContext/index.ts`, `skills/using-contextweaver/`, `skills/enhancing-prompts/`
- Contains: search result rendering, prompt-context evidence extraction, bundled skill assets and helper scripts.
- Depends on: retrieval/search services and CLI validation helpers.
- Used by: `search`, `prompt-context`, and `install-skills` commands from `src/index.ts`.

## Data Flow

- Persistent repository state is file-backed under `~/.contextweaver/` rather than kept in-process.
- `src/db/index.ts` stores file metadata, raw content, and indexing metadata per `projectId`.
- `src/vectorStore/index.ts` stores chunk vectors per `projectId` in `vectors.lance`.
- `src/indexRegistry.ts` stores cross-project bookkeeping and confirmation state in `~/.contextweaver/indexes.json`.
- Runtime singleton caches are process-local Maps inside `src/indexer/index.ts` and `src/vectorStore/index.ts`.

## Key Abstractions

- Purpose: Stable key for all persisted artifacts of one indexed repository.
- Examples: `src/db/index.ts`, `src/indexRegistry.ts`, `src/retrieval/index.ts`
- Pattern: `projectPath + birthtime -> md5 -> 10-char projectId`.
- Purpose: Canonical handoff object from scanner/processor to indexer.
- Examples: `src/scanner/processor.ts`, `src/scanner/index.ts`, `src/indexer/index.ts`
- Pattern: status-driven discriminated object carrying content, hash, language, chunks, and file metadata.
- Purpose: Represent retrieval units across storage, ranking, and final output.
- Examples: `src/vectorStore/index.ts`, `src/search/types.ts`, `src/search/ContextPacker.ts`
- Pattern: vector-store record -> scored retrieval candidate -> packed file segment.
- Purpose: Encapsulate language-specific import parsing for cross-file expansion.
- Examples: `src/search/resolvers/JsTsResolver.ts`, `src/search/resolvers/PythonResolver.ts`, `src/search/resolvers/index.ts`
- Pattern: pluggable strategy list built by `createResolvers()` and consumed by `GraphExpander`.

## Entry Points

- Location: `src/index.ts`
- Triggers: `contextweaver` / `cw` binaries from `package.json`.
- Responsibilities: load config first, print version, register commands, dispatch to services.
- Location: `src/cli.ts`
- Triggers: `contextweaver index`, `contextweaver init-project`, `contextweaver clean`, `contextweaver install-skills`.
- Responsibilities: confirmation-first preview, config bootstrapping, stale-index cleanup, bundled skill copying.
- Location: `src/retrieval/index.ts`
- Triggers: CLI `search` command and test calls from `tests/retrieval/index.test.ts`.
- Responsibilities: ensure env and index availability, execute search, render output.
- Location: `src/promptContext/index.ts`
- Triggers: CLI `prompt-context` command and tests under `tests/promptContext/`.
- Responsibilities: derive technical terms, reuse retrieval, flatten evidence for prompt enhancement.

## Error Handling

- CLI actions in `src/index.ts` wrap command bodies in `try/catch`, log via `src/utils/logger.ts`, and `process.exit(1)` on fatal failures.
- File processing in `src/scanner/processor.ts` downgrades unreadable, binary, oversized, or parse-failed files into `skipped`/`error` `ProcessResult` values.
- `src/indexer/index.ts` treats FTS sync failure as warning-only after successful vector writes, but clears vector convergence markers on embedding/vector write failure.
- `src/promptContext/index.ts` converts retrieval failures into `retrieval.status = 'error'` instead of throwing past the module boundary.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->
