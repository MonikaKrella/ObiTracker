# Class Number Denormalization Implementation Plan

## Overview

Replace `class_id` (uuid FK to `competition_classes`) with `class_number` (smallint, `CHECK`-validated) on `exercises` and `competitions`, and remove `competition_classes` entirely. Class display metadata (`name`, `sort_position`) moves into a new `src/const.ts` module, keyed by `class_number`. This ships in the same unmerged PR/branch as `competition-results-core`, so the 4 migrations that created these tables are rewritten in place rather than layered with a follow-up ALTER+backfill+DROP — `competition_classes` and `class_id` never appear in migration history at all.

## Current State Analysis

`competition-results-core` is fully implemented (all 8 plan phases, impl-reviewed with 0 critical findings) but unmerged, living on the `competition-results` branch alongside this change. `competition_classes` is a 3-row fixed rulebook table with no INSERT/UPDATE/DELETE policy for any role — it's never written by the app, only read. `exercises.class_id` and `competitions.class_id` are both `uuid` FKs into it. `competition_classes.class_number` already exists today (added by a precursor migration ahead of this table's own creation date), and `getExercisesForClassNumber` already reads it — but only to resolve a `class_id` to then re-query `exercises`.

## Desired End State

`class_id` and `competition_classes` do not exist anywhere — not in the schema, not in `src/`, not in `tests/` (verified by a repo-wide grep returning zero hits outside historical `context/changes/**` docs). `exercises.class_number` and `competitions.class_number` are `smallint NOT NULL CHECK (class_number IN (1,2,3))` columns, populated directly (no FK). Class display metadata (name, sort_position) comes from `src/const.ts`, imported wherever it's needed — server (zod validation, default-class resolution) and client (the class `Select`) alike. All existing competition-results functionality (class switching, adding competitions, scoring, RLS enforcement, green/red highlighting) behaves identically to today, just keyed by `class_number` instead of `class_id`.

### Key Discoveries:

- `competition_classes.class_number` already exists (`supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql`) — this migration becomes entirely vestigial once `competition_classes` itself is removed from its creation migration, and is deleted outright.
- `CompetitionBoard` (`src/lib/domain/competition-board.ts`) never reads `class_id`/`class_number` at all — zero domain-layer impact, confirmed by its own test fixture comment ("only `id` matters to CompetitionBoard").
- `competition_scores`'s RLS INSERT/UPDATE policies (`supabase/migrations/20260906000002_create_competition_scores.sql:57-62,75-80`) do a live `EXISTS` join comparing `exercises.class_id = competitions.class_id` — the one piece of real _behavior_ (not just a column rename) in this change; it becomes `exercises.class_number = competitions.class_number`, same structure.
- `src/components/competition-results/window-options.ts` is the closest existing precedent for a flat const-array module in this codebase, though it's UI-scoped; `src/const.ts` (this plan's choice) is a new top-level location with no prior precedent to follow.

## What We're NOT Doing

- Not changing `exercises.id` — it stays a real `uuid` PK (exercises are genuinely relational: 29 distinct rows with their own name/multiplier/sort_position, and `competition_scores.exercise_id` needs real per-row identity).
- Not changing `competition_scores.exercise_id`'s FK to `exercises.id`.
- Not adding any admin UI to edit classes — still fixed rulebook data, unchanged by this migration.
- Not adding a `?classId=` back-compat redirect or dual-read — the param rename ships before any prod exposure, so it's a clean rename with no shim.
- Not archiving `competition-results-core` separately — it closes out together with this change when the combined PR merges.
- Not adding new features or UX beyond the mechanical `class_id` → `class_number` rename.

## Implementation Approach

Two phases, split along the one genuinely independently-verifiable boundary in this change: the database migrations (verifiable via `supabase db reset` alone, no TypeScript involved) versus everything else. Every other file — types, services, the API route's zod schema, both UI components, the Astro page, and all 5 test files — changes together as one coherent phase, because TypeScript's project-wide compilation and vitest's integration tests only pass once every consumer of the renamed field is updated in lockstep; there's no meaningful intermediate "half-renamed" state to gate automated verification on.

The DB-level integrity guarantee moves from a FK constraint to a `CHECK (class_number IN (1,2,3))` constraint on both `exercises` and `competitions`, and the `competition_scores` RLS cross-check is preserved exactly (same `EXISTS` join shape, just comparing `class_number` instead of `class_id`) — this is a rename of the enforcement mechanism's key, not a weakening of it.

## Critical Implementation Details

**Radix `Select` value coercion**: `CompetitionResultsGrid.tsx`'s class `Select` (Radix UI) only ever carries `string` values through `onValueChange`/`SelectItem value=`. Today `cls.id` is already a string (uuid), so this was implicit; once the value is `class_number` (a `number`), `SelectItem`'s `value` must be `String(cls.class_number)` and `handleClassChange`'s incoming string must be parsed back with `Number(...)` before it's used to build the `?classNumber=` URL or update state typed as `number`. Easy to miss since nothing forces the mismatch to surface until a stray `"1"` string ends up compared against a `number` elsewhere.

## Phase 1: Schema

### Overview

Rewrite the 4 existing `competition-results-core` migrations in place so `exercises` and `competitions` carry `class_number` directly from creation, `competition_classes` never exists, and the now-vestigial class-number-backfill migration is deleted. Independently verifiable via a local Supabase reset — no application code touched in this phase.

### Changes Required:

#### 1. Competition reference data migration

**File**: `supabase/migrations/20260903000001_create_competition_reference_data.sql`

**Intent**: Remove the `competition_classes` table (and its RLS policies/grants) entirely. Give `exercises` a `class_number smallint NOT NULL CHECK (class_number IN (1,2,3))` column in place of `class_id uuid ... REFERENCES competition_classes(id)`. Reseed the 29 exercise rows with `class_number` as a literal value per row instead of joining through `competition_classes` by name.

**Contract**: `exercises` unique constraints become `UNIQUE (class_number, name)` and `UNIQUE (class_number, sort_position)` (renamed from the `class_id`-keyed versions, same semantics). The seed `INSERT`s drop their `SELECT ... FROM competition_classes WHERE competition_classes.name = 'Class N'` wrapper — each class's block becomes a direct multi-row `INSERT INTO exercises (class_number, name, shortcut, multiplier, sort_position) VALUES (...)`, e.g. for Class 1's first two rows:

```sql
INSERT INTO exercises (class_number, name, shortcut, multiplier, sort_position) VALUES
  (1, 'Sitting in a group', 'Group', 3, 1),
  (1, 'Heelwork', 'Heelwork', 4, 2),
  -- ...remaining Class 1 rows...
```

(repeat the same restructuring for all 29 rows across the 3 classes, preserving every existing name/shortcut/multiplier/sort_position value exactly). Update the file's rollback comment block to drop the new constraints/column instead of the old table, and update the header comment (currently explains `competition_classes`' rationale) to describe `exercises.class_number` instead.

#### 2. Class-number backfill migration — delete

**File**: `supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql`

**Intent**: This migration only ever added `class_number` to `competition_classes`, which no longer exists as of the rewritten migration above. Delete the file outright — nothing it did is still needed.

**Contract**: File removed from `supabase/migrations/`.

#### 3. Competitions table migration

**File**: `supabase/migrations/20260906000001_create_competitions.sql`

**Intent**: Same FK-to-CHECK swap as `exercises`: `class_id uuid NOT NULL REFERENCES competition_classes(id)` becomes `class_number smallint NOT NULL CHECK (class_number IN (1,2,3))`.

**Contract**: `competitions_dog_class_date_unique UNIQUE (dog_id, class_id, competed_on)` → `UNIQUE (dog_id, class_number, competed_on)`. `competitions_account_dog_class_date_idx ON competitions (account_id, dog_id, class_id, competed_on)` → `(account_id, dog_id, class_number, competed_on)`. Update the rollback comment block accordingly; also update the file's descriptive header comment's two `class_id` mentions (lines 8, 10 — "composite index" and "App code must always populate...") to `class_number`. No RLS policy text needs to change (none reference `class_id` in this file).

#### 4. Competition scores migration

**File**: `supabase/migrations/20260906000002_create_competition_scores.sql`

**Intent**: Swap the cross-table consistency check's compared column from `class_id` to `class_number` — same enforcement, same `EXISTS` join shape.

**Contract**: In both `competition_scores_insert_authenticated` and `competition_scores_update_authenticated` policies, `exercises.class_id = competitions.class_id` → `exercises.class_number = competitions.class_number` (lines ~61 and ~79 in the current file). No other changes in this file.

### Success Criteria:

#### Automated Verification:

- [ ] Local Supabase reset applies all migrations cleanly: `npx supabase db reset`
- [ ] `supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql` no longer exists in the migrations directory

#### Manual Verification:

- [ ] Inspect the `exercises` and `competitions` table schemas (Supabase Studio or `psql`) — confirm `class_number smallint NOT NULL CHECK (...)` exists on both, and `class_id`/`competition_classes` do not exist anywhere in the schema
- [ ] Spot-check seeded exercise rows (`SELECT class_number, name, shortcut, multiplier, sort_position FROM exercises ORDER BY class_number, sort_position`) match the original 29-row rulebook dataset exactly, just keyed by `class_number` instead of joining through `competition_classes`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Application code & tests

### Overview

Propagate the `class_id` → `class_number` rename through every application-layer consumer and all tests, in one coherent phase (TypeScript's project-wide compilation and vitest's DB-integration tests only pass once every file is updated together).

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: Remove the `CompetitionClass` interface (metadata now lives in `src/const.ts`, not a DB-backed entity). Rename the class-linkage field on both remaining entities.

**Contract**: `Exercise.class_id: string` → `Exercise.class_number: number`. `Competition.class_id: string` → `Competition.class_number: number`. `NewCompetition = Pick<Competition, "dog_id" | "class_id" | "competed_on">` → `Pick<Competition, "dog_id" | "class_number" | "competed_on">`.

#### 2. New const module

**File**: `src/const.ts` (new)

**Intent**: The single source of truth for class display metadata, replacing `getCompetitionClasses()`'s DB fetch. Importable from server code (API route's zod schema, the Astro page's default/validate logic) and client code (the React `Select`) alike.

**Contract**: Exports `COMPETITION_CLASSES`, a readonly array of `{ class_number: 1 | 2 | 3; name: string; sort_position: number }`, with the same 3 rows the DB seed currently has (`Class 1`/1/1, `Class 2`/2/2, `Class 3`/3/3), ordered by `sort_position`. Also exports a `CompetitionClassNumber` type (`1 | 2 | 3`, or derived as `(typeof COMPETITION_CLASSES)[number]["class_number"]`). No lookup/helper functions beyond the array — every consumer already knows whether it wants "all classes" (`.map`/`.find`) or "validate a number against the known set."

#### 3. Competition reference-data service

**File**: `src/lib/services/competition.ts`

**Intent**: Remove the DB-backed class lookup entirely; collapse the two exercise-fetch functions into one now that `class_number` is a direct, filterable column (no more class_number→class_id resolution round trip).

**Contract**: Delete `getCompetitionClasses`. Delete `getExercisesForClassNumber`. Rename `getExercisesForClass(supabase, classId: string)` → `getExercisesForClass(supabase, classNumber: number)`, filtering `.eq("class_number", classNumber)` in place of the old `.eq("class_id", classId)` — the classResult pre-fetch step in the old `getExercisesForClassNumber` is removed, since there's no id to resolve anymore.

#### 4. Competitions service

**File**: `src/lib/services/competitions.ts`

**Intent**: Rename the `classId` parameter and its DB column references throughout.

**Contract**: `getCompetitionsForDogClass(supabase, dogId, classId: string, startDate, endDate)` → `classNumber: number`, filtering `.eq("class_number", classNumber)`. `createCompetition(supabase, dogId, classId: string, accountId, competedOn)` → `classNumber: number`, inserting `{ ..., class_number: classNumber, ... }`. `exerciseBelongsToClass` — its two `.select`/`.eq("class_id", ...)` calls become `.eq("class_number", ...)`; same shape.

#### 5. Competition board loader

**File**: `src/lib/services/competition-board.ts`

**Intent**: Thread the renamed parameter through.

**Contract**: `loadCompetitionBoard(supabase, dogId, classId: string, window)` → `classNumber: number`, passed to the renamed `getExercisesForClass`/`getCompetitionsForDogClass` calls.

#### 6. Create-competition API route

**File**: `src/pages/api/dog/[id]/competitions/index.ts`

**Intent**: Validate `classNumber` against the known set of class numbers instead of accepting any uuid.

**Contract**: zod schema field `classId: z.uuid("Invalid class ID")` → `classNumber: z.union(COMPETITION_CLASSES.map((c) => z.literal(c.class_number)))` (imported from `@/const`), mirroring the DB's `CHECK (class_number IN (1,2,3))`. Destructure `classNumber` from the parsed body; pass it as `createCompetition`'s renamed `classNumber` argument.

#### 7. Competition results page

**File**: `src/pages/dogs/[id]/competition-results.astro`

**Intent**: Drop the DB fetch for classes; resolve and validate `?classNumber=` from the const module instead of `?classId=` against a fetched list.

**Contract**: Remove the `getCompetitionClasses` import/call and the `classes: CompetitionClass[]` state. Replace `requestedClassId`/`selectedClassId` resolution with: read `?classNumber=` from `Astro.url.searchParams`, parse as an integer, and validate it's present in `COMPETITION_CLASSES` (imported from `@/const`); fall back to the class with `sort_position === 1` when absent or invalid. Pass the resulting `selectedClassNumber: number` to `loadCompetitionBoard` and down to `CompetitionResultsGrid` — no `classes` prop is passed (the component imports `COMPETITION_CLASSES` itself, per the resolved data-flow decision).

#### 8. Competition results grid

**File**: `src/components/competition-results/CompetitionResultsGrid.tsx`

**Intent**: Source class options from the const module directly instead of a `classes` prop; key the `Select` and navigation on `class_number`.

**Contract**: Remove `classes: CompetitionClass[]` from `Props`; import `COMPETITION_CLASSES` from `@/const` for the `Select`'s options. `selectedClassId: string` prop → `selectedClassNumber: number`. `handleClassChange` takes the `Select`'s string value, converts with `Number(...)`, and navigates to `` `/dogs/${dogId}/competition-results?classNumber=${classNumber}` ``. `<Select value={String(selectedClassNumber)}>`; each `<SelectItem key={cls.class_number} value={String(cls.class_number)}>` (see Critical Implementation Details above for the string/number coercion). `<AddCompetitionDialog classId={selectedClassId} .../>` → `classNumber={selectedClassNumber}`.

#### 9. Add-competition dialog

**File**: `src/components/competition-results/AddCompetitionDialog.tsx`

**Intent**: Rename the prop and POST body field.

**Contract**: `Props.classId: string` → `classNumber: number`. POST body `JSON.stringify({ classId, competedOn })` → `JSON.stringify({ classNumber, competedOn })`.

#### 10. Test seeding helper

**File**: `tests/helpers/db.ts`

**Intent**: Rename the seeding helper's class parameter.

**Contract**: `seedCompetition(admin, dogId, classId: string, accountId, competedOn)` → `classNumber: number`, inserting `{ ..., class_number: classNumber, ... }`.

#### 11. Cross-account authorization tests

**File**: `tests/unit/cross-account-authorization.test.ts`

**Intent**: Remove the `competition_classes` lookup in `beforeEach` (no table to query); resolve class numbers as literals instead.

**Contract**: The `competition_classes` query resolving `class1Id`/`class2Id` is deleted — `class1Number`/`class2Number` become `1`/`2` directly (no DB round trip needed). The exercises query's `.in("class_id", [class1Id, class2Id])` → `.in("class_number", [class1Number, class2Number])`. Every `seedCompetition(admin, dogAId, class1Id, ...)` call updates to pass `class1Number`/`class2Number`.

#### 12. Data integrity tests

**File**: `tests/unit/data-integrity.test.ts`

**Intent**: Same class-lookup removal as above; rename the constraint test to match its new key.

**Contract**: The `competition_classes` single-row lookup in `beforeEach` is deleted — `classId` becomes `classNumber = 1` directly. The exercise lookup's `.eq("class_id", classId)` → `.eq("class_number", classNumber)`. Every `seedCompetition(admin, dogId, classId, ...)` call updates to pass `classNumber`. The test titled `"competitions unique(dog_id, class_id, competed_on) constraint"` is renamed to `"competitions unique(dog_id, class_number, competed_on) constraint"`, and its raw insert's `class_id: classId` → `class_number: classNumber`.

#### 13. Competition board unit tests

**File**: `tests/unit/competition-board.test.ts`

**Intent**: Mechanical fixture field rename — `CompetitionBoard` never reads this field.

**Contract**: `makeExercises`'s fixture field `class_id: "class-1"` → `class_number: 1`.

#### 14. Competition reference-data tests

**File**: `tests/unit/competition-reference-data.test.ts`

**Intent**: The largest rewrite in this phase — `competition_classes` no longer exists as a table, so every test that queried or asserted against it needs to either move to a DB-free assertion on the imported const, or be removed if it was purely testing the now-gone RLS boundary.

**Contract**:

- "`competition_classes` has exactly 3 rows..." — replaced by a new, DB-free `describe` block (sibling to the existing DB-seeding one, so it needs no `admin`/`authClient` setup) asserting `COMPETITION_CLASSES` (imported from `@/const`) has exactly 3 entries in `Class 1 → Class 2 → Class 3` order.
- "each class has the spec'd exercise count" — iterates `COMPETITION_CLASSES` instead of a `competition_classes` query; counts `exercises` via `.eq("class_number", cls.class_number)`.
- "spot-checked values via service functions" — replaces `getCompetitionClasses(authClient)` calls with iterating the imported const; `getExercisesForClass(authClient, cls.id)` → `getExercisesForClass(authClient, cls.class_number)`.
- `getExercisesForClassNumber` describe block — that function no longer exists (collapsed into `getExercisesForClass` in Phase 2 item 3). Its "returns Class 1's 9 exercises for class_number 1" test becomes a direct `getExercisesForClass(authClient, 1)` call. Its "returns null when no class has the given class_number" test changes behavior, not just name: the old two-step resolve-then-null-check is gone, so an unrecognized `class_number` (e.g. `99`) now returns `[]` from a plain `.eq()` filter, not `null` — rewrite the assertion to `toEqual([])` and rename the test to "returns [] for an unrecognized class_number".
- RLS boundary — delete "anon client cannot read `competition_classes`" (no table exists to test). Keep "anon client cannot read exercises" unchanged. Rewrite "authenticated client reads all 3 classes and 29 exercises" to iterate the imported const instead of calling `getCompetitionClasses`.

### Success Criteria:

#### Automated Verification:

- [ ] Typecheck passes: `npx astro check`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`
- [ ] Repo-wide grep for `class_id`, `classId`, `competition_classes`, and `CompetitionClass` in `src/` and `tests/` returns zero hits

#### Manual Verification:

- [ ] Visit `/dogs/:id/competition-results` and switch between all 3 classes via the `Select` — grid renders the correct exercises/columns/averages/highlights for each
- [ ] Switching classes updates the URL to `?classNumber=N` and correctly reloads that class's data
- [ ] Add a competition via the "Add competition" dialog — succeeds and the new date column appears; attempting a duplicate dog+class+date still surfaces the 409 "already exists" toast
- [ ] Enter and edit a score cell — upsert still works as before
- [ ] Visiting `/dogs/:id/competition-results?classNumber=99` (invalid) or with no `classNumber` param falls back to Class 1 without erroring

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- `CompetitionBoard`'s existing tests need only the trivial `class_id` → `class_number` fixture rename (item 13) — its logic is untouched, confirmed by the domain layer having zero class-awareness.
- The new `COMPETITION_CLASSES` const gets DB-free coverage (order, count, shape) inside `competition-reference-data.test.ts`'s new sibling `describe` block — no reason to stand up a separate test file for a 3-entry static array.

### Integration Tests:

- All existing DB-integration coverage (RLS boundaries, cross-account authorization, exercise/class counts, unique constraints, the `competition_scores` cross-class-exercise guard) is preserved, just re-keyed on `class_number` — no coverage is dropped except the two tests that specifically asserted `competition_classes`-table behavior (its 3-row count and its anon-read RLS denial), which are removed because the table itself no longer exists.

### Manual Testing Steps:

1. Load `/dogs/:id/competition-results` for a dog with no competitions yet in any class — confirm the empty-state grid renders per class.
2. Switch through all 3 classes via the `Select`, confirming the URL and displayed exercises/columns update correctly each time.
3. Add competitions and enter scores across at least two different classes; confirm scores don't leak across classes (the `competition_scores` RLS cross-check still enforces `exercise.class_number = competition.class_number`).
4. Attempt to load the page with a garbage `?classNumber=` value and confirm it falls back to Class 1 instead of erroring.

## Performance Considerations

Removing `competition_classes` eliminates the JOIN/round-trip `getExercisesForClassNumber` used to perform (resolve `class_number` → `class_id`, then query `exercises`) — `getExercisesForClass` now filters `exercises` directly on `class_number` in a single query. No other performance-relevant change.

## Migration Notes

Because the 4 migrations are edited in place rather than appended to, any local or CI Supabase instance that already applied them under their old content needs a full reset (`npx supabase db reset`) to pick up the rewritten schema — this is the normal `supabase db reset` workflow already used by this project's test setup, not a new operational step. No data migration/backfill is needed anywhere: since this ships before `competition-results-core` is merged or deployed, no environment has ever held real `competitions`/`competition_scores` rows under the old `class_id` schema.

## References

- Research: `context/changes/class-number-denormalization/research.md`
- Change notes: `context/changes/class-number-denormalization/change.md`
- Domain layer (unaffected by this change): `src/lib/domain/competition-board.ts`
- Existing const-module precedent (UI-scoped, not reused directly): `src/components/competition-results/window-options.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema

#### Automated

- [x] 1.1 Local Supabase reset applies all migrations cleanly: `npx supabase db reset`
- [x] 1.2 `20260903000002_add_class_number_to_competition_classes.sql` no longer exists

#### Manual

- [x] 1.3 Inspect `exercises`/`competitions` schemas — `class_number` CHECK columns exist, `class_id`/`competition_classes` do not
- [x] 1.4 Spot-check seeded exercise rows match the original 29-row dataset, keyed by `class_number`

### Phase 2: Application code & tests

#### Automated

- [ ] 2.1 Typecheck passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Unit tests pass: `npm run test`
- [ ] 2.4 Repo-wide grep for `class_id`/`classId`/`competition_classes`/`CompetitionClass` in `src/` and `tests/` returns zero hits

#### Manual

- [ ] 2.5 Switch between all 3 classes via the Select — grid renders correctly for each
- [ ] 2.6 Class switch updates `?classNumber=N` and reloads correctly
- [ ] 2.7 Add competition succeeds; duplicate dog+class+date still 409s
- [ ] 2.8 Score cell entry/edit still works
- [ ] 2.9 Invalid/missing `?classNumber=` falls back to Class 1 without erroring
