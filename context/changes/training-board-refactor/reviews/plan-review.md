<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Training Board — Invariant Aggregate-Guardian Refactor

- **Plan**: context/changes/training-board-refactor/plan.md
- **Mode**: Deep
- **Date**: 2026-09-04
- **Verdict**: REVISE (all findings fixed during triage on 2026-09-04 — see Decisions below)
- **Findings**: 2 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

9/9 paths verified to exist (`src/lib/highlight.ts`, `src/lib/training-grid-helpers.ts`,
`src/components/training-grid/TrainingGrid.tsx`, `src/pages/dogs/[id]/grid.astro`,
`src/lib/services/training-logs.ts`, `src/pages/api/dog/[id]/logs/index.ts`,
`src/pages/api/dog/[id]/index.ts`, `tests/unit/highlight.test.ts`,
`tests/unit/training-grid.test.ts`). Symbols verified: `getTrainingWindow`/`generateDateRange`
signatures match Phase 3's contract; `computeHighlights` (`highlight.ts:50`) has exactly one
production call site (`TrainingGrid.tsx:89`), confirmed via repo-wide grep; `getDogById`,
`buildTicksByElement`, `applyTick`, `buildTickCounts` all match their described contracts;
`highlight.test.ts` has exactly 17 test cases (plan's correction of the source doc's "9" is
accurate). Brief↔plan consistency confirmed (one minor wording nuance — brief says "three call
sites converge," plan's "Critical Implementation Details" heading says "two independent
construction sites" — not flagged as a finding, doesn't affect implementation).

## Findings

### F1 — logsToTickRecords is used in Phase 3 before it's created in Phase 6

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, Phase 5, Phase 6
- **Detail**: Phase 3's `loadTrainingBoard()` needs to map
  `Pick<TrainingLog, "element_id" | "trained_on">[]` rows to `TickRecord[]`. Phase 5's `grid.astro`
  contract explicitly defers this mapping to "Phase 6's `training-grid-helpers.ts` addition, reused
  here" — but Phase 6 is where `logsToTickRecords` is actually created, and Phase 6 runs after
  Phase 3 and Phase 5 (each phase is independently shippable with explicit pause points after
  Phase 5 and Phase 6). Followed literally in order, Phase 3 has no helper to import yet and
  Phase 5 has nothing to "reuse."
- **Fix**: Move creation of `logsToTickRecords` (and its test coverage) into Phase 3, in
  `src/lib/training-grid-helpers.ts`, since that's the first phase that needs it. Phase 5 then
  reuses the already-existing helper. Phase 6 keeps only `ticksMapToTickRecords`.
- **Decision**: FIXED

### F2 — serviceUnavailable is const; Phase 5's catch-block assignment won't compile

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — Wire grid.astro
- **Detail**: `grid.astro:34` declares `const serviceUnavailable = !supabase;`. Phase 5's contract
  requires "On catch, set `serviceUnavailable = true`" — a reassignment of a `const` binding, which
  is a TypeScript compile error. As written, Phase 5's own Success Criteria
  ("Type checking passes: `npm run build`") would fail the moment this is implemented literally.
- **Fix**: Add to Phase 5's Contract: change the declaration at `grid.astro:34` from `const` to
  `let serviceUnavailable = !supabase;`.
- **Decision**: FIXED

### F3 — Wrapping the whole fetch block changes today's fetch-error behavior

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 5 — Wire grid.astro
- **Detail**: Phase 5's contract wraps the entire existing `if (supabase) {...}` block — including
  the pre-existing `getTrainingElements`/`getTrainingLogs` calls — in a try/catch, not just the new
  `TrainingBoard.create()` call. No global error page or existing try/catch guards these calls
  today (verified: no custom error page under `src/pages`, no try/catch in `src/middleware.ts`), so
  a Supabase fetch error currently propagates as an unhandled SSR exception. After this refactor,
  that same fetch error would be silently caught and rendered as the "service unavailable" overlay
  instead — a real change in observable behavior on a pre-existing failure path, which cuts against
  the plan's explicit "zero observable behavior change" / "byte-for-byte identical" framing.
- **Fix A ⭐ Recommended**: Keep the single try/catch wrapping the whole block, but explicitly call
  out this scoped exception in the Desired End State / Success Criteria so it isn't a surprise
  during Phase 5's manual verification.
  - Strength: One code path, no duplicated error handling; strictly better UX on an already-rare
    failure (swaps a hard crash for the app's own friendly overlay).
  - Tradeoff: The plan's "byte-for-byte identical" claim is no longer literally true for the
    fetch-error case.
  - Confidence: MEDIUM — no custom 500 page or middleware try/catch exists today, but what
    Cloudflare Workers itself returns on an unhandled SSR exception wasn't checked.
  - Blind spot: Cloudflare Workers' own default error response for an unhandled exception is
    unverified — Fix A assumes it's worse than the app's overlay.
- **Fix B**: Narrow the try/catch to wrap only `TrainingBoard.create()` (and its input mapping),
  leaving `getTrainingElements`/`getTrainingLogs` to throw uncaught exactly as today.
  - Strength: Literally zero behavior change on pre-existing failure paths.
  - Tradeoff: Two error-handling seams in one block for no product reason, and undercuts the
    refactor's own "fail safe" spirit for the one new failure mode being introduced.
  - Confidence: HIGH on correctness, LOW on desirability.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — plan.md Desired End State + brief updated with the scoped exception;
  logged the global-error-page gap as `context/foundation/post-v2.md` item 1)

### F4 — tickCountFor() has no caller anywhere in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — Implement TrainingBoard
- **Detail**: Phase 2 adds a public `tickCountFor(elementId)` method, and Phase 1 adds a test case
  for it, but no phase — `loadTrainingBoard`, the API route, `grid.astro`, or `TrainingGrid.tsx` —
  ever calls it. `computeHighlights` had no equivalent accessor. This reads as speculative API
  surface added alongside `.create()`, not something this refactor actually needs.
- **Fix**: Drop `tickCountFor()` and its test case unless a concrete consumer exists; add it later
  when one does.
- **Decision**: FIXED
