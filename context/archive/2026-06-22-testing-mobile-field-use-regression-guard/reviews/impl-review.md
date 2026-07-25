<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Testing Mobile Field-Use Regression Guard

- **Plan**: context/changes/testing-mobile-field-use-regression-guard/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2)
- **Date**: 2026-07-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Success criteria verification

Automated (re-run during this review):

- `npm run lint` — pass
- `npm run test` (Vitest) — 5 suites, 49 tests, all pass
- `npx playwright test --list` — lists exactly 2 tests (`seed.spec.ts`, `mobile-grid.spec.ts`), no config error
- `git status` — clean, no `.playwright-cli/**` tracked

CI (per user confirmation in-session): `ci` job green (after the `vitest.config.ts` fix), `e2e` job green.

Manual: 2.5 (real-device/non-Chromium spot-check) confirmed directly by the user in-session ("everything works correctly") — real evidence, just not diff-observable by nature of being a manual device check.

## Findings

### F1 — mobile-grid.spec.ts's locator can race with seed.spec.ts under parallel workers

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: tests/e2e/mobile-grid.spec.ts:41
- **Detail**: Uses `page.getByRole("grid").getByRole("checkbox").last()` — a whole-grid positional locator — instead of the plan's contracted aria-label-based `getByRole('checkbox', { name: /.../ })`. `seed.spec.ts` adds and deletes an unrelated training element on the same shared `dogId` via the UI, and `playwright.config.ts` sets no `workers: 1`/`fullyParallel: false`, so the two spec files can run concurrently on a multi-core CI runner. While `seed.spec.ts`'s row is transiently present, "last checkbox in the grid" can resolve to the wrong element's cell instead of "Heel"'s today-column — an intermittent, hard-to-diagnose flake. Also an undocumented deviation from the plan's literal Contract (which specified the aria-label selector precisely to avoid this ambiguity).
- **Fix**: Scope the locator to the seeded "Heel" element specifically, e.g. `page.getByRole("checkbox", { name: /^Heel,/ }).last()`. Restores the plan's aria-label-based selection contract and removes the cross-spec race entirely — no `workers`/`fullyParallel` config change needed.
- **Decision**: SKIPPED — user chose not to fix now; revisit if `mobile-grid.spec.ts`/`seed.spec.ts` actually start flaking in CI.

### F2 — global-setup.ts orphans the Supabase test user on partial-seed failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/global-setup.ts:15-34
- **Detail**: `createTestUser`'s `cleanup()` closure exists specifically to delete a partially-created user if a later seeding step fails, but `global-setup.ts` discards it (`const { userId, email, password } = await createTestUser(admin)`). If `seedDog`, `seedElement`, or the sign-in POST throws, the just-created auth user is permanently orphaned — never written to `seed.json`, so `global-teardown.ts` can't find/delete it either. This happens on any transient CI flake during setup, not just a real bug.
- **Fix**: Wrap the seed+signin sequence in try/catch and call `cleanup()` (or `admin.auth.admin.deleteUser(userId)`) on any failure before re-throwing — mirrors the orphan-guard pattern `db.ts` already uses internally (`db.ts:85-89`).
- **Decision**: FIXED — wrapped `seedDog`/`seedElement`/signin in try/catch calling `cleanup()` before re-throw.

### F3 — global-teardown.ts throws hard on a missing or stale seed.json

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/global-teardown.ts:9-13
- **Detail**: `readFile` + `JSON.parse`, and the `deleteUser` call, are unguarded. A missing `seed.json` (setup failed before writing it) or a stale one from an interrupted prior local run throws an uncaught exception, failing the whole teardown step and masking whatever the real underlying setup failure was behind a confusing secondary error.
- **Fix**: Wrap in try/catch; log a warning and exit cleanly when `seed.json` is missing/invalid or `deleteUser` reports "not found," rather than letting teardown itself throw.
- **Decision**: FIXED — read/parse wrapped in try/catch (warn + return if missing/invalid); `deleteUser` error now warns instead of throwing.

### F4 — mobile-grid.spec.ts's cleanup isn't guaranteed if an assertion fails mid-test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: tests/e2e/mobile-grid.spec.ts:38-54
- **Detail**: The restore-to-original-state click (the test's only cleanup — the plan's Contract explicitly said "No per-test cleanup needed") only runs if every prior `expect` passes. If, say, the post-tap `scaleAfterTap` assertion fails, the test aborts before the restore click executes, permanently leaving the shared seeded "Heel" element's today-cell flipped for any later run against the same dog. Also undocumented as a plan deviation — the contract said no cleanup was needed; this spec silently added some, but not failure-safe cleanup.
- **Fix**: Wrap the tap/assert/restore sequence in try/finally so the restore-click always runs, even when an assertion in between fails.
- **Decision**: FIXED — wrapped tap + post-tap assertions in try/finally; restore-click now always runs. Re-verified both specs green against the running app.

### F5 — global-setup.ts / global-teardown.ts import db.ts via relative path, not the @/ alias

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/global-setup.ts:5, tests/e2e/global-teardown.ts:4
- **Detail**: Imports via `../../src/lib/tests/helpers/db` instead of this project's `@/*` path alias convention (`CLAUDE.md`: "Path alias: `@/*` → `./src/*`"). Playwright's test runner honors tsconfig `paths`, so `@/lib/tests/helpers/db` would work here.
- **Fix**: Switch both imports to `@/lib/tests/helpers/db`.
- **Decision**: SKIPPED — user chose not to fix now.

### F6 — Commit 2703bd1's message undersells the CLAUDE.md diff's relevance

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: CLAUDE.md (commit 2703bd1)
- **Detail**: The commit message calls the `CLAUDE.md` diff "pre-existing staged edit... bundled in per user request," but the diff actually replaces the old "Module 3, Lesson 3 (Hooks)" section with the exact "Module 3, Lesson 4 (E2E Tests)" rules block that Phase 2 depends on and that `plan.md:145` assumes already exists. Not scope creep — just a slightly misleading commit-message framing for anyone reading `git log` later. No action needed.
- **Fix**: None — informational only.
- **Decision**: SKIPPED — user chose no action.
