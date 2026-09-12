<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Competition Results Core (S-01) Implementation Plan

- **Plan**: context/changes/competition-results-core/plan.md
- **Mode**: Deep
- **Date**: 2026-09-06
- **Verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

6/8 sampled paths accurate, 2 corrected (see F4; `src/pages/dashboard.astro` does not hold the grid link — `src/pages/dogs/[id]/dashboard.astro` does). 5/5 symbols verified (`getTrainingWindow`, `set_updated_at()`, `training_logs_insert_authenticated`, `HighlightColor`, `elementBelongsToDog`). Brief↔plan consistent.

Riskiest claims verified via sub-agent against the live code:

- `training_logs_insert_authenticated`'s cross-FK `WITH CHECK` shape is an accurate precedent for the new `competition_scores` policy.
- `set_updated_at()` is schema-generic and reusable; currently only `dogs` uses it.
- `TrainingBoard`'s tie logic is a hardcoded 3-tier algorithm (n≤3 / 4–6 / ≥7) with rank-1-only tie expansion — confirmed it does NOT generalize to top-2/bottom-2, so `CompetitionBoard.highlights()` is genuinely new code, not a parameter tweak.
- Existing 409 responses in the codebase come from a check-then-insert race (`isDogNameTaken`/`isElementNameTaken`), not from catching Postgres `23505` — the plan's `createCompetition` approach is a new (and arguably better, race-free) pattern, not a mirrored one.
- `mobile-grid.spec.ts` exists with the described structure (ARIA-role locators, try/finally self-cleanup).
- `post-mvp-notes.md:127-131` supports the "DB CHECK over API-only" half of the plan's precedent claim but says nothing about `service_role` grants — that half rests on `[[supabase_grants_service_role]]` alone, a reasonable but stretched pairing.

## Findings

### F1 — AddCompetitionDialog contract omits the 401 → sign-in redirect

- **Severity**: CRITICAL
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 7, item 6 — AddCompetitionDialog.tsx
- **Detail**: Matches the recurring failure pattern recorded in `context/foundation/lessons.md` ("Every client handler for a mutating action must redirect to /auth/signin on 401"). ScoreCell's contract (Phase 7 item 5) explicitly states the 401 redirect "per the established lesson"; AddCompetitionDialog's contract only specifies a new 409 branch and relies on "mirrors AddElementDialog.tsx ... exactly" to imply the 401 handling. Verified `AddElementDialog.tsx:43-46` does have the 401 redirect, so the intent is probably there, but the plan's own convention elsewhere is to spell this out explicitly rather than leave it implicit.
- **Fix**: Add an explicit line to AddCompetitionDialog's Contract: "401 → `window.location.href = '/auth/signin'`, checked before the 409 branch (mirrors AddElementDialog.tsx:43-46 and ScoreCell's handling)."
- **Decision**: REJECTED — user determined AddCompetitionDialog is a modal only reachable from within an already-loaded page (not a standalone route), so the redirect isn't needed; falls through to the generic toast-error branch instead. Codified as a new exception on the lessons.md rule (scoped to non-deep-linkable modal dialogs only; does not extend to inline handlers like ScoreCell). Plan updated accordingly.

### F2 — Phase 1 grants a live DELETE capability for a feature explicitly out of scope

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 1, item 1 — `competitions` table RLS
- **Detail**: "What We're NOT Doing" defers "editing or deleting an existing competition" to new roadmap slice S-07, whose own entry warns "the main risk is under-scoping the confirmation UX for a destructive action." Yet Phase 1 adds a DELETE RLS policy on `competitions` and GRANTs DELETE to `authenticated` now. No UPDATE policy is added, correctly, because "no edit path exists" this slice — but that same reasoning isn't applied to DELETE. Result: any authenticated owner can already cascade-delete a competition and its scores via a direct Supabase client call this slice, with zero UI, no confirmation, no test coverage — the exact capability S-01 says it's deferring.
- **Fix A ⭐ Recommended**: Drop the DELETE policy on `competitions` from this migration; add it in S-07 alongside the API route + confirmation UI that exposes it.
  - Strength: Keeps DB capability in lockstep with shipped, tested, UX-guarded features — mirrors the plan's own UPDATE-omission logic.
  - Tradeoff: S-07 needs one more migration instead of reusing this one.
  - Confidence: HIGH — mirrors the plan's own reasoning for omitting UPDATE.
  - Blind spot: None significant.
- **Fix B**: Keep the DELETE policy now per CLAUDE.md's "one policy per operation" convention; document that direct-API delete is possible but unused this slice.
  - Strength: One migration instead of two; de-risks S-07's schema work.
  - Tradeoff: Ships a live, unconfirmed delete path in tension with the stated scope boundary and S-07's own confirmation-UX risk note.
  - Confidence: MEDIUM — CLAUDE.md's convention is about RLS hygiene, not a mandate to pre-provision unshipped features.
  - Blind spot: Whether `competition_scores`' cascade-delete-on-parent is itself desired before S-07 ships.
- **Decision**: Fix B (keep DELETE policy now) — user-confirmed. Documented as a live, direct-API-only capability in Phase 1's migration and in "What We're NOT Doing"; flagged as an accepted risk in plan-brief.md.

### F3 — Leap-year boundary behavior for the last-year window is unspecified

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — `getCompetitionWindow`
- **Detail**: Success Criteria requires a unit test for "a leap-year Feb 29 boundary case," but the Contract never states the expected value. Naive `Date.UTC` arithmetic on Feb 29 overflows into March 1 of a non-leap target year rather than clamping to Feb 28. No existing helper crosses this edge case (`getTrainingWindow` is day-count only), so there's no precedent to copy — the implementer has to invent the oracle mid-test-write.
- **Fix A ⭐ Recommended**: Specify "Feb 29 → Feb 28 of the target year" (clamp-to-last-valid-day) as the contracted behavior.
  - Strength: Matches the calendar-subtraction behavior most users expect from a "1 year ago" cutoff.
  - Tradeoff: A few extra lines of clamping logic vs. a one-line `setUTCFullYear` call.
  - Confidence: MEDIUM — no existing codebase precedent either way; genuine new design call.
  - Blind spot: PRD/research don't mention this edge case; no user-confirmed answer to fall back on.
- **Fix B**: Accept the natural JS `Date` rollover (Feb 29 → Mar 1) and state that explicitly as the contracted value.
  - Strength: Zero extra code; fully deterministic and easy to test.
  - Tradeoff: An occasionally 1-2-day-longer window is a subtle, hard-to-notice correctness gap.
  - Confidence: LOW — not validated against how the window is described in the UI copy.
  - Blind spot: Whether the UI ever surfaces the exact boundary date to a handler.
- **Decision**: Fix A (clamp Feb 29 → Feb 28) — user-confirmed. Contracted in Phase 2's Contract and Success Criteria.

### F4 — Dashboard nav-link file path is wrong

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 7, item 7 — Dashboard nav link
- **Detail**: Plan cites `src/pages/dashboard.astro (or wherever the existing grid link lives)`. Verified: `src/pages/dashboard.astro` only lists dogs and links to each dog's `/dogs/${id}/dashboard` — no grid link there. The actual "View training grid" link lives in `src/pages/dogs/[id]/dashboard.astro:49-54`.
- **Fix**: Change the file target to `src/pages/dogs/[id]/dashboard.astro`, adding the new link next to the existing "View training grid" link (lines 49-54).
- **Decision**: ACCEPTED — plan updated.

### F5 — Right-sticky z-index stack not restated in the plan

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 7, item 4 — CompetitionResultsGrid.tsx
- **Detail**: Already flagged as an open risk in plan-brief.md and covered by a dedicated manual-verification step in Phase 7. Full existing sticky z-index stack in TrainingGrid.tsx: top-left corner `z-30`, date headers and left name column `z-20`, and a `z-40` overlay for service-unavailable/empty states. The new top+right sticky corner needs to sit at/above `z-30`, right-column body cells need to clear `z-20`, and everything needs to stay below `z-40`. The plan doesn't restate these values.
- **Fix**: Add the concrete z-index values (z-20/z-30/z-40) to Phase 7 item 4's Contract.
- **Decision**: ACCEPTED — plan updated.
