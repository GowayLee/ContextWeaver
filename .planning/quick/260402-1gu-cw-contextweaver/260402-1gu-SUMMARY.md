---
id: 260402-1gu
mode: quick
completed_at: 2026-04-01T17:09:03Z
duration_seconds: 217
commits:
  - 022bf90
  - c498ce8
  - b893f82
files_changed:
  - src/index.ts
  - tests/entryCli.test.ts
---

# Quick Task 260402-1gu Summary

修复了全局安装别名通过符号链接直接启动时的入口误判，`cw` / `contextweaver` 现在会正常进入统一 CLI 并输出 help。

## Completed Tasks

### Task 1: 修正全局 bin/symlink 场景下的 CLI 入口判定

- 先新增 symlink 回归测试，稳定复现“退出码 0 但无输出”的问题。
- 将 `src/index.ts` 的主模块判断从字面路径比较改为 `realpath` 比较，兼容发布别名和符号链接入口。
- 验证：`pnpm test -- tests/entryCli.test.ts`

**Commits**

- `022bf90` `test(260402-1gu): add failing symlink entry regression`
- `c498ce8` `feat(260402-1gu): resolve symlinked CLI entry guards`

### Task 2: 做一次发布入口级别的快速回归验证

- 抽取共享 help surface 断言，补齐“直接执行 dist/index.js / contextweaver wrapper / cw wrapper”三类代表路径的一致性验证。
- 保留 symlink 场景覆盖，继续确认两个别名无参数时都有可见输出。
- 验证：`pnpm test -- tests/entryCli.test.ts && pnpm test -- tests/indexCli.test.ts`

**Commit**

- `b893f82` `test(260402-1gu): tighten published entry smoke coverage`

## Deviations from Plan

### Auto-fixed Issues

- None.

### Out-of-scope Discoveries

- `pnpm build` 的 d.ts 阶段仍会在 `src/chunking/ParserPool.ts(104)` 失败，这是与本次入口修复无关的既有类型问题，已记录到 `deferred-items.md`。

## Verification

- `pnpm test -- tests/entryCli.test.ts`
- `pnpm test -- tests/indexCli.test.ts`

## Known Stubs

- None.

## Self-Check: PASSED

- FOUND: `.planning/quick/260402-1gu-cw-contextweaver/260402-1gu-SUMMARY.md`
- FOUND: `022bf90`
- FOUND: `c498ce8`
- FOUND: `b893f82`
