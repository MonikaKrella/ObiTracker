<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Competition Reference Data (F-01) Implementation Plan

- **Plan**: context/changes/competition-reference-data/plan.md
- **Scope**: Phase 1-3 of 3 (full plan)
- **Date**: 2026-09-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — RLS-boundary anon test hedges instead of asserting deterministically

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/unit/competition-reference-data.test.ts:120-135
- **Detail**: The migration does `REVOKE SELECT ON TABLE ... FROM anon`, a table-privilege revoke that makes PostgREST deterministically return a permission-denied (42501) error for anon reads — it should never silently return `[]`. The test's `if (error) { expect(error).toBeDefined() } else { expect(data).toEqual([]) }` hedge would still pass even if the grants were accidentally reverted (e.g. anon regains SELECT but RLS's default-deny happens to return zero rows), masking a real regression in the REVOKE. This is weaker than the deterministic single-outcome assertions this repo's other RLS/authorization tests use.
- **Fix**: Assert unconditionally that `error` is defined (and ideally check `error.code === "42501"` or similar) instead of branching on whether an error occurred.
- **Decision**: FIXED — both anon-read assertions tightened to `expect(error).toBeDefined()` unconditionally.

### F2 — Inline anon Supabase client duplicated instead of a shared test helper

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/competition-reference-data.test.ts:7-8, 117, 128
- **Detail**: `tests/helpers/db.ts` centralizes admin/auth client construction (`createAdminClient`, `createTestUser`) but has no `createAnonClient()` export. This test file reconstructs an anon client inline in two places instead of extending the shared helper — this is the first RLS-boundary-via-anon-client test in the suite, and the pattern is likely to recur for any future global/reference table.
- **Fix**: Add `createAnonClient()` to `tests/helpers/db.ts` (mirroring the existing `SUPABASE_URL`/`ANON_KEY` module-level consts) and use it from both call sites in this test file.
- **Decision**: FIXED — `createAnonClient()` added to `tests/helpers/db.ts`, both call sites updated, inline `SUPABASE_URL`/`ANON_KEY` consts removed from the test file.

### F3 — class_number addition not documented in the plan

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/competition-reference-data/plan.md (Phase 2 section)
- **Detail**: Mid-Phase-2, the user explicitly asked for a dedicated `class_number` smallint column on `competition_classes` (distinct from `sort_position`) plus `getExercisesForClassNumber(supabase, classNumber)`. Both are correctly implemented (migration `20260903000002_add_class_number_to_competition_classes.sql` backfills correctly and adds a UNIQUE constraint; the service function delegates correctly to `getExercisesForClass`). This was a deliberate, explicit user request — not silent scope creep — but the plan file (the project's source of truth for this change) still only describes the original two-field/two-function Phase 2 contract, so a future reader of the plan won't know about the extra column/function without reading the diff.
- **Fix**: Add a short addendum note to plan.md's Phase 2 section (or a "Post-plan additions" note) documenting the class_number column and getExercisesForClassNumber, with the reason (deliberate user request during implementation).
- **Decision**: FIXED — addendum added to plan.md's Phase 2 section.

### F4 — getExercisesForClassNumber throws on no-match, deviating from sibling not-found convention

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/competition.ts:38-49
- **Detail**: `getExercisesForClassNumber` uses `.single()` on the class lookup, which throws when `classNumber` doesn't match any row. Sibling not-found lookups elsewhere (`getDogById`, `renameTrainingElement`) return `null` on no-match rather than throwing. This is defensible — `class_number` is a fixed rulebook constant (1/2/3), so a miss is a caller bug rather than a legitimate business case — but it's an undocumented convention deviation.
- **Fix**: Add a one-line doc comment on the function explaining the throw-on-miss choice (class_number is a fixed constant, not user input), so the deviation reads as intentional.
- **Decision**: FIXED (differently) — user chose to align with `getDogById`'s convention instead: `getExercisesForClassNumber` now uses `.maybeSingle()` and returns `null` on no-match (return type `Exercise[] | null`), rather than throwing.

### F5 — No test coverage for getExercisesForClassNumber

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/unit/competition-reference-data.test.ts
- **Detail**: The one function added outside the original plan (`getExercisesForClassNumber`) has no automated test, unlike every other function in `competition.ts`.
- **Fix**: Add a small test asserting `getExercisesForClassNumber(authClient, 1)` returns Class 1's 9 exercises (or an equivalent spot-check).
- **Decision**: FIXED — added a `getExercisesForClassNumber` describe block with a happy-path test (class_number 1 → 9 exercises) and a not-found test (class_number 99 → null, matching the F4 fix).
