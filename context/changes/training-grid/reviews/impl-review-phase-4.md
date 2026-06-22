<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Training Grid

- **Plan**: context/changes/training-grid/plan.md
- **Scope**: Phase 4 of 5
- **Date**: 2026-06-21
- **Verdict**: NEEDS ATTENTION (all findings fixed during triage)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — No cleanup of pending debounce timers on unmount

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useTrainingGrid.ts:36-76
- **Detail**: `pendingRef` holds a `setTimeout` per `elementId:date` key. If the grid unmounts (navigate away) within the 300ms debounce window, the timer still fires and sends a stray POST after the user has left the page.
- **Fix**: Add a `useEffect` cleanup in `useTrainingGrid` that clears every timer in `pendingRef.current` on unmount.
- **Decision**: FIXED — added unmount cleanup effect (captures `pendingRef.current` into a local const to satisfy `react-hooks/exhaustive-deps`).

### F2 — Window-preference cookie omits `Secure`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/training-grid/TrainingGrid.tsx:57-59
- **Detail**: `setWindowCookie` writes `document.cookie` without `Secure`. Value is a non-sensitive 7/14/30 display preference, so risk is minimal, but it's inconsistent with secure-cookie practice for a production HTTPS app.
- **Fix**: Append `; Secure` conditionally on `location.protocol === "https:"` (unconditional would break cookie round-trip in local dev over plain `http://localhost`).
- **Decision**: FIXED.

### F3 — Progress item 4.7 still says "localStorage"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: context/changes/training-grid/plan.md:473
- **Detail**: Stale wording from before the cookie adaptation — actual (cookie-based) behavior is correct; only the Progress row's title text wasn't updated.
- **Fix**: Reword to reference the cookie, with a pointer to Implementation Adaptations.
- **Decision**: FIXED.

### F4 — sticky-colors.ts not listed in Phase 4's file list

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: src/components/training-grid/sticky-colors.ts
- **Detail**: Real, justified code (opaque sticky-cell backgrounds, iOS Safari bleed-through requirement), but not named in Phase 4's "Changes Required" or "Implementation Adaptations". Pure documentation gap.
- **Fix**: Add a short retroactive note to the plan's Implementation Adaptations.
- **Decision**: FIXED.

### F5 — `AbortController` in TickCell doesn't actually abort anything

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/components/training-grid/TickCell.tsx:29,46-49
- **Detail**: Used purely as a "this tap was superseded" flag, not to cancel the underlying fetch (which isn't abortable). Correct behavior, but the name could mislead a future reader into thinking it cancels the network request.
- **Fix**: Add a clarifying comment at the declaration site (kept the type/name — cheapest fix, no API change).
- **Decision**: FIXED.

## Notes

Both sub-agents (plan-drift detection, safety/quality/pattern scan) independently confirmed every Phase 4 "Changes Required" item and all four (now five, after F4) Implementation Adaptations entries MATCH the actual code. No missing implementation, no critical findings. The two real mobile bugs reported by the user in this session (missing `initial-scale=1` on Layout.astro, and TickCell's `sr-only`-clipped checkbox triggering a mobile zoom-to-focus bug) were both fixed and user-confirmed before this review ran, and both adaptations passed drift-check as MATCH.
