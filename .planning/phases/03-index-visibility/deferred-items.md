# Deferred Items

## 2026-04-01 — Existing DTS build failure outside Phase 03-01 scope

- **Command:** `pnpm build`
- **Failure:** `src/chunking/ParserPool.ts(104,22): error TS2345: Argument of type '{}' is not assignable to parameter of type 'Language'.`
- **Why deferred:** This failure comes from an existing declaration build issue in `ParserPool.ts`, not from the scanner visibility contract changes in Plan 03-01.
- **Impact:** Targeted scanner tests passed, but full build verification remains blocked until the pre-existing DTS error is resolved.

## 2026-04-01 — Existing DTS build failure still blocks Plan 03-02 full verification

- **Command:** `pnpm build`
- **Failure:** `src/chunking/ParserPool.ts(104,22): error TS2345: Argument of type '{}' is not assignable to parameter of type 'Language'.`
- **Why deferred:** Plan 03-02 only changed scanner/CLI progress messaging. The DTS failure remains the same pre-existing issue from outside the progress work scope.
- **Impact:** Progress tests pass, but plan-level `pnpm build` acceptance is still blocked by unrelated declaration generation.

## 2026-04-01 — Existing DTS build failure still blocks Plan 03-03 full verification

- **Command:** `pnpm build`
- **Failure:** `src/chunking/ParserPool.ts(104,22): error TS2345: Argument of type '{}' is not assignable to parameter of type 'Language'.`
- **Why deferred:** Plan 03-03 only changed CLI summary rendering and tests. The DTS failure is unchanged and remains outside this plan's scope.
- **Impact:** Summary rendering tests pass, but full build verification still cannot complete until the pre-existing declaration issue is fixed.
