# Database Schema Implementation Plan

## Overview

Create the three Supabase tables that back the entire ObiTracker data model — `dogs`,
`training_elements`, and `training_logs` — with row-level security, constraints, an index,
and matching TypeScript entity types. No service layer; that is downstream (S-02 onward).

This is foundation slice **F-01** in `context/foundation/roadmap.md`. Nothing in S-02 through
S-04 can start until these tables exist.

---

## Current State Analysis

- `supabase/migrations/` does not exist; no custom SQL has been written.
- `src/types.ts` does not exist; the only type file is `src/env.d.ts` (Locals interface).
- `supabase/seed.sql` does not exist; `supabase/config.toml` already has `sql_paths = ["./seed.sql"]` under `[db.seed]`.
- `supabase/config.toml` is present with Postgres 17, local API on port 54321.
- `src/lib/supabase.ts` creates an `@supabase/ssr` server client; it returns `null` when env vars are missing — all callers must handle this.
- Only `auth.users` is in use; no custom tables exist.

## Desired End State

After this plan is complete, the following is true and verifiable:

1. Running `npx supabase db reset` against a local Supabase instance applies all 3 migrations cleanly with no errors.
2. Supabase Studio (`localhost:54323`) shows all 3 tables under the `public` schema with the exact columns listed below, RLS enabled, and all policies listed.
3. `src/types.ts` exports `Dog`, `TrainingElement`, `TrainingLog`, `NewDog`, `NewTrainingElement`, `NewTrainingLog` — types that a TypeScript caller can import to interact with the tables.
4. `supabase/seed.sql` exists with commented example INSERTs that document the expected data shape.
5. `npm run lint` and `npm run build` both pass.

### Key Discoveries

- `training_logs` denormalizes `account_id` (from `dogs.account_id`) for two reasons: (a) the `(account_id, dog_id, trained_on)` index, and (b) direct RLS check (`account_id = auth.uid()`) instead of a JOIN. — see Critical Implementation Details.
- Hard-delete for elements is confirmed in `context/foundation/roadmap.md` (S-03 unknowns) — deleting a `training_element` must cascade to all its `training_logs` rows.
- `trained_on` is `DATE` (not `TIMESTAMPTZ`) because FR-006 says the tick records the day of the cell, not the time of entry.
- CLAUDE.md requires one RLS policy per operation per role — no catch-all policies.
- `training_logs` has no UPDATE operation by design (presence-only model: insert = tick, delete = untick).

---

## Schema Reference

Use this section as a checklist when reviewing the generated migrations.

### `dogs`

| Column       | Type          | Constraints / Default                                  |
| ------------ | ------------- | ------------------------------------------------------ |
| `id`         | `uuid`        | `PRIMARY KEY DEFAULT gen_random_uuid()`                |
| `account_id` | `uuid`        | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` |
| `name`       | `text`        | `NOT NULL`                                             |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT NOW()`                               |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT NOW()`                               |

RLS policies (4, all role `authenticated`):

| Policy name                 | Operation | Expression                                              |
| --------------------------- | --------- | ------------------------------------------------------- |
| `dogs_select_authenticated` | SELECT    | `USING ((select auth.uid()) = account_id)`              |
| `dogs_insert_authenticated` | INSERT    | `WITH CHECK ((select auth.uid()) = account_id)`         |
| `dogs_update_authenticated` | UPDATE    | `USING + WITH CHECK ((select auth.uid()) = account_id)` |
| `dogs_delete_authenticated` | DELETE    | `USING ((select auth.uid()) = account_id)`              |

---

### `training_elements`

| Column          | Type          | Constraints / Default                            |
| --------------- | ------------- | ------------------------------------------------ |
| `id`            | `uuid`        | `PRIMARY KEY DEFAULT gen_random_uuid()`          |
| `dog_id`        | `uuid`        | `NOT NULL REFERENCES dogs(id) ON DELETE CASCADE` |
| `name`          | `text`        | `NOT NULL`                                       |
| `sort_position` | `integer`     | `NOT NULL DEFAULT 0`                             |
| `created_at`    | `timestamptz` | `NOT NULL DEFAULT NOW()`                         |

Table constraints:

| Constraint name                        | Definition              |
| -------------------------------------- | ----------------------- |
| `training_elements_dog_id_name_unique` | `UNIQUE (dog_id, name)` |

RLS policies (4, all role `authenticated`):

| Policy name                              | Operation | Expression                                                                                             |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `training_elements_select_authenticated` | SELECT    | `USING (EXISTS (SELECT 1 FROM dogs WHERE dogs.id = dog_id AND dogs.account_id = (select auth.uid())))` |
| `training_elements_insert_authenticated` | INSERT    | `WITH CHECK (EXISTS (…same…))`                                                                         |
| `training_elements_update_authenticated` | UPDATE    | `USING + WITH CHECK (EXISTS (…same…))`                                                                 |
| `training_elements_delete_authenticated` | DELETE    | `USING (EXISTS (…same…))`                                                                              |

---

### `training_logs`

| Column       | Type   | Constraints / Default                                         |
| ------------ | ------ | ------------------------------------------------------------- |
| `id`         | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()`                       |
| `element_id` | `uuid` | `NOT NULL REFERENCES training_elements(id) ON DELETE CASCADE` |
| `dog_id`     | `uuid` | `NOT NULL REFERENCES dogs(id) ON DELETE CASCADE`              |
| `account_id` | `uuid` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`        |
| `trained_on` | `date` | `NOT NULL`                                                    |

Table constraints:

| Constraint name                              | Definition                        |
| -------------------------------------------- | --------------------------------- |
| `training_logs_element_id_trained_on_unique` | `UNIQUE (element_id, trained_on)` |

Indexes:

| Index name                           | Definition                         |
| ------------------------------------ | ---------------------------------- |
| `training_logs_account_dog_date_idx` | `(account_id, dog_id, trained_on)` |

RLS policies (3, role `authenticated` — **no UPDATE policy**):

| Policy name                          | Operation | Expression                                                                                                                                       |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `training_logs_select_authenticated` | SELECT    | `USING ((select auth.uid()) = account_id)`                                                                                                       |
| `training_logs_insert_authenticated` | INSERT    | `WITH CHECK ((select auth.uid()) = account_id AND EXISTS (SELECT 1 FROM dogs WHERE dogs.id = dog_id AND dogs.account_id = (select auth.uid())))` |
| `training_logs_delete_authenticated` | DELETE    | `USING ((select auth.uid()) = account_id)`                                                                                                       |

> UPDATE intentionally omitted — rows are inserted (tick) or deleted (untick) only.

---

## What We're NOT Doing

- **No service layer** (`src/lib/services/`) — query functions are S-02 / S-03 / S-04's concern.
- **No seed data with live inserts** — `supabase/seed.sql` is a commented placeholder only; live inserts need a real `auth.users` UUID from a running local instance.
- **No `anon` role policies** — RLS-on + no matching policy = implicit deny for `anon`; explicit deny boilerplate is not added.
- **No user-orderable reorder logic** — `sort_position` column exists; the UI and API for reordering land in S-03.
- **No competition results tables** — explicitly v2 per PRD §Non-Goals.

---

## Implementation Approach

Three migration files are applied in dependency order:
`dogs` → `training_elements` (FK to `dogs`) → `training_logs` (FKs to both).

Each file: `CREATE TABLE` → `ALTER TABLE … ENABLE ROW LEVEL SECURITY` → policy statements
→ constraints (already inline in `CREATE TABLE`) → index (Phase 3 only) → commented rollback block.

TypeScript types are hand-written in `src/types.ts` to mirror the schema. They are the contract
downstream slices import — if the schema changes, this file must change with it.

---

## Critical Implementation Details

**`training_logs.account_id` is an intentional denormalization.**
`element_id → training_elements.dog_id → dogs.account_id` transitively gives the owner, but
copying `account_id` directly into `training_logs` enables two things that the join-based path
cannot: (a) the `(account_id, dog_id, trained_on)` composite index the highlight algorithm
depends on, and (b) an O(1) RLS check (`account_id = auth.uid()`) instead of a correlated
subquery through two hops. App code must always populate all three FK columns (`element_id`,
`dog_id`, `account_id`) consistently on INSERT — an element that belongs to dog A must have
`dog_id = A` and `account_id = A.account_id` in the same row.

**Migration apply order is load-bearing.**
The Supabase CLI applies migrations in lexicographic filename order. The `000001 / 000002 / 000003`
suffix sequence guarantees `dogs` is created before `training_elements` needs its FK, and both
exist before `training_logs` needs theirs. Do not rename the files.

---

## Phase 1: Database Migrations

### Overview

Create `supabase/migrations/` and write three SQL files that bring the full schema live in one
`supabase db reset`. Each file is self-contained: schema + RLS + rollback comment.

### Changes Required

#### 1. `supabase/migrations/20260530000001_create_dogs.sql` (new file)

**File**: `supabase/migrations/20260530000001_create_dogs.sql`

**Intent**: Create the `dogs` table with RLS. This is the root of the ownership chain — every other
table traces its `account_id` lineage back through `dogs`.

**Contract**: Table and policy names exactly as listed in the Schema Reference above. After the RLS
policy statements, create a reusable `set_updated_at()` trigger function (`RETURNS TRIGGER LANGUAGE plpgsql`,
sets `NEW.updated_at = NOW()`) using `CREATE OR REPLACE FUNCTION`, then create a `BEFORE UPDATE FOR EACH ROW`
trigger named `dogs_set_updated_at` on the `dogs` table that calls it. The file ends with a commented
rollback block that drops the trigger, the trigger function (`DROP FUNCTION IF EXISTS set_updated_at()`),
the policies, then the table (reverse order).

---

#### 2. `supabase/migrations/20260530000002_create_training_elements.sql` (new file)

**File**: `supabase/migrations/20260530000002_create_training_elements.sql`

**Intent**: Create the `training_elements` table with RLS. Because this table has no `account_id`
column, all four policies check ownership via an `EXISTS` subquery on `dogs`.

**Contract**: Table and policy names exactly as listed in the Schema Reference. Include the
`UNIQUE (dog_id, name)` constraint inline in `CREATE TABLE`. Rollback comment at the bottom.

---

#### 3. `supabase/migrations/20260530000003_create_training_logs.sql` (new file)

**File**: `supabase/migrations/20260530000003_create_training_logs.sql`

**Intent**: Create the `training_logs` table with RLS and the composite index. This table carries
a denormalized `account_id` (see Critical Implementation Details). Only SELECT, INSERT, and DELETE
policies are written — no UPDATE.

**Contract**: Table and policy names exactly as listed in the Schema Reference. `UNIQUE (element_id, trained_on)`
inline. `CREATE INDEX training_logs_account_dog_date_idx ON training_logs (account_id, dog_id, trained_on)`
after the policy statements. Rollback comment drops index → policies → table.

---

### Success Criteria

#### Automated Verification

- `npx supabase db reset` completes with exit code 0 and no error output
- All three migration files are present under `supabase/migrations/`

#### Manual Verification

- Supabase Studio (`localhost:54323`) → Table Editor shows `dogs`, `training_elements`, `training_logs` in the `public` schema
- Each table has exactly the columns listed in the Schema Reference (names, types, nullability)
- Authentication → Policies panel shows the correct policy count per table: `dogs` = 4, `training_elements` = 4, `training_logs` = 3
- Index `training_logs_account_dog_date_idx` appears under Database → Indexes
- Two-user RLS spot-check: insert a dog row as user A (via Studio SQL editor with `SET LOCAL role = authenticated; SET LOCAL request.jwt.claims = '{"sub":"<user-a-uuid>"}'`); confirm user B cannot SELECT it

**Implementation Note**: After completing this phase and confirming all manual checks pass, pause before proceeding to Phase 2.

---

## Phase 2: TypeScript Entity Types and Seed Placeholder

### Overview

Write `src/types.ts` with entity interfaces and creation DTOs that mirror the schema. Add
`supabase/seed.sql` as a documented placeholder for local dev seeding.

### Changes Required

#### 1. `src/types.ts` (new file)

**File**: `src/types.ts`

**Intent**: Export TypeScript interfaces for `Dog`, `TrainingElement`, `TrainingLog` that match
the column names and types in the schema, plus `NewDog`, `NewTrainingElement`, `NewTrainingLog`
DTO types that downstream slices use when constructing INSERT payloads.

**Contract**:

```typescript
// Full interfaces (one field per column, in schema order):
export interface Dog {
  id: string;
  account_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingElement {
  id: string;
  dog_id: string;
  name: string;
  sort_position: number;
  created_at: string;
}

export interface TrainingLog {
  id: string;
  element_id: string;
  dog_id: string;
  account_id: string;
  trained_on: string; // ISO date string: "YYYY-MM-DD"
}

// DTO types — fields required on INSERT (id, created_at, updated_at omitted):
export type NewDog = Pick<Dog, "name">;
export type NewTrainingElement = Pick<TrainingElement, "dog_id" | "name" | "sort_position">;
export type NewTrainingLog = Pick<TrainingLog, "element_id" | "dog_id" | "account_id" | "trained_on">;
```

Add a JSDoc comment on `TrainingLog.trained_on` noting it is the day of the cell, not the time of entry (FR-006).

---

#### 2. `supabase/seed.sql` (new file)

**File**: `supabase/seed.sql`

**Intent**: Satisfy the `sql_paths = ["./seed.sql"]` entry in `supabase/config.toml` and document
the expected INSERT shape for local testing. All statements are commented out because a real
`auth.users` UUID is required.

**Contract**: File contains commented `INSERT INTO dogs`, `INSERT INTO training_elements`, and
`INSERT INTO training_logs` blocks with placeholder UUIDs and a note explaining how to activate them.
No live SQL executes when `supabase db reset` is run.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no errors on `src/types.ts`
- `npm run build` completes with no TypeScript errors

#### Manual Verification

- Open `src/types.ts` and verify each interface has exactly the fields in the Schema Reference, in the same order, with correct TypeScript types (`string` for uuid/text/date/timestamptz, `number` for integer)
- Confirm `NewDog`, `NewTrainingElement` omit `id`, `created_at`, `updated_at`; `NewTrainingLog` omits `id` only (no `created_at` on this table)
- Confirm `supabase/seed.sql` exists and `supabase db reset` still exits 0 (no active SQL executed)

---

## Testing Strategy

### Manual Testing Steps

1. `npx supabase start` (if not already running)
2. `npx supabase db reset` — should complete with no errors
3. Open `localhost:54323` (Supabase Studio)
4. Navigate to Table Editor — confirm `dogs`, `training_elements`, `training_logs` are listed
5. Navigate to Authentication → Policies — verify policy counts (4 / 4 / 3)
6. Navigate to Database → Indexes — verify `training_logs_account_dog_date_idx`
7. In Studio SQL editor, run the two-user RLS spot-check described in Phase 1 manual verification
8. In your editor, import `Dog` from `@/types` and confirm TypeScript resolves without error

---

## Migration Notes

These are the first custom migrations in the project. The `supabase/migrations/` directory must
be created before placing files inside it (the Supabase CLI does this automatically via
`supabase migration new`, but manual file creation also works).

To apply locally: `npx supabase db reset`
To apply to production: `npx supabase db push` (requires `SUPABASE_ACCESS_TOKEN` and project ref)

---

## References

- Roadmap item: `context/foundation/roadmap.md` § F-01
- PRD requirements: `context/foundation/prd.md` § FR-002 through FR-007
- Supabase client: `src/lib/supabase.ts`
- Supabase config: `supabase/config.toml`
- CLAUDE.md conventions: one policy per operation, `YYYYMMDDHHmmss_short_description.sql` naming

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database Migrations

#### Automated

- [x] 1.1 `npx supabase db reset` completes with exit code 0
- [x] 1.2 All three migration files are present under `supabase/migrations/`

#### Manual

- [x] 1.3 Studio Table Editor shows `dogs`, `training_elements`, `training_logs` with correct columns
- [x] 1.4 Studio Policies panel shows 4 / 4 / 3 policies per table
- [x] 1.5 Studio Indexes shows `training_logs_account_dog_date_idx`
- [x] 1.6 Two-user RLS spot-check passes (user A's row not visible to user B)

### Phase 2: TypeScript Entity Types and Seed Placeholder

#### Automated

- [x] 2.1 `npm run lint` passes on `src/types.ts` — 03565af
- [x] 2.2 `npm run build` completes with no TypeScript errors — 03565af

#### Manual

- [x] 2.3 `src/types.ts` fields match Schema Reference exactly (names, types, order)
- [x] 2.4 DTO types omit `id`, `created_at`, `updated_at`
- [x] 2.5 `supabase db reset` still exits 0 after `seed.sql` is added
