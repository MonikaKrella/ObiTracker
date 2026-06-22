<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Training Grid

- **Plan**: context/changes/training-grid/plan.md
- **Scope**: Full plan — Phase 1 of 5 through Phase 5 of 5
- **Date**: 2026-06-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — In-flight request race in useTrainingGrid.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useTrainingGrid.ts:57
- **Detail**: The pending-toggle map entry for a key is deleted synchronously the instant the debounce timer fires (line 57), before the `await fetch(...)` that follows begins. If the user taps the same cell again while that fetch is still in flight (slow network, round-trip > 300ms), the new tap's baseline is computed as `!next` — it assumes the in-flight request has already resolved against the prior server state, when it hasn't. A second POST can fire against a cell whose true server state is still being mutated by the first request. No data corruption (the endpoint just flips whatever the row currently holds, so it converges to _some_ valid boolean) but the displayed/optimistic state can desync from the true DB state until the next reload, for users on poor connectivity who tap quickly. The Phase-4 review already added unmount-timer cleanup for the debounce-window race; this is a distinct, narrower race in the in-flight-request window that wasn't covered by that fix.
- **Fix A ⭐ Recommended**: Accept as risk, document why
  - Strength: Needs round-trip latency > 300ms _and_ a second tap landing in that exact window — narrow in practice, and the failure mode is "stale display until reload," not data loss or a wrong final DB state for any single tap's intent.
  - Tradeoff: A real (if rare) UI/DB desync can linger until reload.
  - Confidence: MED — no production latency data for this app to size the actual exposure.
  - Blind spot: Haven't measured real-world round-trip times for the toggle endpoint under load.
- **Fix B**: Track "request in flight" per key, not just "timer pending"
  - Strength: Closes the race fully — a tap during an in-flight request would supersede/queue exactly like a tap during the debounce window already does.
  - Tradeoff: Non-trivial restructuring of `useTrainingGrid`'s state shape (needs an in-flight set/map alongside `pendingRef`, plus re-deriving `baseline` from the in-flight request's target value rather than assuming it already landed).
  - Confidence: MED — straightforward in concept, but easy to introduce a new edge case (e.g. three-tap bursts) without a test harness for this hook.
  - Blind spot: No unit tests exist for this hook (only `highlight.ts` has the testing exception), so a fix here ships unverified by anything but manual taps.
- **Decision**: ACCEPTED (Fix A) — documented as an accepted risk in plan.md's Implementation Adaptations section ("In-flight-request race window in `useTrainingGrid.ts` (accepted as risk)"). No code change.

### F2 — `elementBelongsToDog` ownership check undocumented in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/training-elements.ts:132
- **Detail**: `elementBelongsToDog` is a real, sensible defense-in-depth ownership check — confirmed wired into `src/pages/api/dog/[id]/logs/index.ts`, called and enforced before `toggleTrainingLog`, returning 404 on a cross-dog `elementId` before any write happens. But it's not named in Phase 2's "Changes Required" contract (which only lists `training-logs.ts` and the route) and not recorded in the plan's "Implementation Adaptations" section. Same shape as the already-resolved F4 from the Phase 4 review (`sticky-colors.ts` undocumented) — good code, pure documentation gap.
- **Fix**: Add a short retroactive note to plan.md's Implementation Adaptations section describing `elementBelongsToDog` and why it exists (RLS `WITH CHECK` is the primary boundary; this is the app-level belt-and-suspenders check), mirroring the existing sticky-colors.ts note.
- **Decision**: FIXED — added "Undocumented function: `elementBelongsToDog` ownership check" to plan.md's Implementation Adaptations section.

### F3 — `.gitattributes` undocumented in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .gitattributes:1
- **Detail**: New repo-root file, `* text=auto eol=lf` — confirmed single-purpose line-ending normalization, no unexpected scope. Not named in any phase's "Changes Required" or in Implementation Adaptations. Repo-wide (not training-grid-scoped) infra fix, same shape as the `Layout.astro` viewport-meta and `button.tsx` focus-ring adaptations already documented — a fix this plan's work surfaced, applying beyond the feature itself.
- **Fix**: Add a short retroactive note to plan.md's Implementation Adaptations section, same pattern as the `Layout.astro`/`button.tsx` entries (a pre-existing repo-level issue surfaced — and fixed — by this change's work, not a training-grid-specific decision).
- **Decision**: FIXED — added "Undocumented new file: `.gitattributes`" to plan.md's Implementation Adaptations section.

## Notes

Full-plan sweep across all 5 phases via two parallel sub-agents (plan-drift detection; safety/quality/pattern compliance), plus a fresh run of all automated success criteria.

- **Plan Adherence**: PASS — no DRIFT or MISSING items found across all 5 phases. Every "Changes Required" contract item matches the actual code, including all 6 previously-documented Implementation Adaptations (cookie persistence, highlight-recompute timing fix, viewport `initial-scale=1` fix, `sr-only`→opaque-overlay checkbox fix, `sticky-colors.ts`, destructive-button focus ring).
- **Phase 4 fixes re-confirmed**: all 5 findings from `reviews/impl-review-phase-4.md` (debounce-timer unmount cleanup, `Secure` cookie flag, stale Progress wording, `sticky-colors.ts` documentation, `AbortController` naming comment) remain correctly applied in the current code — no regressions.
- **Known risk areas verified correct**: `toggleTrainingLog`'s `error.code === "23505"`-gated INSERT→DELETE fallback (rethrows all other errors); `isWindowDays`-validated cookie before SSR trust (a hand-edited cookie can't inject an out-of-range window); no schema changes / no new migrations anywhere in the diff.
- **Automated verification — all passed fresh**: `npm run lint` (clean), `npm run test` (12/12 passed), `npm run build` (succeeded), `.github/workflows/ci.yml` confirmed to run `npm run test` between `lint` and `build`.
- **Manual verification**: all Progress-section manual checks are `[x]` with commit-sha evidence; two items (4.11 iOS Safari, 5.5 screen reader) are honestly marked "skipped — accepted as risk" rather than rubber-stamped.
- No CRITICAL findings anywhere: no injection risks, no hardcoded secrets, no missing authn/authz at boundaries, no destructive-DB-op-without-rollback issues.
