---
phase: 03
slug: index-visibility
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest                                                                                                                          |
| **Config file**        | `vitest.config.ts`                                                                                                              |
| **Quick run command**  | `pnpm test -- tests/scanner/indexVisibility.test.ts tests/indexVisibilityProgress.test.ts tests/indexVisibilitySummary.test.ts` |
| **Full suite command** | `pnpm test`                                                                                                                     |
| **Estimated runtime**  | ~25 seconds                                                                                                                     |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- tests/scanner/indexVisibility.test.ts tests/indexVisibilityProgress.test.ts tests/indexVisibilitySummary.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement    | Test Type         | Automated Command                                                  | File Exists | Status     |
| -------- | ---- | ---- | -------------- | ----------------- | ------------------------------------------------------------------ | ----------- | ---------- |
| 03-01-01 | 01   | 1    | VIS-02         | unit/integration  | `pnpm test -- tests/scanner/indexVisibility.test.ts`               | ✅          | ⬜ pending |
| 03-01-02 | 01   | 1    | VIS-02, VIS-03 | unit/integration  | `pnpm test -- tests/scanner/indexVisibility.test.ts`               | ✅          | ⬜ pending |
| 03-02-01 | 02   | 2    | VIS-01         | integration       | `pnpm test -- tests/indexVisibilityProgress.test.ts`               | ✅          | ⬜ pending |
| 03-02-02 | 02   | 2    | VIS-01         | integration/build | `pnpm test -- tests/indexVisibilityProgress.test.ts && pnpm build` | ✅          | ⬜ pending |
| 03-03-01 | 03   | 2    | VIS-03         | integration       | `pnpm test -- tests/indexVisibilitySummary.test.ts`                | ✅          | ⬜ pending |
| 03-03-02 | 03   | 2    | VIS-02, VIS-03 | integration/build | `pnpm test -- tests/indexVisibilitySummary.test.ts && pnpm build`  | ✅          | ⬜ pending |

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
