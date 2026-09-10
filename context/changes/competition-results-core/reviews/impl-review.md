<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Competition Results Core (S-01)

- **Plan**: context/changes/competition-results-core/plan.md
- **Scope**: Phase 1 of 8 (full plan — all phases complete)
- **Date**: 2026-09-10
- **Verdict**: NEEDS ATTENTION (as reviewed) → all 4 findings fixed during triage
- **Findings**: 0 critical, 3 warnings, 1 observation — all FIXED

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — `loadCompetitionBoard` repository built to contract, but never called

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/competition-board.ts:14; src/pages/dogs/[id]/competition-results.astro:40-77
- **Detail**: Phase 5's contract specifies `loadCompetitionBoard(supabase, dogId, classId, window)` as the repository the Phase 7 page shell should call ("resolves the window via `getCompetitionWindow`, fetches exercises... constructs `CompetitionBoard.create(...)`"). Phase 7's own contract says the page "calls `loadCompetitionBoard`." Instead, `competition-results.astro` reimplements the identical three-call sequence (`getExercisesForClass` → `getCompetitionsForDogClass` → `getCompetitionScores` → `CompetitionBoard.create()`) inline, hardcoding `getCompetitionWindow("all-time")` regardless of the window cookie, and discards the constructed board (used only to validate the data before rendering — the client recomputes its own board from raw props). A repo-wide grep confirms `loadCompetitionBoard` is imported nowhere and has no dedicated test — it is genuinely dead code, not just an unusual call path. The bypass is well-reasoned and commented (the repo function's return shape — `{ board, competitions }` — doesn't expose the raw `exercises`/`scores` arrays the client-side island needs as props, and a `CompetitionBoard` class instance can't cross the Astro server→island prop boundary anyway), but it's undocumented as an intentional plan deviation.
- **Fix A ⭐ Recommended**: Extend `loadCompetitionBoard`'s return type to also include `exercises` and the raw `scores` array, then replace the inline fetch/construct block in `competition-results.astro` with a single `await loadCompetitionBoard(supabase, selectedDog.id, selectedClassId, "all-time")` call.
  - Strength: Eliminates the duplicated fetch/construct logic, honors the plan's explicit Phase 7 contract, and gives the previously-untested repository function real exercise via the page's own manual verification.
  - Tradeoff: Touches an already-shipped function's signature — small but real edit surface; the hardcoded `"all-time"` window argument preserves current behavior exactly.
  - Confidence: HIGH — behavior is unchanged since the astro file already always requests the all-time window.
  - Blind spot: Haven't checked whether any near-term roadmap slice expects the current 2-field return shape.
- **Fix B**: Delete `loadCompetitionBoard` as dead code, and add a short addendum to plan.md/change.md documenting that Phase 7's actual UX (always-fetch-all-time + client-side filter) made the Phase 5 window-scoped repository abstraction unnecessary.
  - Strength: Removes untested/unused code outright with zero risk to working code.
  - Tradeoff: Loses the service-layer abstraction the plan called for; a future feature needing a single server-side windowed fetch would have to rebuild it.
  - Confidence: MEDIUM — reasonable only if nothing on the near-term roadmap needs a window-scoped server fetch.
  - Blind spot: Haven't checked the roadmap for such a use case.
- **Decision**: FIXED (Fix A) — `loadCompetitionBoard` now returns `exercises`/`competitions`/`scores` alongside `board`; `competition-results.astro` calls it directly instead of duplicating the fetch/construct sequence. Verified: `npm run astro check` (0 errors), `npm run lint` (0 errors), `npm run test` (102/102 passing).

### F2 — Unused `cn` npm package added to dependencies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:35; package-lock.json:28
- **Detail**: `"cn": "^0.2.6"` — an unrelated third-party npm package (a CLI tool), not the project's own `cn()` class-merging utility from `@/lib/utils` — was added as a direct dependency. It is not imported anywhere in `src/`; `select.tsx` and every other component correctly import `cn` from `@/lib/utils` as CLAUDE.md specifies. This is almost certainly an accidental side effect of running `npx shadcn@latest add select` (Phase 7's contract), not a deliberate addition, and isn't mentioned in the plan or change.md's notes.
- **Fix**: Run `npm uninstall cn` to remove the unused dependency.
- **Decision**: FIXED — ran `npm uninstall cn`; confirmed removed from package.json and package-lock.json.

### F3 — Brace-style violations in `competitions.ts`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/competitions.ts:31, 54, 76, 102, 120, 141
- **Detail**: Six instances of `if (result.error) throw result.error;` written on one line, violating the lessons.md rule "Always use braces for if-statements, with the body on its own line" (applies to implement/impl-review). This mirrors the older, now-superseded style still present in `training-logs.ts`/`dogs.ts`, but the more recently-touched precedent `training-elements.ts` already uses the corrected braced form for the identical check — this file should have followed that newer convention. Not caught by lint (the `curly` ESLint rule isn't configured to flag it).
- **Fix**: Reformat all six to `if (result.error) {\n  throw result.error;\n}`.
- **Decision**: FIXED — all six reformatted to braced, body-on-own-line form. Verified: lint/typecheck/tests all pass (102/102).

### F4 — Score route relies solely on RLS for exercise/class-mismatch rejection

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/dog/[id]/competitions/[competitionId]/scores/[exerciseId].ts:62-77, 96-111
- **Detail**: Unlike `logs/index.ts`'s use of `elementBelongsToDog` for a clean app-level 404, the PUT/DELETE score routes check only `competitionBelongsToDog` and rely entirely on the RLS cross-FK `WITH CHECK` to reject a forged/stale `exerciseId` from a different class. This matches the Phase 6 plan contract exactly (which only asks for `competitionBelongsToDog`) and isn't a security gap — `cross-account-authorization.test.ts` confirms RLS rejects it — but the rejection surfaces as a raw Postgres error wrapped in a generic 500 (via the existing `errorMessage()` three-way extraction, itself an established codebase-wide pattern, not new here) rather than a clean 4xx.
- **Fix**: Optional — add an app-level `exerciseBelongsToClass(supabase, competitionId, exerciseId)` pre-check mirroring `elementBelongsToDog`'s shape, returning a clean 404 instead of a 500.
- **Decision**: FIXED — added `exerciseBelongsToClass()` to `src/lib/services/competitions.ts` and wired it into both PUT and DELETE handlers (after `competitionBelongsToDog`), returning a clean 404 on mismatch instead of surfacing the RLS violation as a 500. Verified: lint/typecheck/tests all pass (102/102).
