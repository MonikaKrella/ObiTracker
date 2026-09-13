<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Default Competition Class

- **Plan**: context/changes/default-competition-class/plan.md
- **Scope**: Full plan (Phase 1, 2, 3 — all complete)
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations flagged as findings (see notes below for confirmations)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

### Git scope

`git diff --name-only dbc428f^..HEAD` shows exactly the plan's files plus process artifacts (`change.md`, `plan-brief.md`, `plan.md`) — no unplanned production files.

### Plan drift (sub-agent 1, all 8 planned items)

All 8 items across Phase 1–3 verdict **MATCH**:

1. `supabase/migrations/20260912000001_dogs_add_default_class_number.sql` — CHECK constraint as specified, no RLS/grant changes (correctly not needed).
2. `src/types.ts` — `default_class_number: number | null` added after `deleted_at`.
3. `src/lib/services/dogs.ts` — `setDefaultClassNumber` mirrors `renameTrainingElement`'s shape exactly.
4. `src/pages/api/dog/[id]/default-class.ts` — PATCH route matches contract (auth → uuid validate → zod validate → 404-on-null → 200).
5. `tests/unit/cross-account-authorization.test.ts` — cross-account case added to existing `dogs` block.
6. `tests/unit/data-integrity.test.ts` — CHECK-constraint reject + clear-path tests added.
7. `src/pages/dogs/[id]/competition-results.astro` — fallback chain (`markedDefaultClass ?? lastClass`, requestedClass takes precedence, defensive `?? 3`) implemented precisely; Class 3 fallback replaces old Class 1 default as specified.
8. `src/components/competition-results/CompetitionResultsGrid.tsx` — star toggle, `isCurrentDefault` derivation, plain `<button>` (not shadcn `Button`), aria-label/title, PATCH + 401 redirect + toast, dropdown "· Default" badge — all match contract.

### Safety, quality & pattern compliance (sub-agent 2)

No CRITICAL or WARNING findings. Notable confirmations:

- The "revoke anon SELECT on new tables" lesson correctly does **not** apply — this is an `ALTER TABLE` on the pre-existing `dogs` table, which already has the anon revoke and service_role/authenticated grants from earlier migrations (grants are table-level, not column-level).
- The 401-redirect-to-`/auth/signin` lesson is correctly applied in `handleToggleDefault` — checked before any toast handling, matching `ScoreCell.tsx`'s pattern (this is a primary inline toolbar control, not a modal, so no exception applies).
- `isTogglingDefault` disable-during-request prevents overlapping PATCH calls; state only updates after a confirmed success (no optimistic update to unwind on failure), consistent with `ScoreCell.tsx`'s convention.
- API route auth/validation/error-handling boilerplate is identical in shape to sibling routes (`competitions/index.ts`, `elements/[elementId]/index.ts`).
- Service function ownership boundary relies solely on RLS + scoped `.eq("id", dogId)`, consistent with `getDogById`/`softDeleteDog` — no redundant app-level ownership check, matching existing convention.
- Minor harmless redundancy noted (not a finding): the `.astro` fallback's trailing `?? 3` literal is defense-in-depth already covered by `lastClass` resolving to Class 3 — intentional per the plan's own contract, not a defect.

### Success criteria (automated, full plan)

- `npm run test` — 104/104 passed
- `npm run lint` — 0 errors (3 pre-existing unrelated `no-console` warnings)
- `npm run astro check` — 0 errors, 0 warnings, 4 hints

### Success criteria (manual)

All Progress manual checkboxes across Phase 1, 2, and 3 are `[x]` with commit SHAs attached; Phase 3's manual verification was confirmed by the user immediately prior to this review.

## Findings

None. Full plan implementation is clean, faithful to the plan, and consistent with established project patterns and lessons.
