# Testing Patterns

**Analysis Date:** 2026-03-31

## Test Framework

**Runner:**

- Vitest `^4.0.18` from `package.json`
- Config: `vitest.config.ts`

**Assertion Library:**

- Vitest built-in `expect`, imported explicitly in files such as `tests/indexCli.test.ts` and `tests/projectConfig.test.ts`

**Run Commands:**

```bash
pnpm test              # Run all tests via `vitest run`
pnpm test:watch        # Watch mode via `vitest`
Not detected           # Coverage command is not defined in `package.json`
```

## Test File Organization

**Location:**

- Use a dedicated top-level `tests/` directory rather than co-located tests.
- Group tests by subsystem, for example `tests/scanner/filter.test.ts`, `tests/promptContext/index.test.ts`, `tests/retrieval/index.test.ts`, and `tests/skills/skillAssets.test.ts`.

**Naming:**

- Use `*.test.ts`; `vitest.config.ts` includes only `tests/**/*.test.ts`.

**Structure:**

```
tests/
├── indexCli.test.ts
├── indexRegistry.test.ts
├── projectConfig.test.ts
├── enhancer/
├── promptContext/
├── retrieval/
├── scanner/
└── skills/
```

## Test Structure

**Suite Organization:**

```typescript
describe("buildPromptContext", () => {
  it("builds deterministic evidence from the prompt and retrieval results", async () => {
    const retrieve = vi.fn().mockResolvedValue(createSearchResult());

    const result = await buildPromptContext({
      prompt: "...",
      repoPath: "/repo",
      retrieve,
    });

    expect(result.retrieval.status).toBe("ok");
  });
});
```

**Patterns:**

- Prefer one exported unit or workflow per `describe`, with dense, scenario-driven `it(...)` titles, as in `tests/projectConfig.test.ts` and `tests/scanner/filter.test.ts`.
- Use async tests heavily; most filesystem and CLI helper tests await real file operations.
- Assert full object shapes with `toEqual` for canonical outputs, for example in `tests/projectConfig.test.ts` and `tests/indexRegistry.test.ts`.
- Use `toMatchObject`, `toContain`, and `rejects/resolves` for partial or error-oriented checks, as in `tests/promptContext/index.test.ts` and `tests/indexCli.test.ts`.

## Mocking

**Framework:** Vitest `vi`

**Patterns:**

```typescript
const retrieve = vi.fn().mockResolvedValue(createSearchResult());

const result = await buildPromptContext({
  prompt: "...",
  repoPath: "/repo",
  retrieve,
});

await expect(
  buildPromptContext({
    prompt: "...",
    repoPath: "/repo",
    retrieve: vi.fn().mockRejectedValue(new Error("index missing")),
  }),
).resolves.toMatchObject({ retrieval: { status: "error" } });
```

**What to Mock:**

- Mock injected callbacks and boundary functions, not core module internals. Examples: `retrieve` in `tests/promptContext/index.test.ts` and scan-related fakes in `tests/indexCli.test.ts`.
- Stub external process execution only when validating script argument wiring, as in `spawnSync` usage in `tests/skills/skillAssets.test.ts`.

**What NOT to Mock:**

- Do not mock local filesystem behavior for config and registry tests; `tests/projectConfig.test.ts`, `tests/indexRegistry.test.ts`, and `tests/scanner/filter.test.ts` create real temp directories and files.
- Do not mock core pure-formatting logic when deterministic sample objects are enough; `tests/retrieval/index.test.ts` builds a real `ContextPack`-shaped object and exercises the renderer directly.

## Fixtures and Factories

**Test Data:**

```typescript
async function createRepo(options?: {
  cwconfig?: Record<string, unknown>;
  gitignore?: string;
  files?: Record<string, string>;
}): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cw-filter-"));
  // write files, optional .gitignore, optional cwconfig.json
  return repoRoot;
}
```

**Location:**

- Factories are inline within each test file rather than shared in a central fixtures directory.
- Representative helpers: `createRepo` in `tests/scanner/filter.test.ts`, `createTempDir` in `tests/indexCli.test.ts`, and `createSearchResult` in `tests/promptContext/index.test.ts`.

## Coverage

**Requirements:** None enforced by repository config.

**View Coverage:**

```bash
Not detected
```

## Test Types

**Unit Tests:**

- Present for deterministic pure helpers and renderers, such as `tests/enhancer/detect.test.ts`, `tests/enhancer/extractTechnicalTerms.test.ts`, and `tests/retrieval/index.test.ts`.

**Integration Tests:**

- Present for filesystem-backed workflows and CLI helpers, such as `tests/indexCli.test.ts`, `tests/indexRegistry.test.ts`, `tests/projectConfig.test.ts`, and `tests/scanner/filter.test.ts`.
- These tests commonly set up temp repos, write real `cwconfig.json` files, and verify end-to-end behavior of helper layers.

**E2E Tests:**

- Not detected. The repository does not include browser or shell-level end-to-end suites beyond focused helper-script checks in `tests/skills/skillAssets.test.ts`.

## Common Patterns

**Async Testing:**

```typescript
await expect(loadProjectConfig(repoRoot)).resolves.toEqual({
  indexing: { includePatterns: null, ignorePatterns: [] },
});

await expect(initFilter(repoRoot)).rejects.toThrow("cwconfig.json");
```

**Error Testing:**

```typescript
await expect(
  initProjectConfigCommand({ cwd: repoRoot, force: false }),
).rejects.toThrow("cwconfig.json");
```

## Environment and Cleanup

- Use `beforeEach`/`afterEach` to isolate mutable process state such as `process.env.HOME`; see `tests/indexCli.test.ts` and `tests/indexRegistry.test.ts`.
- Track temp directories in arrays and remove them with `fs.rm(..., { recursive: true, force: true })` in `afterEach`; this is the standard cleanup pattern across `tests/indexCli.test.ts`, `tests/scanner/filter.test.ts`, `tests/projectConfig.test.ts`, and `tests/skills/skillAssets.test.ts`.

## CI Validation

- GitHub Actions config is limited to `.github/workflows/release.yml`.
- That workflow installs dependencies with `pnpm install --frozen-lockfile` and runs `pnpm run build:release`, but it does not run `pnpm test`, `pnpm fmt`, or coverage collection.
- Use local test execution as the primary quality gate unless a separate CI workflow is added.

---

_Testing analysis: 2026-03-31_
