# Competition Results Core (S-01) Implementation Plan

## Overview

Implements the V2 north star: per dog, a handler selects a competition class, enters raw per-exercise scores (0–10, quarter-point increments) across dated competitions, sees each exercise's average recalculate live, and sees the top-2/bottom-2 exercise averages highlighted — all governed by one time-window selector (all-time / last year / last 6 months) that also controls which competition columns are visible. Covers FR-007, FR-009, FR-010, FR-012, FR-013, FR-014, US-01.

## Current State Analysis

F-01 (`competition_classes`/`exercises` reference data) and F-02 (`TrainingBoard` domain aggregate) are shipped and archived, and are the direct structural precedent for this slice — see `context/changes/competition-results-core/research.md` for the full research trace. No schema, domain logic, `Select` component, decimal input, tooltip primitive, or right-edge sticky grid column exists yet for competition results. Tags (FR-011) are confirmed **out of scope** for this slice — the roadmap assigns them to S-04 with S-01 as a prerequisite; this plan does not build a Tags row.

## Desired End State

A logged-in handler can navigate to a new `/dogs/[id]/competition-results` page, select a class (defaulting to Class 1 — the FR-008 "marked default" behavior is S-03, not built here), add a competition by date, enter/edit/clear scores per exercise per competition, and see the average column and the top-2/bottom-2 highlights recalculate immediately, filtered by the selected time window. Verification: the phase-by-phase Success Criteria below, plus a full manual walkthrough of US-01's acceptance criteria on both desktop and mobile viewports.

### Key Discoveries

- `src/lib/domain/training-board.ts` (192 lines) — private-constructor/`static create()`-factory shape to imitate; its 3-tier/suppression algorithm does NOT generalize (research confirmed no shared ranking utility exists) — a new, independent aggregate is required (user-confirmed: no shared utility, keep the established per-aggregate precedent).
- `supabase/migrations/20260530000003_create_training_logs.sql` — denormalized `account_id` + composite index is the precedent for a read-heavy, window-filtered query shape; this slice's averaging query resembles it closely enough to justify the same denormalization for both new tables.
- `src/pages/dogs/[id]/grid.astro` + `src/components/training-grid/TrainingGrid.tsx` — full-bleed breakout, opaque sticky backgrounds (`sticky-colors.ts`'s `STICKY_BG`, directly reusable), SSR→island hydration-swap, and the `opacity-0`-not-`sr-only` tap-target pattern (`TickCell.tsx:76-87`) are all directly reusable; no precedent exists for a **right-edge** sticky column.
- `context/foundation/post-mvp-notes.md:127-131` and `[[supabase_grants_service_role]]` — DB `CHECK` constraints over API-only validation, and explicit `service_role` grants inline in the creation migration, are both corrected/current practice to follow, not the retrofit pattern in `20260718000001_explicit_grants.sql`.
- `src/middleware.ts:5` — `PROTECTED_ROUTES` already includes `"/dogs"` as a prefix match, and the `DOG_ID_REGEX` resolver already populates `context.locals.selectedDog` for any `/dogs/<uuid>/*` path — the new page needs **no** middleware change.

## What We're NOT Doing

- Tags (FR-011) — deferred to S-04, which has this slice as its prerequisite.
- Marking/reading a per-dog default class (FR-008) — deferred to S-03; this slice always defaults the class dropdown to Class 1.
- A UI or API route for editing or deleting an existing competition (wrong date, etc.) — explicitly deferred; a new roadmap slice **S-07: delete competition** has been added to `context/foundation/roadmap.md` to track this as a fast-follow. This slice only supports adding a competition and overwriting/clearing individual scores. Note: Phase 1's RLS still grants DELETE on `competitions` at the DB level (user-confirmed, see Phase 1 contract) — no UI exposes it, but a direct Supabase client call could use it before S-07 ships its confirmation UX.
- A DB-level guard against future-dated competitions — user-confirmed: any date is allowed, including future dates.
- Element-to-exercise linking (FR-015/FR-016, S-02) — unrelated slice, no overlap.
- A shared tie-expansion utility between `TrainingBoard` and the new aggregate — user-confirmed: build a second, independent aggregate; do not touch `TrainingBoard` (which FR-018 protects with a byte-identical guarantee).

## Implementation Approach

Follow F-02's proven test-first phasing (domain logic before repository before API before UI), extended for this slice's larger schema and UI surface. Schema first (both tables, RLS, grants), then the domain layer in three isolated, independently-verifiable steps (date-window helper → averages → highlighting algorithm), then the service/repository layer with its integration-test suite, then API routes, then UI, then mobile E2E. Denormalize `account_id` on both new tables (training_logs-style) since the averaging read path is structurally the same shape the training grid already optimizes for.

## Critical Implementation Details

### Tie-expansion algorithm and top/bottom overlap

FR-014's "top-2/bottom-2 with tie-expansion" is a rank-window generalization of `TrainingBoard`'s rank-1-only tie logic, not a copy of it. The correct algorithm: sort exercises with a defined average descending (or ascending, for red); walk distinct-value groups from the top, adding each **whole** group to the highlighted set and accumulating its member count, stopping once the accumulated count reaches 2 (the final group that crosses the threshold is included in full — this is the "expansion"). Apply the same walk ascending for red. Because exercise counts per class are small (9–10) and only exercises with at least one entered score in the window are ranked, green and red sets **can overlap** in practice (e.g. early in a class's use, with only 2–3 exercises scored so far). Resolve an overlap with green taking precedence, mirroring `TrainingBoard`'s existing green-over-red convention. Before ranking, check whether all defined averages are equal (including the degenerate single-exercise case) — if so, skip ranking entirely and return no highlights, per FR-014.

### Partial scores are row absence, not a nullable column

An unscored exercise for a given competition is the **absence** of a `competition_scores` row (`UNIQUE(competition_id, exercise_id)`), not a row with a `NULL` score — mirrors `training_logs`' presence-only model. This keeps the CHECK constraint simple (no NULL-handling) and makes "clear a cell" a `DELETE`, not an `UPDATE ... SET score = NULL`. The averages computation in the domain layer must treat "no row for this exercise in this competition" as "not counted," not as zero.

### Class switch is a full page navigation, not a client-side fetch

Unlike the existing 7/14/30-day window selector (which only changes which already-fetched date columns are visible), switching the competition class changes the entire dataset (different exercises, different competitions, different scores). Implement the class dropdown as a link/navigation to `?classId=<uuid>` on the same route, causing a full SSR re-fetch — do not introduce a new client-side data-fetching pattern for this one control.

## Phase 1: Schema & Types

### Overview

Creates `competitions` and `competition_scores` with RLS, grants, and constraints; adds their entity/DTO types.

### Changes Required:

#### 1. `competitions` table

**File**: `supabase/migrations/20260906000001_create_competitions.sql`

**Intent**: One row per (dog, class, date) competition entry. Denormalizes `account_id` from `dogs.account_id`, mirroring `training_logs`' rationale (O(1) RLS check + composite index for the window-filtered read path).

**Contract**: Columns: `id uuid PK`, `dog_id uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE`, `class_id uuid NOT NULL REFERENCES competition_classes(id)`, `account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `competed_on date NOT NULL`, `created_at timestamptz NOT NULL DEFAULT NOW()`. `CONSTRAINT competitions_dog_class_date_unique UNIQUE (dog_id, class_id, competed_on)` (user-confirmed: one competition per date per dog+class). Composite index `(account_id, dog_id, class_id, competed_on)` for the window query. RLS: one named policy per operation per role (`authenticated` only); SELECT/DELETE use `(select auth.uid()) = account_id`; INSERT `WITH CHECK` adds `EXISTS (SELECT 1 FROM dogs WHERE dogs.id = dog_id AND dogs.account_id = (select auth.uid()))`, mirroring `training_logs_insert_authenticated`'s ownership-consistency check. `REVOKE SELECT ... FROM anon` inline. `GRANT` to both `authenticated` and `service_role` inline (per `[[supabase_grants_service_role]]`). No UPDATE policy (a competition's date is immutable in this slice — no edit path exists). DELETE policy/grant ARE included now, per CLAUDE.md's "one policy per operation" convention, even though no delete UI/API route exists this slice — user-confirmed: this is a live, direct-API-only capability until S-07 adds the confirmation UX around it; document this explicitly in the migration's header comment so it isn't mistaken for an oversight.

#### 2. `competition_scores` table

**File**: `supabase/migrations/20260906000002_create_competition_scores.sql`

**Intent**: One row per (competition, exercise) score, present only when that exercise has been scored for that competition (partial-scores-allowed, per the "Critical Implementation Details" section above). Editable in place via upsert, unlike `training_logs`' insert/delete-only model.

**Contract**: Columns: `id uuid PK`, `competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE`, `exercise_id uuid NOT NULL REFERENCES exercises(id)`, `account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `score numeric(4,2) NOT NULL`, `created_at timestamptz NOT NULL DEFAULT NOW()`, `updated_at timestamptz NOT NULL DEFAULT NOW()` (reuse the shared `set_updated_at()` trigger from the `dogs` migration — this table needs it since scores are overwritten in place, unlike any other existing dog-scoped table). `CONSTRAINT competition_scores_competition_exercise_unique UNIQUE (competition_id, exercise_id)`. `CONSTRAINT competition_scores_score_range_check CHECK (score >= 0 AND score <= 10 AND score * 4 = floor(score * 4))` — enforces both the 0–10 range and quarter-point increments at the DB level (per the recorded data-integrity lesson against API-only validation). Composite index `(account_id, competition_id)`. RLS needs SELECT, INSERT, UPDATE, and DELETE policies (an upsert via `onConflict` can take either the INSERT or UPDATE path, and DELETE supports clearing a cell back to unscored). INSERT/UPDATE `WITH CHECK` clauses each need a three-way EXISTS chain mirroring `training_logs_insert_authenticated`: ownership of the parent competition (`EXISTS (SELECT 1 FROM competitions WHERE competitions.id = competition_id AND competitions.account_id = (select auth.uid()))`) AND cross-FK consistency that `exercise_id` belongs to the same class as the parent competition (`EXISTS (SELECT 1 FROM exercises JOIN competitions ON competitions.id = competition_id WHERE exercises.id = exercise_id AND exercises.class_id = competitions.class_id)`) — this is the direct analog of `training_logs`' "element's dog_id must match the row's own dog_id" check, preventing a forged `exerciseId` from a different class corrupting an average. `REVOKE SELECT ... FROM anon`, `GRANT` to `authenticated` and `service_role` inline.

#### 3. Entity and DTO types

**File**: `src/types.ts`

**Intent**: Add `Competition` and `CompetitionScore` entity interfaces and their `New*` insert DTOs, following the existing flat/snake_case/column-order convention with doc comments on every DTO-omitted column.

**Contract**: `Competition { id, dog_id, class_id, account_id, competed_on, created_at }`; `CompetitionScore { id, competition_id, exercise_id, account_id, score, created_at, updated_at }`; `NewCompetition = Pick<Competition, "dog_id" | "class_id" | "competed_on">` (`account_id` session-injected); `NewCompetitionScore = Pick<CompetitionScore, "competition_id" | "exercise_id" | "score">` (`account_id` session-injected).

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db reset` (or the project's equivalent migrate command)
- Type checking passes: `npm run astro check` / project's typecheck command
- Linting passes: `npm run lint`
- A `select has_function_privilege`/grant-verification query (or a quick `psql` check) confirms `service_role` has SELECT/INSERT/UPDATE/DELETE on both new tables

#### Manual Verification:

- Supabase Studio shows both tables with RLS enabled and the expected policies listed
- Attempting to insert a `competition_scores` row with `score = 10.1` or `score = 5.3` fails with a constraint violation in the SQL editor

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Calendar-Period Time-Window Helper

### Overview

Adds the all-time/last-year/last-6-months window math the domain layer and the SSR page both need — the only date-window shape this codebase doesn't already have (existing helpers in `src/lib/dates.ts` are fixed-rolling-day-count only).

### Changes Required:

#### 1. Calendar-period window function

**File**: `src/lib/dates.ts`

**Intent**: Given a named calendar-period window and a reference "today," compute the inclusive date bounds to filter competitions/scores by — mirrors `getTrainingWindow`'s signature/testability shape (accepts `today` as a parameter for SSR determinism), but for named periods instead of a day count.

**Contract**: `export type CompetitionTimeWindow = "all-time" | "last-year" | "last-6-months";` `export function getCompetitionWindow(window: CompetitionTimeWindow, today: Date = new Date()): { startDate: string | null; endDate: string }` — `startDate` is `null` for `"all-time"` (no lower bound), else `today` minus 1 year or 6 months respectively, using UTC calendar-date arithmetic consistent with the existing `getTrainingWindow`/`generateDateRange` UTC convention (no per-user timezone handling, per the existing `dates.ts` file header comment). Leap-year boundary (user-confirmed): when `today` is Feb 29 and the "last year" subtraction lands on a non-leap target year, clamp to Feb 28 of that year rather than letting native `Date` arithmetic roll over to Mar 1.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- dates` covering all-time (null start), last-year, and last-6-months bounds, including a leap-year Feb 29 boundary case (asserts clamp to Feb 28 of the target year, not rollover to Mar 1)
- Type checking passes
- Linting passes

#### Manual Verification:

- None — pure function, fully covered by unit tests

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: CompetitionBoard Aggregate — Averages

### Overview

Builds the `CompetitionBoard` aggregate's construction path and per-exercise average computation, independent of `TrainingBoard` (per your decision to keep the established per-aggregate precedent rather than extracting a shared utility).

### Changes Required:

#### 1. `CompetitionBoard.create()` and average computation

**File**: `src/lib/domain/competition-board.ts`

**Intent**: Private-constructor/`static create()` factory (matching `TrainingBoard`'s shape), fails fast on a score referencing an exercise outside this board's class, and computes each exercise's average from raw (unmultiplied) points over only the entered scores — per the "partial scores are row absence" rule, an exercise with zero entered scores has an undefined average, not a zero average.

**Contract**: `export class UnknownExerciseScoreError extends Error` (mirrors `UnknownElementTickError`'s shape/message convention). `export interface ScoreRecord { exerciseId: string; score: number; }`. `export class CompetitionBoard { static create(exercises: Exercise[], scores: ScoreRecord[]): CompetitionBoard; averages(): ReadonlyMap<string, number | null>; }` — `averages()` returns every exercise's id mapped to its mean raw score, or `null` if no scores exist for that exercise. `highlights()` (Phase 4) is a separate method on the same class, consuming this same internal state.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- competition-board` covering: empty scores (all null), single score, multiple scores averaging correctly (including a non-integer average from raw points, per the worked example in `context/foundation/post-mvp-features.md:46`), an `UnknownExerciseScoreError` thrown for a score referencing an exercise not in the board's set
- Type checking passes
- Linting passes

#### Manual Verification:

- None — pure domain logic, fully covered by unit tests

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: CompetitionBoard Aggregate — Highlighting Algorithm

### Overview

Adds `CompetitionBoard.highlights()`: the top-2/bottom-2 tie-expansion algorithm described in "Critical Implementation Details" above, built as a second, isolated test-first pass on top of Phase 3's averages.

### Changes Required:

#### 1. `highlights()` method

**File**: `src/lib/domain/competition-board.ts`

**Intent**: Implements FR-014 exactly: top-2 exercise averages green, bottom-2 red, ties at either extreme expand the highlighted set to include every tied exercise, no highlight at all when every defined average is equal. Exercises with an undefined average (Phase 3) are excluded from ranking entirely.

**Contract**: `highlights(): ReadonlyMap<string, HighlightColor>` (reuse `TrainingBoard`'s `HighlightColor = "green" | "red" | null` type or a local equivalent). Implements the greedy-group walk from "Critical Implementation Details": sort ranked (non-null-average) exercises descending, accumulate whole tied-value groups until the running count reaches 2 for green; same ascending for red; apply the all-equal-averages short-circuit before ranking; resolve any green/red overlap with green precedence, matching `TrainingBoard`'s convention.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- competition-board` — oracle-discipline trace table (mirroring `training-board.test.ts`'s convention) covering: no ranked exercises (empty), all-equal averages (no highlight), clean top-2/bottom-2 with no ties, a rank-1 tie expanding green beyond 2, a rank-2-boundary tie expanding the set, a green/red overlap resolved to green, and a mix of ranked + unranked (no-score) exercises
- Type checking passes
- Linting passes

#### Manual Verification:

- None — pure domain logic, fully covered by unit tests

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Service Layer, Repository & Integration Tests

### Overview

Data-access functions over the new tables, the `loadCompetitionBoard` repository that assembles a validated `CompetitionBoard`, seeding helpers, and the RLS/data-integrity test coverage for the new schema.

### Changes Required:

#### 1. Competition & score service functions

**File**: `src/lib/services/competitions.ts`

**Intent**: Thin data-access functions following the existing `SupabaseClient`-first, throw-raw-error convention (`training-elements.ts`/`training-logs.ts` style).

**Contract**: `getCompetitionsForDogClass(supabase, dogId, classId, startDate: string | null, endDate: string): Promise<Competition[]>` (ordered by `competed_on` ASC; `startDate === null` omits the lower bound for "all-time"); `createCompetition(supabase, dogId, classId, accountId, competedOn): Promise<Competition>` (lets a `23505` unique-violation propagate for the API layer to map to 409); `getCompetitionScores(supabase, competitionIds: string[]): Promise<Pick<CompetitionScore, "competition_id" | "exercise_id" | "score">[]>`; `upsertCompetitionScore(supabase, competitionId, exerciseId, accountId, score): Promise<void>` (`.upsert(..., { onConflict: "competition_id,exercise_id" })`, per research's identified real-upsert analog to `training_logs`' toggle idiom); `deleteCompetitionScore(supabase, competitionId, exerciseId): Promise<void>`; `competitionBelongsToDog(supabase, dogId, competitionId): Promise<boolean>` (app-level defense-in-depth ownership guard before a score write, mirroring `elementBelongsToDog`).

#### 2. `CompetitionBoard` repository

**File**: `src/lib/services/competition-board.ts`

**Intent**: Assembles a validated `CompetitionBoard` for a dog+class+window, mirroring `loadTrainingBoard`'s `Promise.all` + fail-fast-construct pattern.

**Contract**: `loadCompetitionBoard(supabase, dogId, classId, window: CompetitionTimeWindow): Promise<{ board: CompetitionBoard; competitions: Competition[] }>` — resolves the window via `getCompetitionWindow`, fetches exercises for the class and competitions for the dog+class+window in parallel, then fetches scores for those competition ids, then constructs `CompetitionBoard.create(exercises, scoreRecords)`. Returns `competitions` alongside the board since the UI needs the raw list (dates, ids) independent of the aggregate.

#### 3. Test seeding helpers

**File**: `tests/helpers/db.ts`

**Intent**: Extend the established seeding primitives for the new tables.

**Contract**: `seedCompetition(admin, dogId, classId, accountId, competedOn): Promise<{ competitionId: string }>`; `seedCompetitionScore(admin, competitionId, exerciseId, accountId, score): Promise<{ scoreId: string }>` — same shape/signature convention as `seedDog`/`seedElement`.

#### 4. Cross-account authorization coverage

**File**: `tests/unit/cross-account-authorization.test.ts`

**Intent**: Extend the existing nested-`describe`-per-service-module structure with `competitions` and `competition_scores` blocks, following the established pattern (`.rejects` for insert violations, direct null/empty assertions for cross-account reads, HTTP-layer-maps-to-404 is out of scope here — that's covered by API route tests in Phase 6).

**Contract**: Cover: a second account cannot read/insert/update/delete another account's competitions or scores; an insert with an `exerciseId` from a different class than the target competition's class is rejected (the cross-FK `WITH CHECK` from Phase 1).

#### 5. Data-integrity coverage

**File**: `tests/unit/data-integrity.test.ts`

**Intent**: Extend with the new table's DB-level constraints, following the file's existing "assert the DB rejects it, not just the API" convention.

**Contract**: Cover: the score range/quarter-point `CHECK` constraint (reject `10.1`, `5.3`, `-1`); the `UNIQUE(dog_id, class_id, competed_on)` constraint (reject a duplicate-date insert); a concurrency test using `Promise.allSettled` with two concurrent upserts to the same `(competition_id, exercise_id)` pair, asserting the final DB state is exactly one of the two written values (not corrupted) — mirrors the established concurrency-test pattern.

### Success Criteria:

#### Automated Verification:

- Unit/integration tests pass: `npm run test`
- Type checking passes
- Linting passes

#### Manual Verification:

- None — fully covered by the automated integration suite against the local Supabase instance

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 6.

---

## Phase 6: API Routes

### Overview

Mutating endpoints for creating a competition and writing/clearing scores — page-load data is fetched server-side directly via the Phase 5 services (mirroring `grid.astro`), so no GET endpoint is needed for initial render or for highlights (recomputed client-side from the board, mirroring `TrainingGrid.tsx`'s `useMemo` pattern).

### Changes Required:

#### 1. Create competition

**File**: `src/pages/api/dog/[id]/competitions/index.ts`

**Intent**: `POST` creates a new competition for the dog, following the existing route shape (`prerender = false`, inline zod schema, 401 → dog ownership → 404, try/catch → 500 three-way message extraction).

**Contract**: Body `{ classId: string (uuid), competedOn: string (YYYY-MM-DD) }`. No future-date guard (user-confirmed: any date allowed). On the `23505` unique-violation from `createCompetition`, return `409 { error: "A competition already exists on this date for this class" }` — the one deliberate deviation from the generic 500 catch-all, since this is an expected, user-actionable conflict.

#### 2. Upsert / clear a score

**File**: `src/pages/api/dog/[id]/competitions/[competitionId]/scores/[exerciseId].ts`

**Intent**: `PUT` upserts a score, `DELETE` clears it (row removal, per the "partial scores are row absence" rule). Both verify `competitionBelongsToDog` before writing (app-level defense-in-depth, mirroring `elementBelongsToDog`'s usage in `logs/index.ts`).

**Contract**: `PUT` body `{ score: number }`, zod-validated to `0 <= score <= 10` and quarter-point increments (client-side mirror of the DB `CHECK`, so a bad value 400s before hitting Postgres). `DELETE` takes no body. Both return `404` if the competition doesn't belong to the dog, and follow the same 401 → 404 → try/catch → 500 shape as `logs/index.ts`.

### Success Criteria:

#### Automated Verification:

- Unit/integration tests pass: `npm run test` (route-level tests following existing API test conventions, if any exist — otherwise covered transitively by the service-layer tests plus manual verification below)
- Type checking passes
- Linting passes

#### Manual Verification:

- `curl`/Postman (or the browser network tab once Phase 7 wires the UI) confirms: POST creates a competition, a duplicate date 409s, PUT upserts a score, PUT with an out-of-range value 400s, DELETE clears a score, all three 401 when signed out, and a cross-account competitionId 404s

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 7.

---

## Phase 7: UI — Competition Results Page

### Overview

The full user-facing surface: page shell, class selector, the results grid with its new right-sticky average column, score entry, and the add-competition dialog.

### Changes Required:

#### 1. `Select` component

**File**: `src/components/ui/select.tsx` (generated)

**Intent**: No controlled-value dropdown primitive exists yet (only navigation-style `DropdownMenu`). Add via `npx shadcn@latest add select`, per CLAUDE.md's shadcn convention.

**Contract**: Standard shadcn "new-york" style output, unmodified.

#### 2. Time-window options module

**File**: `src/components/competition-results/window-options.ts`

**Intent**: Mirrors `training-grid/window-options.ts`'s shape (shared constants for SSR-read + client-persist), for the new all-time/last-year/last-6-months cookie, kept as a distinct cookie key from the training grid's `trainingGridWindow`.

**Contract**: `COMPETITION_WINDOW_OPTIONS: CompetitionTimeWindow[]`, `COMPETITION_WINDOW_COOKIE_NAME = "competitionResultsWindow"`, `COMPETITION_WINDOW_COOKIE_MAX_AGE`, `isCompetitionTimeWindow(value: string): value is CompetitionTimeWindow`.

#### 3. Page shell

**File**: `src/pages/dogs/[id]/competition-results.astro`

**Intent**: Mirrors `grid.astro`'s SSR-fetch/fail-fast shape: resolve `classId` from the `?classId=` query param (default: the class with `class_number = 1` if absent/invalid) and the window from the cookie, fetch classes list (for the `Select`), and call `loadCompetitionBoard`. No middleware change needed — `/dogs` is already in `PROTECTED_ROUTES` and `selectedDog` is already resolved.

**Contract**: Full-bleed breakout wrapper identical to `grid.astro`'s (`mx-[calc(50%-50vw)] px-4 lg:px-8`). Passes `exercises`, `competitions`, `scores`, `classes`, `selectedClassId`, `initialWindow`, `serviceUnavailable` to the grid island.

#### 4. Results grid

**File**: `src/components/competition-results/CompetitionResultsGrid.tsx`

**Intent**: Renders exercise rows (name + multiplier, both sticky-left, reusing `STICKY_BG`) × competition date columns (horizontally scrollable) × a trailing sticky-right average column — the first right-sticky column in this codebase. Highlights recompute client-side via `useMemo` over `CompetitionBoard.create(...).highlights()`/`.averages()`, mirroring `TrainingGrid.tsx`'s `TrainingBoard` recomputation (no highlights API round-trip).

**Contract**: The average column's header and body cells need `sticky right-0` combined with the existing `sticky top-0`/`sticky left-0` cells — the header row's rightmost cell is simultaneously top- and right-sticky (a new corner case). Existing sticky z-index stack (from `TrainingGrid.tsx`): top-left corner `z-30`, date headers and left name column `z-20`, `z-40` overlay for service-unavailable/empty states. The new top+right sticky corner must sit at/above `z-30` (use `z-30` to match the existing corner, or `z-40`-minus-one logic if a distinct value is needed to avoid ambiguity with the overlay), right-column body cells must clear `z-20`, and everything must stay below the `z-40` overlay. Score cells use a new `ScoreCell` component (below); mount/skeleton/empty-state handling follows `TrainingGrid.tsx`'s `SkeletonGridTable`/`ServiceUnavailableGrid` pattern, with a class-appropriate empty-state message ("No competitions yet in this class" + a way to trigger the add-competition dialog) when `competitions.length === 0`.

#### 5. Score cell

**File**: `src/components/competition-results/ScoreCell.tsx`

**Intent**: A decimal score input, save-on-blur (user-confirmed), following the tap-target-safe pattern from `TickCell.tsx` (`opacity-0`-not-`sr-only` sizing) adapted for a text/number input rather than a checkbox.

**Contract**: Controlled local state initialized from the current score (or empty for unscored); on blur, if the value changed and is valid (0–10, quarter-point — reuse the same zod schema shape as the API route), `PUT` the score; if cleared to empty, `DELETE`; on fetch failure, `toast.error(...)` and revert to the last known-good value (no `useOptimistic` needed — save-on-blur has no per-keystroke race to manage, unlike the tick toggle). 401 → `window.location.href = "/auth/signin"`, per the established lesson.

#### 6. Add-competition dialog

**File**: `src/components/competition-results/AddCompetitionDialog.tsx`

**Intent**: Mirrors `AddElementDialog.tsx`'s dialog/form/loading/toast structure exactly (user-confirmed preference over an inline column-add interaction).

**Contract**: A single `type="date"` input defaulting to today's UTC date; `POST`s to `/api/dog/[id]/competitions` with the current `classId`; on `409`, `toast.error("A competition already exists on this date for this class")`; other errors, including `401`, fall through to a generic `toast.error(...)` — no `/auth/signin` redirect here (user-confirmed: this is a modal dialog only reachable from within an already-loaded page, not a standalone route, so the 401-redirect lesson's exception applies — see `context/foundation/lessons.md`); on success, calls `onAdded(competition)` so the parent can insert the new column.

#### 7. Dashboard nav link

**File**: `src/pages/dogs/[id]/dashboard.astro`

**Intent**: Add a link to the new competition-results page next to the existing "View training grid" link (lines 49-54), following the existing per-dog navigation pattern.

**Contract**: One new `<a href={`/dogs/${dog.id}/competition-results`}>` alongside the existing training-grid link.

### Success Criteria:

#### Automated Verification:

- Type checking passes
- Linting passes
- Unit tests pass: `npm run test`

#### Manual Verification:

- On desktop: select each class, add a competition, enter scores including quarter-point values (5.5, 7.25), confirm the average recalculates immediately and only over entered scores, confirm top-2/bottom-2 highlighting matches expectations for a hand-computed example, switch time windows and confirm columns/averages/highlights all update together
- On mobile viewport: confirm no zoom-on-focus regression when tapping a score cell, confirm horizontal scroll works with the sticky-right average column staying pinned, confirm the sticky top-right corner header cell renders correctly (no z-index bleed-through)
- Attempting a score outside 0–10 or not on a quarter-point shows a clear inline/toast error and does not save
- Signing out mid-session and attempting a score edit redirects to `/auth/signin`

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 8.

---

## Phase 8: Mobile E2E

### Overview

A dedicated mobile-quality-bar Playwright spec for the new page, per your decision to ship this within the slice rather than defer it — mirrors `mobile-grid.spec.ts`'s template, extended with score-entry assertions.

### Changes Required:

#### 1. Mobile E2E spec

**File**: `tests/e2e/mobile-competition-results.spec.ts`

**Intent**: Extends the `mobile-grid.spec.ts` template (Pixel 5 emulation, ARIA-role locators, self-cleanup via `finally`, no DB-teardown fixture) with the new page's specific risks: the visual-viewport zoom regression on a text/number input (not just a checkbox), and the sticky-right average column staying pinned during horizontal scroll.

**Contract**: Assert `window.visualViewport.scale ≈ 1` after tapping a score cell and after tapping the add-competition dialog's date input; assert `document.body.scrollWidth ≈ clientWidth`; assert the average column's bounding rect stays at a fixed right offset during a horizontal scroll gesture; enter a score and confirm the average cell updates.

### Success Criteria:

#### Automated Verification:

- E2E tests pass: `npm run test:e2e`
- Linting passes

#### Manual Verification:

- Visual smoke-check on an actual mobile device or Chrome device emulation, confirming the automated assertions match what's visually observed

**Implementation Note**: This is the final phase — pause here for manual confirmation that the full slice is ready to ship.

---

## Testing Strategy

### Unit Tests:

- `getCompetitionWindow` (Phase 2): all-time/last-year/last-6-months bounds, leap-year edge
- `CompetitionBoard.create()`/`averages()` (Phase 3): partial scores, unknown-exercise fail-fast
- `CompetitionBoard.highlights()` (Phase 4): oracle-discipline trace table per "Critical Implementation Details"

### Integration Tests:

- Cross-account authorization for both new tables, including the cross-FK (exercise/class mismatch) rejection
- Data integrity: score range/quarter-point CHECK, unique-date constraint, concurrent-upsert corruption guard

### Manual Testing Steps:

1. Full US-01 walkthrough on desktop: select class → add competition → enter scores → verify average → verify highlight → switch window → verify all three update together
2. Same walkthrough on a mobile viewport, focused on the sticky-right column and zoom-on-focus behavior
3. Attempt an out-of-range/non-quarter-point score and confirm it's rejected client- and server-side
4. Sign out mid-edit and confirm the 401 → sign-in redirect fires

## Performance Considerations

Small data volumes (single-user, dozens of competitions per class at most) — the composite indexes from Phase 1 are sufficient; no pagination or virtualization is needed for this slice.

## Migration Notes

Both new tables are additive — no existing data is touched or migrated. No backfill required.

## References

- Related research: `context/changes/competition-results-core/research.md`
- Domain aggregate precedent: `src/lib/domain/training-board.ts`
- Schema precedent: `supabase/migrations/20260530000003_create_training_logs.sql`
- UI precedent: `src/pages/dogs/[id]/grid.astro`, `src/components/training-grid/TrainingGrid.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & Types

#### Automated

- [x] 1.1 Migrations apply cleanly — f3b13c6
- [x] 1.2 Type checking passes — f3b13c6
- [x] 1.3 Linting passes — f3b13c6
- [x] 1.4 service_role grant verification query confirms access — f3b13c6

#### Manual

- [x] 1.5 Supabase Studio shows both tables with RLS + expected policies — f3b13c6
- [x] 1.6 Out-of-range/non-quarter-point score insert fails in SQL editor — f3b13c6

### Phase 2: Calendar-Period Time-Window Helper

#### Automated

- [x] 2.1 Unit tests pass (all-time/last-year/last-6-months + leap-year case) — 9d918b7
- [x] 2.2 Type checking passes — 9d918b7
- [x] 2.3 Linting passes — 9d918b7

### Phase 3: CompetitionBoard Aggregate — Averages

#### Automated

- [x] 3.1 Unit tests pass (empty/single/multiple scores, unknown-exercise error) — 52afaad
- [x] 3.2 Type checking passes — 52afaad
- [x] 3.3 Linting passes — 52afaad

### Phase 4: CompetitionBoard Aggregate — Highlighting Algorithm

#### Automated

- [x] 4.1 Unit tests pass (oracle-discipline trace table) — 9a629fe
- [x] 4.2 Type checking passes — 9a629fe
- [x] 4.3 Linting passes — 9a629fe

### Phase 5: Service Layer, Repository & Integration Tests

#### Automated

- [x] 5.1 Unit/integration tests pass
- [x] 5.2 Type checking passes
- [x] 5.3 Linting passes

### Phase 6: API Routes

#### Automated

- [ ] 6.1 Unit/integration tests pass
- [ ] 6.2 Type checking passes
- [ ] 6.3 Linting passes

#### Manual

- [ ] 6.4 POST/409/PUT/400/DELETE/401/cross-account-404 all verified manually

### Phase 7: UI — Competition Results Page

#### Automated

- [ ] 7.1 Type checking passes
- [ ] 7.2 Linting passes
- [ ] 7.3 Unit tests pass

#### Manual

- [ ] 7.4 Desktop walkthrough (class select, add competition, scores, averages, highlights, window switch)
- [ ] 7.5 Mobile viewport walkthrough (zoom-on-focus, sticky-right scroll, sticky corner rendering)
- [ ] 7.6 Invalid score rejected client- and server-side
- [ ] 7.7 401 redirect on sign-out mid-edit

### Phase 8: Mobile E2E

#### Automated

- [ ] 8.1 E2E tests pass
- [ ] 8.2 Linting passes

#### Manual

- [ ] 8.3 Visual smoke-check on device/emulation matches automated assertions
