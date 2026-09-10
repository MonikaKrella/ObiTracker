---
change_id: class-number-denormalization
title: Class number denormalization
status: implemented
created: 2026-09-09
updated: 2026-09-10
archived_at: null
---

## Notes

**Depends on**: `competition-results-core` must be fully implemented first (it is — see research.md). **Decision (2026-09-10, user)**: ship both changes together in one PR/branch rather than merging `competition-results-core` first — this avoids a prod deploy window where `class_id`/`competition_classes` exist and then need a separate live-data migration. `competition-results-core` should not be archived separately; it closes out together with this change when the combined PR merges.

### Goal

Replace `class_id` (uuid FK to `competition_classes`) with `class_number` (smallint, `CHECK`-validated) on `exercises` and `competitions`, and drop the `competition_classes` table entirely. Class display metadata (`name`, `sort_position`) moves into application code (a const module), keyed by `class_number`.

### Why (from discussion)

- `competition_classes` is fixed rulebook data (FR-005/FR-006) — no INSERT/UPDATE/DELETE policy exists for any role, so it is never written by the app. A lookup table is architectural overhead for 3 rows that only ever change via a manual out-of-band migration.
- `class_number` is explicitly assigned in the seed migration (not `gen_random_uuid()`-derived), so unlike `class_id` it is identical across every environment. This also makes `?classNumber=1`-style URLs portable across environments (a link copied from prod to dev still resolves), unlike today's `?classId=<uuid>`.
- A `CHECK (class_number IN (1,2,3))` constraint gives the same DB-level integrity guarantee a FK would (CLAUDE.md's rule is "DB constraints over API-only validation," not "FK over CHECK specifically").

### Explicitly NOT changing

- `exercises` keeps its own real `uuid` `id` PK — exercises are genuinely relational (29 real rows with distinct name/multiplier/sort*position), not enum-like, and `competition_scores.exercise_id` needs real per-row identity to match `ScoreRecord.exerciseId` in `CompetitionBoard`. Only the \_class linkage* on `exercises` and `competitions` changes from `class_id` to `class_number`.
- `competition_scores.exercise_id` (uuid FK to `exercises.id`) is unaffected.

### Places that need to be updated (grepped against `class_id`/`classId`/`competition_classes` on 2026-09-09 — verify still current when planning)

**Schema** (new forward migration(s) — the `competition-results-core` migrations will already be applied, so this is an ALTER + backfill + drop, not an edit to history):

- `exercises`: add `class_number smallint NOT NULL CHECK (class_number IN (1,2,3))`, backfill from `competition_classes.class_number` via the existing `class_id` join, then drop `class_id` column/FK.
- `competitions`: same add/backfill/drop pattern for `class_id` → `class_number`.
- Drop `competition_classes` table (RLS policies, grants, the table itself). Rollback script must restore + reseed it.
- New const module (e.g. `src/lib/domain/competition-classes.ts` or `src/const.ts`) holding `{ class_number, name, sort_position }` for the 3 classes — replaces `getCompetitionClasses()`'s DB fetch entirely.

**`src/` (8 files, from grep)**:

- `src/types.ts` — `CompetitionClass` type, `Competition.class_id` → `class_number`, `Exercise.class_id` → `class_number`
- `src/lib/services/competition.ts` — `getCompetitionClasses`, `getExercisesForClass`, `getExercisesForClassNumber` (likely collapses to one function once class_number is the direct FK)
- `src/lib/services/competitions.ts` — `createCompetition(..., classId, ...)`, `getCompetitionsForDogClass(..., classId, ...)`
- `src/lib/services/competition-board.ts` — `loadCompetitionBoard(..., classId: ..., ...)`
- `src/pages/dogs/[id]/competition-results.astro` — `?classId=` query param → `?classNumber=`, default-class resolution logic
- `src/pages/api/dog/[id]/competitions/index.ts` — POST body `{ classId: uuid }` → `{ classNumber: number }` (breaking API contract change — zod schema update)
- `src/components/competition-results/CompetitionResultsGrid.tsx` — class `Select`'s value/navigation logic
- `src/components/competition-results/AddCompetitionDialog.tsx` — POSTs `classId` today

**`tests/` (5 files, from grep)**:

- `tests/helpers/db.ts` — `seedCompetition(..., classId, ...)` signature
- `tests/unit/cross-account-authorization.test.ts`
- `tests/unit/data-integrity.test.ts`
- `tests/unit/competition-board.test.ts`
- `tests/unit/competition-reference-data.test.ts`

### Open questions to resolve during planning

- Confirm whether `?classId=` → `?classNumber=` is an acceptable breaking change to any already-bookmarked/shared URLs (none expected pre-launch, but worth a conscious call).
- Confirm the migration backfill approach handles the case where `competition-results-core` has already accumulated real `competitions`/`competition_scores` rows in any deployed environment before this change ships.
- Decide exact shape/location of the new const module for class display data (name/sort_position by class_number).
