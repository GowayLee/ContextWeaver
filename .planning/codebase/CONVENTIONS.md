# Coding Conventions

**Analysis Date:** 2026-03-31

## Naming Patterns

**Files:**

- Use `camelCase.ts` for most utility and feature modules, for example `src/projectConfig.ts`, `src/indexRegistry.ts`, `src/utils/logger.ts`, and `src/promptContext/technicalTerms.ts`.
- Use `PascalCase.ts` for class-centric modules, especially under `src/search/` and `src/chunking/`, for example `src/search/SearchService.ts`, `src/search/GraphExpander.ts`, `src/search/ContextPacker.ts`, and `src/chunking/SemanticSplitter.ts`.
- Keep test files under `tests/` with `*.test.ts` naming, for example `tests/indexCli.test.ts` and `tests/scanner/filter.test.ts`.

**Functions:**

- Use `camelCase` for functions and methods, for example `buildPromptContext` in `src/promptContext/index.ts`, `loadProjectConfig` in `src/projectConfig.ts`, and `buildIndexScopeLogLines` in `src/cli.ts`.
- Prefer verb-led names for side-effecting helpers, such as `installBundledSkills` in `src/cli.ts`, `recordIndexedProject` in `src/cli.ts`, and `cleanupOldLogs` in `src/utils/logger.ts`.

**Variables:**

- Use `camelCase` for local variables and object fields, such as `projectConfig` in `src/scanner/filter.ts`, `technicalTerms` in `src/promptContext/index.ts`, and `directorySummaries` in `src/cli.ts`.
- Use `UPPER_SNAKE_CASE` for constants, for example `DEFAULT_API_KEY_PLACEHOLDER` in `src/config.ts`, `DEFAULT_EXCLUDE_PATTERNS` in `src/config.ts`, and `LOG_RETENTION_DAYS` in `src/utils/logger.ts`.

**Types:**

- Use `PascalCase` for `interface` and class names, for example `ProjectConfig` in `src/projectConfig.ts`, `SearchResult` in `src/retrieval/index.ts`, and `SearchService` in `src/search/SearchService.ts`.
- Use string-literal unions for small output modes, for example `PromptContextOutputFormat = 'json' | 'text'` in `src/promptContext/index.ts` and `SearchOutputFormat = 'text' | 'json'` in `src/retrieval/index.ts`.

## Code Style

**Formatting:**

- Use Biome from `biome.json`.
- Format with spaces, 2-space indentation, single quotes, and `lineWidth: 100` as configured in `biome.json`.
- Run `pnpm fmt`; the script targets `./src` in `package.json`, so test files are not auto-formatted by an npm script.

**Linting:**

- Use Biome linting from `biome.json` with `recommended: true` and `style.noUnusedTemplateLiteral: error`.
- Keep code compatible with strict TypeScript in `tsconfig.json`: `strict: true`, `moduleResolution: 'Bundler'`, `verbatimModuleSyntax: true`.

## Import Organization

**Order:**

1. Node built-ins, for example `node:fs/promises`, `node:path`, `node:url` in `src/cli.ts` and `tests/indexCli.test.ts`
2. Third-party packages, for example `cac` in `src/index.ts`, `ignore` in `src/scanner/filter.ts`, and `pino` in `src/utils/logger.ts`
3. Local modules via relative paths ending in `.js`, for example `./projectConfig.js` in `src/cli.ts` and `../../src/promptContext/index.js` in `tests/promptContext/index.test.ts`

**Path Aliases:**

- No path aliases are configured in `tsconfig.json`; use explicit relative imports.
- In TypeScript source, relative ESM imports resolve with `.js` extensions, for example `import { logger } from './utils/logger.js'` in `src/index.ts`.

## Error Handling

**Patterns:**

- Throw explicit `Error` objects with actionable messages for invalid state or invalid input, for example `src/projectConfig.ts`, `src/indexRegistry.ts`, and `src/cli.ts`.
- Catch low-level errors, narrow them with `as NodeJS.ErrnoException` or small inline shapes, then branch on `err.code`, as in `src/cli.ts` and `src/projectConfig.ts`.
- Convert recoverable workflow failures into structured results instead of throwing when the caller needs a soft failure path, as in `buildPromptContext` in `src/promptContext/index.ts`.
- Exit the CLI at the boundary with `process.exit(1)` after logging, rather than deep inside shared helpers; this pattern appears in `src/index.ts`.

## Logging

**Framework:** Pino via `src/utils/logger.ts`

**Patterns:**

- Use `logger.info`, `logger.warn`, `logger.error`, and `logger.debug` instead of raw `console.log`; `console.error` is reserved for pre-logger bootstrapping or stdout-safe internal cleanup in `src/config.ts` and `src/utils/logger.ts`.
- Prefer structured metadata objects with a human-readable message, for example `logger.info({ envFile }, '已创建默认 .env 配置文件')` in `src/retrieval/index.ts` and `logger.error({ err, stack: error.stack }, ...)` in `src/index.ts`.
- Guard expensive debug payload construction with `isDebugEnabled()` from `src/utils/logger.ts`.

## Comments

**When to Comment:**

- Add block comments and section dividers around non-trivial module setup or multi-step algorithms, as in `src/config.ts`, `src/utils/logger.ts`, and `src/search/SearchService.ts`.
- Keep straightforward CRUD-style helpers mostly self-documenting; files like `src/projectConfig.ts` rely on names plus a few focused comments.

**JSDoc/TSDoc:**

- Use TSDoc-style comments on exported helpers and config sections where behavior needs explanation, for example `src/config.ts`, `src/search/SearchService.ts`, and `src/scanner/filter.ts`.
- Tests in `tests/**/*.test.ts` generally skip comments and let descriptive `describe`/`it` titles carry intent.

## Function Design

**Size:**

- Keep public helpers compact when possible, but allow larger orchestration functions at module boundaries, such as `runIndexCommand` in `src/cli.ts` and `buildContextPack` in `src/search/SearchService.ts`.

**Parameters:**

- Prefer an `options` object for multi-argument workflows, for example `buildPromptContext` in `src/promptContext/index.ts`, `resolveSkillInstallTarget` in `src/cli.ts`, and `retrieveCodeContext` in `src/retrieval/index.ts`.
- Use typed callback parameters for pluggable behavior in workflow code, such as `retrieve?: (...) => Promise<SearchResult>` in `src/promptContext/index.ts`.

**Return Values:**

- Return typed objects for structured outputs, for example `PromptContextResult` from `src/promptContext/index.ts` and `SearchResult` from `src/retrieval/index.ts`.
- Use discriminated object shapes for stateful outcomes, as in `ensureProjectConfigForIndex` in `src/cli.ts`.

## Module Design

**Exports:**

- Use named exports almost exclusively across `src/`; a repository-wide search did not detect application `export default` usage.
- Co-locate interfaces, types, constants, and exported helpers in the same file when they describe one module boundary, as in `src/projectConfig.ts` and `src/retrieval/index.ts`.

**Barrel Files:**

- Barrel files are used selectively where they represent a subsystem boundary, for example `src/scanner/index.ts`, `src/chunking/index.ts`, and `src/search/resolvers/index.ts`.
- Prefer importing from the concrete file when only one module is needed, especially in tests such as `tests/projectConfig.test.ts` and `tests/promptContext/index.test.ts`.

## Configuration Conventions

- Load environment configuration centrally from `src/config.ts`, and import that module first in the CLI entrypoint `src/index.ts`.
- Treat `cwconfig.json` at repo root as the canonical project-level config; validation and canonical serialization live in `src/projectConfig.ts`.
- Persist user-global runtime state under `~/.contextweaver`, following the paths used in `src/index.ts`, `src/retrieval/index.ts`, `src/indexRegistry.ts`, and `src/utils/logger.ts`.

---

_Convention analysis: 2026-03-31_
