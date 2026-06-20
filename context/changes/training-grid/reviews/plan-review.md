<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Training Grid Implementation Plan

- **Plan**: context/changes/training-grid/plan.md
- **Mode**: Deep
- **Date**: 2026-06-19
- **Verdict**: REVISE → all findings resolved (see Decisions below)
- **Findings**: 1 critical, 2 warnings, 0 observations — all FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

6/6 paths ✓ (training-elements.ts, elements/index.ts, TrainingElementsManager.tsx:98-110, useMounted.ts, training_logs migration, middleware.ts:44-55), 3/3 symbols ✓ (getDogById, Postgres code "23505" = unique_violation via PostgrestError.code, cn()), brief↔plan ✓

## Findings

### F1 — Phase 3 fetches only the requested window, breaking Phase 4's "zero network requests" promise

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 3 (grid.astro contract) / Phase 4 (useMemo chain)
- **Detail**: Phase 3's contract calls `getTrainingWindow(windowDays)` and `generateDateRange(windowDays, endDate)` using `windowDays` resolved from the `?window=` URL param — i.e. it only fetches/renders the *requested* window (could be 7 or 14), not always the full 30 days. research.md's architecture (Section 7, Architecture Insight #5) explicitly calls for fetching "30 days max" regardless of the selected default, specifically so client-side window switching never needs a refetch. Phase 4's `useMemo` chain (`allTicks → windowTicks → tickCounts → highlights`) assumes the full 30 days is already present in `allTicks` — but if a handler loads `?window=7` (e.g. a bookmarked or shared link) and then switches the selector to 14 or 30, the other 23 days were never fetched. The grid would silently show incomplete data and wrong highlights for the wider window — not an error, just quietly incorrect. This also surfaces a related gap: neither phase specifies how the *rendered date columns* (not just tick counts/highlights) respond to `selectedWindow`. Manual Verification 4.6 ("zero network requests" on window switch) cannot pass in the switch-up case as currently specified.
- **Fix A ⭐ Recommended**: Always SSR-fetch the full 30-day window; slice dates client-side
  - Strength: Matches research.md's already-decided architecture exactly; genuinely delivers "zero network requests" in both directions (narrowing and widening).
  - Tradeoff: SSR always runs the larger 30-day query even when the handler's bookmarked link only wants a 7-day view — a marginal cost already accepted in research's "~300 rows, negligible" sizing.
  - Confidence: HIGH — directly resolves the contract break using the architecture the plan already cites as authoritative.
  - Blind spot: None significant — this repairs an internal inconsistency rather than introducing a new decision.
- **Fix B**: Keep Phase 3's "fetch only the requested window," add a refetch path in Phase 4 for switch-up
  - Strength: SSR fetch stays proportional to a handler's typical (e.g. always-7-day) usage.
  - Tradeoff: Reintroduces the network round-trip and a loading state the whole client-filtering architecture was designed to avoid; adds a second "loaded vs. not-yet-loaded" code path.
  - Confidence: MEDIUM — works, but contradicts the plan's own stated architecture and adds real complexity for what may be a rare case.
  - Blind spot: How often handlers actually load with a non-default `?window=` value is unverified.
- **Decision**: FIXED (Fix A, customized) — plan now always fetches/highlights over a fixed 30-day window regardless of the selector; the 7/14/30 control only slices which already-fetched date columns render. Selected window persists in `localStorage` (key `trainingGridWindow`) instead of a `?window=` URL param. Column headers also clarified: top-left corner cell is blank, date headers render `formatHeaderDate()` (`DD.MM`) and are always generated from date functions (never the DB), so a no-tick day still gets its own column.

### F2 — New Vitest suite is never run in CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Test infrastructure
- **Detail**: `.github/workflows/ci.yml` runs exactly `astro sync` → `npm run lint` → `npm run build` (confirmed by sub-agent grep). The plan adds `scripts.test` to `package.json` but never updates `ci.yml` to run it. The entire justification for the testing exception was "a silent regression [in computeHighlights] would directly break the product's core value" — but as planned, such a regression can merge to `master` with fully green CI.
- **Fix A ⭐ Recommended**: Add `npm run test` to ci.yml in Phase 1
  - Strength: One extra line in an already-three-line workflow file; directly closes the gap the testing exception exists to prevent.
  - Tradeoff: Widens Phase 1's blast radius to include CI config, a file not otherwise touched by this feature.
  - Confidence: HIGH — trivial, low-risk addition alongside two structurally identical existing steps.
  - Blind spot: None significant.
- **Fix B**: Leave CI as-is; treat Vitest as a local/manual-only safety net
  - Strength: Keeps the plan's file changes narrowly scoped to the feature itself.
  - Tradeoff: A `computeHighlights` regression can merge to `master` with green CI — undermining the stated reason for adding the test in the first place.
  - Confidence: HIGH — straightforward, but weakens the original justification to the point of contradiction.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — Phase 1 now adds a "CI wiring" change to `.github/workflows/ci.yml` (`npm run test` step after `npm run lint`, before `npm run build`), with a matching automated success criterion and progress item (1.5).

### F3 — Static (no client directive) React render has no precedent in this codebase

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — Grid component (static version)
- **Detail**: Every existing React component reference in this codebase carries a `client:load` or `client:only="react"` directive (7 confirmed examples, 0 counterexamples). Phase 3 renders `TrainingGrid.tsx` from `grid.astro` with no directive at all. This is functionally correct (Astro renders undirected framework components to static HTML by default) but is a first-of-its-kind pattern here.
- **Fix**: Add one sentence to Phase 3's `TrainingGrid.tsx` contract stating explicitly that the missing directive is intentional and temporary — resolved on schedule when Phase 4 adds `client:load`.
- **Decision**: FIXED — Phase 3's `TrainingGrid.tsx` contract now states explicitly that the missing `client:` directive is intentional and first-of-its-kind in this codebase, resolved on schedule when Phase 4 adds `client:load`.
