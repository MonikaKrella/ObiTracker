# Competition Reference Data (F-01) Implementation Plan

## Overview

Seed the three fixed competition classes (Class 1, Class 2, Class 3) — each with its own
exercises, per-exercise point multiplier, and short "Shortcut" display name — as
non-user-editable Postgres reference data. This is a foundation slice: no page, no API
route, and no user-facing behavior change in this plan. It exists so that S-01
(competition-results core) and S-02 (element-exercise linking) have real data and a
service layer to query against when they're built.

## Current State Analysis

No competition, class, or exercise concept exists anywhere in the codebase today —
confirmed by `grep` across `supabase/migrations/`, `src/types.ts`, and `src/lib/services/`.
The `dogs` and `training_elements` tables are the only precedent for a new-table
migration in this repo, and both are account/dog-scoped (RLS keys off `account_id` or a
`dogs` ownership join). This is the first _global_, non-account-scoped table the app will
have — every authenticated user reads the same three classes and 29 exercises.

## Desired End State

Two new tables (`competition_classes`, `exercises`) exist in Postgres, RLS-enabled,
readable by any `authenticated` user and invisible to `anon`, seeded with the full
29-exercise dataset below. `src/types.ts` has `CompetitionClass` and `Exercise` entity
types. `src/lib/services/competition.ts` exports `getCompetitionClasses()` and
`getExercisesForClass()`. An integration test verifies the seeded row/exercise counts,
spot-checks specific multiplier/shortcut values, and confirms the RLS boundary
(authenticated reads succeed, anon reads fail).

**Verification:** `npx supabase db reset` applies cleanly, `npm run test` passes
(including the new integration test), `npm run build` type-checks, `npm run lint` passes.

### Key Discoveries:

- `training_elements` migration (`supabase/migrations/20260530000002_create_training_elements.sql`)
  is the closest structural analog: `UNIQUE` constraint pattern, one RLS policy per
  operation per role, explicit `REVOKE SELECT ... FROM anon`.
- `context/foundation/lessons.md` mandates explicit `GRANT` to both `authenticated` and
  `service_role` on every new table — the local/CI Supabase bootstrap does not reliably
  carry these over (see `20260718000001_explicit_grants.sql`, `20260719000001_service_role_table_grants.sql`).
- `src/lib/services/training-elements.ts` is the service-layer pattern to follow: plain
  async functions taking `SupabaseClient` as the first argument, throwing on
  `result.error`, returning typed rows.
- `tests/helpers/db.ts` + `tests/unit/data-integrity.test.ts` establish the only testing
  pattern this repo uses for persisted data: integration tests against a real local
  Supabase instance (admin client for setup/verification, auth client for RLS-scoped
  reads) — not mocks.
- The canonical exercise/multiplier/shortcut data (confirmed by the user, correcting
  typos and an ambiguous multiplier from the original notes) lives in
  `context/foundation/post-mvp-features.md:11-44`.

## What We're NOT Doing

- No `GET` API route for this data — the recommended, user-confirmed scope is
  service-layer functions only, called directly from Astro SSR when S-01/S-02 build
  their pages. A route can be added later if a client island ends up needing one.
- No in-app admin UI to add/edit/version classes or exercises (FR-005 Non-Goal) — a
  rulebook revision is a manual, out-of-band migration.
- No `element_exercise_link` table (S-02's job) and no `dog`-level "default class"
  column/table (S-03's job) — this slice only builds the reference data those later
  slices will join against.
- No competition/score tables (S-01's job).
- No Insert/Update/Delete DTOs or mutation functions for these tables — nothing in the
  app ever writes to them; only this migration does.

## Implementation Approach

Standard `schema/migration → types → service` sequence used elsewhere in this repo,
stopping short of the API/UI layers since no consumer exists yet in this slice. One
migration creates both tables (normalized: `exercises.class_id` FKs to
`competition_classes.id`) with RLS, grants, and the full seed data as literal SQL
`INSERT`s — chosen over a separate seed script because `supabase/seed.sql` is reserved
for local dev/test fixtures requiring a real `auth.users` UUID (per its own header
comment), while this reference data must exist in every environment, including
production, which only migrations guarantee.

## Critical Implementation Details

**Grants deviate from the existing full-CRUD pattern.** `20260718000001_explicit_grants.sql`
and `20260719000001_service_role_table_grants.sql` grant `SELECT, INSERT, UPDATE, DELETE`
to `authenticated`/`service_role` on every existing table. Do not copy that pattern here:
`competition_classes` and `exercises` are read-only from the app's perspective (FR-005
forbids in-app editing), so grant `SELECT` only, to both roles. Correspondingly, write
only a `SELECT` RLS policy per table (`USING (true)`, since the data isn't account-scoped)
— no `INSERT`/`UPDATE`/`DELETE` policies. RLS's default-deny then makes those operations
impossible for every role (including `service_role` at the RLS layer, though `service_role`
has `BYPASSRLS` — the missing table-level `GRANT` is what actually blocks it, consistent
with the `service_role` grants lesson in `context/foundation/lessons.md`).

## Phase 1: Migration

### Overview

Create `competition_classes` and `exercises`, enable RLS with `authenticated`-only
`SELECT` policies, grant `SELECT` to `authenticated` and `service_role`, revoke `SELECT`
from `anon`, and seed all 3 classes and 29 exercises.

### Changes Required:

#### 1. New migration file

**File**: `supabase/migrations/20260903000001_create_competition_reference_data.sql`

**Intent**: Establish the two-table reference-data schema and populate it with the
rulebook's full class/exercise/multiplier/shortcut dataset in one migration, so the data
exists identically in local dev, CI, and production the moment this migration runs.

**Contract**:

- `competition_classes(id uuid PK, name text NOT NULL UNIQUE, sort_position smallint NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT NOW())`
- `exercises(id uuid PK, class_id uuid NOT NULL REFERENCES competition_classes(id) ON DELETE CASCADE, name text NOT NULL, shortcut text NOT NULL, multiplier smallint NOT NULL CHECK (multiplier > 0), sort_position smallint NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW(), UNIQUE (class_id, name), UNIQUE (class_id, sort_position))`
- RLS enabled on both tables; one `SELECT` policy per table for `authenticated` (`USING (true)`) — no other policies.
- `REVOKE SELECT ... FROM anon` on both tables; `GRANT SELECT ... TO authenticated, service_role` on both tables (plus `GRANT USAGE ON SCHEMA public` is already in place from `20260718000001_explicit_grants.sql`, no need to repeat).
- Seed data — the exact, user-confirmed canonical dataset (do not re-derive from `context/foundation/post-mvp-notes.md`, which has since-corrected typos and a missing "Shortcut" column; use the values below):

  ```sql
  INSERT INTO competition_classes (name, sort_position) VALUES
    ('Class 1', 1),
    ('Class 2', 2),
    ('Class 3', 3);

  INSERT INTO exercises (class_id, name, shortcut, multiplier, sort_position)
  SELECT competition_classes.id, v.name, v.shortcut, v.multiplier, v.sort_position
  FROM competition_classes,
    (VALUES
      ('Sitting in a group', 'Group', 3, 1),
      ('Heelwork', 'Heelwork', 4, 2),
      ('Position under march', 'In march', 3, 3),
      ('Recall', 'Recall', 4, 4),
      ('Square', 'Box', 4, 5),
      ('Distance control', 'Dist.contr.', 4, 6),
      ('Retrieve and jumping over a hurdle', 'Retrieve', 4, 7),
      ('Go around cones', 'Cones', 4, 8),
      ('General impression', 'Impression', 2, 9)
    ) AS v(name, shortcut, multiplier, sort_position)
  WHERE competition_classes.name = 'Class 1';

  INSERT INTO exercises (class_id, name, shortcut, multiplier, sort_position)
  SELECT competition_classes.id, v.name, v.shortcut, v.multiplier, v.sort_position
  FROM competition_classes,
    (VALUES
      ('Lying in a group', 'Group', 3, 1),
      ('Heelwork', 'Heelwork', 4, 2),
      ('Positions under march', 'In march', 3, 3),
      ('Recall with stop', 'Recall', 3, 4),
      ('Square', 'Box', 4, 5),
      ('Directed retrieve', 'Dir.Retrieve', 3, 6),
      ('Scent discrimination', 'Scent', 3, 7),
      ('Distance control', 'Dist.contr.', 4, 8),
      ('Send around cones, stop and jump', '3.8', 3, 9),
      ('General impression', 'Impression', 2, 10)
    ) AS v(name, shortcut, multiplier, sort_position)
  WHERE competition_classes.name = 'Class 2';

  INSERT INTO exercises (class_id, name, shortcut, multiplier, sort_position)
  SELECT competition_classes.id, v.name, v.shortcut, v.multiplier, v.sort_position
  FROM competition_classes,
    (VALUES
      ('Sitting in a group', 'Group-sit', 2, 1),
      ('Lying in a group and recall', 'Group-down', 2, 2),
      ('Heelwork', 'Heelwork', 4, 3),
      ('Positions under march', 'In march', 3, 4),
      ('Recall', 'Recall', 3, 5),
      ('Square', 'Box', 4, 6),
      ('Directed retrieve', 'Dir.Retreive', 3, 7),
      ('Send around cones, stop, retrieve and jump', '3.8', 4, 8),
      ('Scent discrimination', 'Scent', 3, 9),
      ('Distance control', 'Dist.contr.', 4, 10)
    ) AS v(name, shortcut, multiplier, sort_position)
  WHERE competition_classes.name = 'Class 3';
  ```

- Rollback comment block (mirroring the `training_elements` migration's convention):
  drop both `SELECT` policies, re-`GRANT SELECT` to `anon` on both tables, `DROP TABLE`
  `exercises` then `competition_classes` (FK order).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio's table editor, `competition_classes` shows exactly 3 rows and
  `exercises` shows exactly 29 rows (9 + 10 + 10), each with the correct `class_id`.
- Spot-check in Studio: every class's "Heelwork" row has `multiplier = 4`; Class 1's
  "Distance control" row has `multiplier = 4` (the corrected value, not the original
  ambiguous "40").

---

## Phase 2: Types + Service Layer

### Overview

Expose the new tables to the rest of the app: typed entities in `src/types.ts`, and
read-only service functions in a new `src/lib/services/competition.ts`.

### Changes Required:

#### 1. Entity types

**File**: `src/types.ts`

**Intent**: Mirror the new schema exactly, following this file's existing convention
(column order matches the migration; no Insert DTOs, since nothing in the app inserts
these rows).

**Contract**: Add `CompetitionClass { id, name, sort_position, created_at }` and
`Exercise { id, class_id, name, shortcut, multiplier, sort_position, created_at }`
interfaces, each field typed to match its Postgres column (uuid/text → `string`,
smallint → `number`, timestamptz → `string`).

#### 2. Service functions

**File**: `src/lib/services/competition.ts` (new)

**Intent**: Provide the two read operations S-01 and S-02 will need — the full class
list (for the class dropdown) and a class's exercises (for the results grid rows and the
element-linking picker) — following the exact async-function-taking-`SupabaseClient`
shape of `src/lib/services/training-elements.ts`.

**Contract**:

- `getCompetitionClasses(supabase: SupabaseClient): Promise<CompetitionClass[]>` —
  selects all rows, `order("sort_position", { ascending: true })`.
- `getExercisesForClass(supabase: SupabaseClient, classId: string): Promise<Exercise[]>`
  — selects rows `eq("class_id", classId)`, `order("sort_position", { ascending: true })`.
- Both throw on `result.error`, matching every existing service function's error
  handling (no swallowing, no fallback default beyond `?? []` on a null `data`).

#### Addendum (post-plan, user-requested during implementation)

While implementing this phase, the user asked for a dedicated `class_number`
smallint column on `competition_classes` — distinct from `sort_position`
(display order) — so exercises can be looked up by the rulebook's natural
class number without going through `sort_position` or parsing it out of
`name`. This added:

- `supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql`
  — adds `class_number smallint NOT NULL UNIQUE`, backfilled to match
  `sort_position` for the 3 existing rows (today the two are numerically
  identical, but conceptually independent).
- `CompetitionClass` in `src/types.ts` gains a `class_number: number` field.
- `getExercisesForClassNumber(supabase, classNumber)` in
  `src/lib/services/competition.ts` — looks up the class by `class_number`
  and delegates to `getExercisesForClass`.

### Success Criteria:

#### Automated Verification:

- Type-checking passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- None beyond Phase 3's automated tests — this phase has no independently observable
  behavior without a caller.

---

## Phase 3: Tests

### Overview

Verify the seeded data is exactly correct (counts, spot-checked values) and that the RLS
boundary behaves as designed (authenticated reads succeed, anon reads fail), using this
repo's established real-Supabase integration-test pattern.

### Changes Required:

#### 1. Integration test

**File**: `tests/unit/competition-reference-data.test.ts` (new)

**Intent**: Give this migration-seeded, non-admin-editable data an automated regression
guard — per the plan's own stated risk, a seeding error here silently skews every
downstream competition average and isn't self-correcting through the UI.

**Contract**: Using `createAdminClient()` and `createTestUser()` from
`tests/helpers/db.ts` (no new dog/element seeding needed — this data isn't dog-scoped):

- `competition_classes` has exactly 3 rows, ordered `sort_position` 1→3 as "Class 1",
  "Class 2", "Class 3".
- Each class's `exercises` count matches the spec: Class 1 = 9, Class 2 = 10, Class 3 = 10
  (29 total).
- Spot-check via `getCompetitionClasses`/`getExercisesForClass` (call the service
  functions directly, not raw queries, so the test also exercises Phase 2's code):
  "Heelwork" has `multiplier = 4` in all three classes; Class 1's "Distance control" has
  `multiplier = 4`; Class 2's exercise 9 ("Send around cones, stop and jump") has
  `shortcut = "3.8"`.
- RLS boundary: an anon client (no session) querying `competition_classes` or
  `exercises` gets a permission error or zero rows (table-level `REVOKE` blocks it before
  RLS is even reached); an authenticated test user's client (via `createTestUser`) reads
  all 3 classes / 29 exercises successfully.

### Success Criteria:

#### Automated Verification:

- New test passes: `npm run test -- competition-reference-data`
- Full unit suite still passes: `npm run test`

#### Manual Verification:

- None — this phase's correctness is fully captured by the automated test.

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing from
Phase 1 was successful before considering this change complete.

---

## Testing Strategy

### Unit Tests:

- No mocked/pure-unit tests — this repo's convention for persisted-data correctness is
  integration tests against a real local Supabase instance (see `data-integrity.test.ts`,
  `cross-account-authorization.test.ts`).

### Integration Tests:

- Row/exercise counts, spot-checked multiplier/shortcut values, and RLS boundary — all
  covered in Phase 3's single test file.

### Manual Testing Steps:

1. `npx supabase db reset` and open Supabase Studio's table editor.
2. Confirm `competition_classes` has 3 rows and `exercises` has 29 rows total.
3. Spot-check a handful of multiplier and shortcut values against
   `context/foundation/post-mvp-features.md:11-44`.

## Performance Considerations

None — 3 and 29 rows respectively, read via simple indexed (`PRIMARY KEY`/`UNIQUE`)
lookups. No pagination, caching, or query optimization is warranted at this scale.

## Migration Notes

This is a purely additive migration — no existing table, column, or row is touched. No
backfill or data-migration concern applies.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01: Competition reference data)
- PRD: `context/foundation/prd-v2.md` (FR-005, FR-006)
- Canonical seed data: `context/foundation/post-mvp-features.md:11-44`
- Structural analog: `supabase/migrations/20260530000002_create_training_elements.sql`
- Service-layer pattern: `src/lib/services/training-elements.ts`
- Test pattern: `tests/helpers/db.ts`, `tests/unit/data-integrity.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — b1af13a
- [x] 1.2 Lint passes: `npm run lint` — b1af13a

#### Manual

- [x] 1.3 `competition_classes` shows exactly 3 rows and `exercises` shows exactly 29 rows in Supabase Studio — b1af13a
- [x] 1.4 Spot-checked multiplier values (Heelwork = 4 in all classes; Class 1 Distance control = 4) are correct in Studio — b1af13a

### Phase 2: Types + Service Layer

#### Automated

- [x] 2.1 Type-checking passes: `npm run build` — cf720ed
- [x] 2.2 Lint passes: `npm run lint` — cf720ed

### Phase 3: Tests

#### Automated

- [x] 3.1 New test passes: `npm run test -- competition-reference-data` — 381c4e7
- [x] 3.2 Full unit suite still passes: `npm run test` — 381c4e7
