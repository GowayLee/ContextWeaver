---
phase: 01
slug: fail-fast-exit
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| **Framework**          | vitest                                                                                        |
| **Config file**        | `vitest.config.ts`                                                                            |
| **Quick run command**  | `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts tests/indexCli.test.ts` |
| **Full suite command** | `pnpm test`                                                                                   |
| **Estimated runtime**  | ~20 seconds                                                                                   |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts tests/indexCli.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type         | Automated Command                                                      | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------------- | ---------------------------------------------------------------------- | ----------- | ---------- |
| 01-01-01 | 01   | 1    | SAFE-01     | unit/integration  | `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts` | ✅          | ⬜ pending |
| 01-01-02 | 01   | 1    | SAFE-01     | unit/integration  | `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts` | ✅          | ⬜ pending |
| 01-02-01 | 02   | 2    | SAFE-02     | integration       | `pnpm test -- tests/indexCli.test.ts`                                  | ✅          | ⬜ pending |
| 01-02-02 | 02   | 2    | SAFE-02     | integration/build | `pnpm test -- tests/indexCli.test.ts && pnpm build`                    | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
