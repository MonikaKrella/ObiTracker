<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Training Elements Implementation Plan

- **Plan**: context/changes/training-elements/plan.md
- **Mode**: Deep (verified directly, no sub-agent needed)
- **Date**: 2026-06-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

13/13 paths ✓, 5/5 symbols ✓, brief↔plan ✓, Progress↔Phase ✓

Verified directly against the codebase:

- RLS policies on `training_elements` (`supabase/migrations/20260530000002_create_training_elements.sql`) — confirmed `sort_position` is not referenced by any policy, so the Phase 4 reorder RPC's `SECURITY INVOKER` (default) reasoning holds.
- `training_logs.element_id ON DELETE CASCADE` (`supabase/migrations/20260530000003_create_training_logs.sql:13`) — confirmed.
- `src/components/hooks/useMounted.ts` — matches the described `useSyncExternalStore` contract.
- `src/lib/services/dogs.ts` `isDogNameTaken` — confirmed it escapes `%`/`_` but not `\`, matching the plan's claim of a gap this plan fixes.
- `src/components/ui/` — confirmed `dialog`/`input` not yet installed (only `alert-dialog`, `button`, `dropdown-menu`, `sonner`).
- `package.json` — confirmed no `@dnd-kit/*` dependency yet; `lucide-react` present.
- `src/pages/dogs/[id]/dashboard.astro:25-29` — placeholder tile matches plan's description.
- `src/types.ts` — `TrainingElement` / `NewTrainingElement` already defined as described.
- `src/middleware.ts` — `/dogs/<uuid>/*` protection and `selectedDog` resolution confirmed; no middleware changes needed.
- `supabase/migrations/20260531000002_soft_delete_dog_fn.sql` — `SECURITY DEFINER` rationale confirmed, contrasts correctly with Phase 4's `SECURITY INVOKER` choice.
- Roadmap / roadmap-suggestions S-03 — hard-delete decision, confirmation-step requirement, and `MAX(sort_position)+1` rule all confirmed as resolved/intentional.
- Progress section: exactly one `## Progress` block, all 4 phases present with matching headings, every Automated/Manual success-criteria bullet has a 1:1 `- [ ]` entry (Phase 1: 1.1-1.12, Phase 2: 2.1-2.8, Phase 3: 3.1-3.13, Phase 4: 4.1-4.13).

## Findings

### F1 — DeleteElementDialog contract omits the 401 redirect required by 3.12

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, §5 DeleteElementDialog (vs. Manual Verification 3.12 / Progress 3.12)
- **Detail**: AddElementDialog (§3) and RenameElementDialog (§4) each list a dedicated bullet: "401 → `window.location.href = "/auth/signin"`". DeleteElementDialog (§5) collapses every non-success response into a single bullet: "error → close the dialog, `toast.error(data.error ?? "Failed to delete element")`" — no 401 branch.

  Phase 3's manual verification says "A 401 (expired session) on any action navigates to `/auth/signin`" (3.12 / Progress 3.12), and "any action" includes delete. The plan's own reference for the delete pattern, `src/components/dogs/DeleteDogModal.tsx`, also has no 401-redirect branch (a 401 there falls into `toast.error(data.error ?? "Failed to delete dog")`, i.e. would show "Unauthorized" as a toast). Implementing §5 exactly as written, or by copying `DeleteDogModal` as referenced, fails 3.12 for the delete action.

- **Fix**: Add a `401 → window.location.href = "/auth/signin"` bullet to DeleteElementDialog's contract (§5), checked before the generic "error" branch — matching AddElementDialog/RenameElementDialog.
- **Decision**: FIXED (applied; for consistency, the same `401 → window.location.href = "/auth/signin"` bullet was also added to the Phase 4 §6 "Save order" handler in TrainingElementsManager, which had the identical gap)

### F2 — Check-then-insert race on the unique-name constraint surfaces as a generic 500 instead of a 409

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 1, §1 createTrainingElement / §2 create API route
- **Detail**: `isElementNameTaken` (check) and the insert in `createTrainingElement` are two separate round trips. If two requests for the same dog+name race between the check and the insert (e.g. the same name submitted from two tabs within milliseconds), the second insert hits the DB-level `UNIQUE (dog_id, name)` constraint (`training_elements_dog_id_name_unique`, confirmed in `20260530000002_create_training_elements.sql`) and throws a Postgres `23505`, which the route's catch-all returns as a 500 with the raw "duplicate key value violates unique constraint..." message.

  AddElementDialog's contract maps any 500 to a generic "Something went wrong — please try again" toast (not `data.error`), so the raw message never reaches the user, and a retry would correctly hit the 409 path. Pure FYI — accepted-risk grade, no action needed unless belt-and-braces handling of `23505` → 409 is wanted in the create/rename routes.

- **Decision**: SKIPPED (per user instruction — accepted-risk grade, not worth addressing now)

## Triage Summary (2026-06-10)

- **Fixed**: F1 — added `401 → window.location.href = "/auth/signin"` to DeleteElementDialog (Phase 3, §5) and, for consistency, to the "Save order" handler in TrainingElementsManager (Phase 4, §6), which had the identical gap.
- **Skipped**: F2 — accepted-risk grade, not addressed.
- **Lesson recorded**: `context/foundation/lessons.md` — "Every client handler for a mutating action must redirect to /auth/signin on 401."
- **Verdict after fixes**: SOUND (unchanged — Plan Completeness now PASS).
