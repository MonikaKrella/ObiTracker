<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Training Elements Implementation Plan

- **Plan**: context/changes/training-elements/plan.md
- **Scope**: All 4 Phases (full plan)
- **Date**: 2026-06-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated checks

- `npm run build` ✅ — Complete in 20.69s, no errors
- `npm run lint` ✅ — clean (only pre-existing `astro-eslint-parser`/`projectService` warnings)
- Migration `supabase/migrations/20260610000001_reorder_training_elements_fn.sql` exists, correct `$$...$$` quoting, `SECURITY INVOKER` (no `DEFINER`), `REVOKE`/`GRANT` to `authenticated` present
- All 4 mutating-action handlers (Add/Rename/Delete/Reorder) check `res.status === 401` → `/auth/signin` before any other error handling (lesson: "Every client handler for a mutating action must redirect to /auth/signin on 401")
- `originalOrder` `useState` adaptation (vs. plan's `useRef`, required by `eslint-plugin-react-hooks@7.1.1`'s `react-hooks/refs` rule) applied consistently across all touch points — semantics fully preserved
- `anon` EXECUTE on `reorder_training_elements` — pre-existing default-ACL gap, already recorded as lesson "Explicitly revoke EXECUTE from `anon` on RPC functions meant for `authenticated` only", consistent with `soft_delete_dog`, no new action

## Findings

### F1 — roadmap.md status updates bundled into Phase 1 commit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (commit fdb7b94)
- **Detail**: Phase 1's commit ("Data layer (CRUD) (p1)") also marks F-01/S-01/S-02 as done/merged in the roadmap and populates the "Done" table. Not training-elements scope (S-03 stays "proposed" throughout) — housekeeping for already-shipped prior slices, deliberately bundled into the first commit of this change.
- **Fix**: None needed — informational only. Explains why a "Data layer (CRUD)" commit touches a non-data-layer file.
- **Decision**: ACCEPTED — informational, no action.

### F2 — alert-dialog.tsx / button.tsx restyle has a blast radius beyond training-elements

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/ui/alert-dialog.tsx, src/components/ui/button.tsx (commit d15aef9)
- **Detail**: Phase 3 restyled the shared `AlertDialog` primitives and the `Button` `outline` variant to the dark-glass theme used by the new dialog/input components. Not in the plan's "Changes Required", but verified intentional and consistent: `DeleteDogModal` (uses `AlertDialog`) and `DogSwitcher` (uses `Button variant="outline"` with a hand-rolled `BUTTON_CLASS` override matching the *new* default exactly) both pick this up as a side effect — net effect is more consistency, not a mismatch.
- **Fix**: Optional follow-up — `DogSwitcher`'s now-redundant `BUTTON_CLASS` override could be removed since `variant="outline"` now produces the same classes. Cosmetic, not urgent.
- **Decision**: ACCEPTED — optional cosmetic follow-up, not actioned now.

### F3 — createTrainingElement nextPosition has a benign read-then-write race

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/training-elements.ts (createTrainingElement)
- **Detail**: Two concurrent creates for the same dog could both read the same max `sort_position` and insert with the same value — `sort_position` has no UNIQUE constraint. Per CLAUDE.md ("no sharing, no multi-user access to a dog's data"), concurrent creates for one dog are effectively a single-actor double-tap, and `getTrainingElements`'s `created_at` tiebreaker keeps ordering deterministic either way.
- **Fix**: None needed now — accepted given the single-user-per-dog model. Worth revisiting only if multi-tab/multi-device concurrent use becomes a real scenario.
- **Decision**: ACCEPTED — risk accepted given current single-user-per-dog model.
