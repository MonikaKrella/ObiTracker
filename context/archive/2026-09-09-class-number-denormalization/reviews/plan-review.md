<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Class Number Denormalization

- **Plan**: context/changes/class-number-denormalization/plan.md
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓ (4 migrations, `competition-board.ts` domain file, `window-options.ts`, `competition.ts` service, API route), 12/12 symbols/contracts ✓ (RLS cross-check at `20260906000002_create_competition_scores.sql:61,79` matches plan's cited lines exactly; `getExercisesForClassNumber`'s resolve-then-`null` behavior confirmed in `src/lib/services/competition.ts:39-58`; seed `INSERT` shape confirmed in `20260903000001...sql:69-117`; zod v4's `union<const T extends readonly core.SomeType[]>` accepts a plain array — not a tuple — so `COMPETITION_CLASSES.map(...)` type-checks fine, no risk there), brief↔plan ✓.

Blast-radius sweep: repo-wide grep for `CompetitionClass`, `getCompetitionClasses`, `getExercisesForClassNumber` outside `src/`+`tests/` hits only docs/archives (`context/changes/**`, `context/archive/**`) — no missed caller. `tests/e2e/` has zero references to `classId`/`class_id`/`competition_classes`, confirming change.md's grep list is complete.

## Findings

### F1 — Competitions migration header comment left stale

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, item 3 (competitions table migration)
- **Detail**: `supabase/migrations/20260906000001_create_competitions.sql:6-10` mentions `class_id` twice in its descriptive header comment ("Enables the (account_id, dog_id, class_id, competed_on) composite index..." and "App code must always populate dog_id, class_id, and account_id consistently"). Plan item 3's contract only updated the rollback comment block, not this header — unlike item 1 (exercises migration), which explicitly covers its header comment. Purely cosmetic, no functional effect.
- **Fix**: Add a line to Phase 1 item 3's contract: "also update the header comment's two `class_id` mentions (lines 8, 10) to `class_number`."
- **Decision**: FIXED — applied to plan.md item 3's contract.
