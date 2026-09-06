<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Training Board — Invariant Aggregate-Guardian Refactor

- **Plan**: context/changes/training-board-refactor/plan.md
- **Scope**: Full plan (Phases 1-7 of 7)
- **Date**: 2026-09-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Evidence summary

Two sub-agents independently reviewed the diff (`a094965..HEAD`):

- **Plan drift**: all 7 phases MATCH the plan's stated intent. `TrainingBoard`'s algorithm was moved verbatim (including the business-rule JSDoc); the 30-day fixed window bound in `loadTrainingBoard()` is real, not unbounded; `grid.astro` builds its `TrainingBoard` from data already in memory (does not call `loadTrainingBoard()`, avoiding a double DB round-trip); the client still self-computes highlights via `useMemo` (no `initialHighlights` prop threaded, per the plan's explicit "What We're NOT Doing"); `src/lib/highlight.ts` and `tests/unit/highlight.test.ts` are deleted with zero remaining references (`grep -rn "computeHighlights" src tests` returns nothing).
- **Safety & pattern**: `GET /api/dog/[id]/grid` matches the reference route (`logs/index.ts`) line-for-line on auth (401 via `context.locals.user`), UUID validation (`z.uuid().safeParse`), ownership (404 via `getDogById`), and generic try/catch-to-500. No SQL/command injection risk, no hardcoded secrets, no unbounded loops. `UnknownElementTickError` is caught in both `grid.astro` and the API route. No data-safety concerns (read-only feature, no migrations).

Automated success criteria re-verified live: `npm run test` (67/67 passed), `npm run build` (typecheck clean), `npm run lint` (0 errors, 2 pre-existing unrelated warnings in `tests/e2e/global-teardown.ts`). Manual verification for all 7 phases confirmed complete in the plan's Progress section, with the Phase 7 final end-to-end pass confirmed by the user during this session.

## Findings

### F1 — `buildTickCounts` is now dead code, still exported and tested

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/training-grid-helpers.ts:48, tests/unit/training-grid.test.ts:74-118
- **Detail**: Phase 6 replaced `TrainingGrid.tsx`'s `buildTickCounts(elements, ticks)` → `computeHighlights(...)` call with `TrainingBoard.create(elements, ticksMapToTickRecords(ticks)).highlights()`. `buildTickCounts` lost its only production caller in that change but is still exported from `training-grid-helpers.ts`, and two `describe` blocks in `training-grid.test.ts` (lines 74-93 and 95-118, the latter asserting the "window-agnostic" ranking invariant) still exercise it. The window-agnostic invariant those tests protect is meaningful, but they now verify it on a code path nothing in production calls — the live path (`ticksMapToTickRecords` → `TrainingBoard.highlights()`) is covered by `training-board.test.ts`'s trace-table cases instead, which is adequate, but leaves `buildTickCounts` itself orphaned. This wasn't a stated Phase 6/7 deliverable, so it's not plan drift — just a loose end the refactor's cross-file rewiring left behind, and it contradicts this same plan's own invoked convention ("delete unused code, no re-export shims", CLAUDE.md) for `highlight.ts`.
- **Fix**: Delete `buildTickCounts` (training-grid-helpers.ts:42-56) and its two `describe` blocks (training-grid.test.ts:74-118), then remove the now-unused `buildTickCounts` import from the test file's import list.
- **Decision**: FIXED — deleted `buildTickCounts` (training-grid-helpers.ts) and its two describe blocks (training-grid.test.ts:74-118), removed the unused import. `npm run test` (11/11 in training-grid.test.ts) and `npm run lint` (0 errors) reverified clean.
