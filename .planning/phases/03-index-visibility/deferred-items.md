# Deferred Items

## 2026-04-01 — Existing DTS build failure outside Phase 03-01 scope

- **Command:** `pnpm build`
- **Failure:** `src/chunking/ParserPool.ts(104,22): error TS2345: Argument of type '{}' is not assignable to parameter of type 'Language'.`
- **Why deferred:** This failure comes from an existing declaration build issue in `ParserPool.ts`, not from the scanner visibility contract changes in Plan 03-01.
- **Impact:** Targeted scanner tests passed, but full build verification remains blocked until the pre-existing DTS error is resolved.
