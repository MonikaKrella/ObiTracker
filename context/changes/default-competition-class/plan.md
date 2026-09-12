# Default Competition Class Implementation Plan

## Overview

Implements FR-008: a handler can mark one competition class as their default per dog. The next time the competition-results page loads for that dog (with no explicit `?classNumber=` in the URL), it opens on the marked default class. This change also updates the fallback used when no class is marked: Class 3 (the last class) instead of today's Class 1, since dogs spend the longest time in the last class.

## Current State Analysis

`competition-results-core` (S-01) shipped the full competition-results page, always defaulting the class selector to `sort_position === 1` (Class 1) when no `?classNumber=` query param is present (`src/pages/dogs/[id]/competition-results.astro:36-39`). There is no per-dog preference storage anywhere in the schema today. The `dogs` table (`supabase/migrations/20260530000001_create_dogs.sql`) already has an `UPDATE` RLS policy and a `service_role` grant (`20260719000001_service_role_table_grants.sql`) that are unused by any shipped feature — both already cover a new updatable column with no further RLS/grant work.

### Key Discoveries:

- `src/middleware.ts:44-55` resolves `Astro.locals.selectedDog` via `getDogById` for every `/dogs/<uuid>/*` route — once the `Dog` type carries the new field, `competition-results.astro` gets the dog's default for free, no new query needed.
- `src/lib/services/training-elements.ts:96-115` (`renameTrainingElement`) is the exact service-layer shape to mirror for a scoped update-and-return-the-row-or-null: `.update(...).eq("id", ...).select().maybeSingle()`.
- `src/pages/api/dog/[id]/competitions/index.ts:11` already establishes the working zod pattern for a `class_number`-shaped field: `z.union(COMPETITION_CLASSES.map((c) => z.literal(c.class_number)))`.
- `src/components/competition-results/CompetitionResultsGrid.tsx:106-110` treats a class _switch_ as a full-page navigation; setting the _default_ is a separate, lighter action (no need to reload data) and needs its own control.
- `tests/unit/cross-account-authorization.test.ts:79` already has a `describe("dogs", ...)` block, and `tests/unit/data-integrity.test.ts:131` already has a CHECK-constraint-testing convention — both are the right place to extend, not new files.
- No shadcn `Badge` component exists (`LibBadge.astro` is an unrelated course-branding component) — the dropdown default indicator is a plain inline `<span>`, no new UI dependency.

## Desired End State

A handler viewing any class on the competition-results page sees a golden star icon next to the class selector: filled solid gold when the currently viewed class is the dog's marked default, outlined (gold border, empty interior) when it isn't. Clicking the outlined star marks the current class as default (fills it in); clicking the filled star clears it (returns to outline). Clicking it marks/unmarks the current class as the default via a single API call, with immediate toast feedback. The class dropdown shows a "· Default" marker next to whichever class is currently marked, regardless of which class is being viewed. The next time the handler opens the competition-results page for that dog with no `?classNumber=` in the URL, it opens on the marked default class; if none is marked, it opens on Class 3 (changed from today's Class 1). Verification: the phase-by-phase Success Criteria below, plus a full manual walkthrough of setting, viewing, and clearing a default across a page reload.

## What We're NOT Doing

- No dedicated Playwright/mobile-E2E spec for this slice — unlike S-01, this change introduces no new sticky columns, no new text/number input (the zoom-on-focus risk class), and no new scroll behavior. The existing toolbar-row wrap behavior is exercised manually (see Phase 3 manual verification). If a real regression risk is later identified here, it can be added as a fast-follow.
- No "no default" UI state beyond the very first visit — once a handler marks a default, the toggle only ever offers "Clear default" (→ back to `NULL`, which the page fallback treats identically to "never marked": Class 3). There is no separate "current default: none" indicator.
- No changes to the class _switch_ mechanism (`handleClassChange`'s full-page navigation) or to any averaging/highlighting logic — this change only touches which class is selected on initial page load.
- No dog-settings page — the toggle lives directly on the competition-results page, next to the existing class selector, per the roadmap's framing of this as "a preference flag layered on S-01's existing class dropdown."

## Implementation Approach

Three phases, each independently verifiable: schema (a single nullable column, no RLS/grant changes needed), service+API+tests (the mutation path, following `renameTrainingElement`'s proven shape), then UI (wiring the fallback and adding the toggle + badge). This mirrors the codebase's established schema → data-access → UI phasing, condensed because the feature is a single scalar preference on an existing table rather than a new aggregate.

## Phase 1: Schema & Types

### Overview

Adds the nullable `default_class_number` column to `dogs` and updates the `Dog` type to match.

### Changes Required:

#### 1. `dogs.default_class_number` column

**File**: `supabase/migrations/20260912000001_dogs_add_default_class_number.sql`

**Intent**: Stores which competition class (if any) is the handler's marked default for this dog. `NULL` means "never marked" — the application layer's Class-3 fallback (Phase 3) handles that case; the DB does not default this to `3`, since "unmarked" and "explicitly defaulted to Class 3" are the same effective behavior but distinct write paths (only the former is the column's initial state).

**Contract**: `ALTER TABLE dogs ADD COLUMN default_class_number smallint NULL CHECK (default_class_number IS NULL OR default_class_number IN (1, 2, 3));` — same literal set as `exercises.class_number` / `competitions.class_number` (`20260903000001_create_competition_reference_data.sql`), consistent with the class-number-denormalization precedent (no FK to a lookup table). No RLS policy or grant changes: `dogs_update_authenticated` and the `service_role` grant on `dogs` already exist and cover `UPDATE` on this new column.

#### 2. `Dog` type

**File**: `src/types.ts`

**Intent**: Add the new column to the `Dog` entity interface so it flows through every existing `dogs` query (`getDogsList`, `getDogById`, `Astro.locals.selectedDog`) without any query changes.

**Contract**: Add `default_class_number: number | null;` to `Dog`, positioned after `deleted_at` to match the migration's column order. `NewDog` (`Pick<Dog, "name">`) is unaffected — the column is nullable and DB-defaulted to `NULL` on insert.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Supabase Studio shows the new `default_class_number` column on `dogs`, nullable, with the CHECK constraint listed
- Attempting to set `default_class_number = 4` via the SQL editor fails with a constraint violation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service, API & Test Coverage

### Overview

Adds the mutation path (set or clear the default) and its authorization/data-integrity test coverage.

### Changes Required:

#### 1. `setDefaultClassNumber` service function

**File**: `src/lib/services/dogs.ts`

**Intent**: Sets or clears (when `classNumber` is `null`) the dog's default competition class, scoped to rows the session owns. Mirrors `renameTrainingElement`'s shape exactly, adapted to update the dog row itself rather than a child resource.

**Contract**: `export async function setDefaultClassNumber(supabase: SupabaseClient, dogId: string, classNumber: number | null): Promise<Dog | null>` — `.from("dogs").update({ default_class_number: classNumber }).eq("id", dogId).select().maybeSingle()`; returns `null` when no row matched (not found, or not owned — RLS makes a cross-account row invisible to the query rather than erroring).

#### 2. Set/clear default API route

**File**: `src/pages/api/dog/[id]/default-class.ts` (new)

**Intent**: `PATCH` sets or clears the dog's default class, following the existing route shape (`prerender = false`, inline zod schema, 401 → validate → 404-on-not-found, try/catch → 500 three-way message extraction). A dedicated route (rather than extending `src/pages/api/dog/[id]/index.ts`, which today is DELETE-only) keeps this change's request/response shape independent of the not-yet-built dog-rename slice's eventual PATCH body on the same resource.

**Contract**: Body `{ classNumber: number | null }`, validated with `z.union([...COMPETITION_CLASSES.map((c) => z.literal(c.class_number)), z.null()])` — the same working literal-union pattern already used in `competitions/index.ts:11`, extended with `z.null()` for the clear case. Calls `setDefaultClassNumber` directly (no separate `getDogById` ownership pre-check needed — the scoped update's `null` return already distinguishes not-found/not-owned from success). Returns `404` if `setDefaultClassNumber` returns `null`, else `200 { success: true, dog }`.

#### 3. Cross-account authorization coverage

**File**: `tests/unit/cross-account-authorization.test.ts`

**Intent**: Extend the existing `describe("dogs", ...)` block (line 79) with a case for the new mutation.

**Contract**: A second account's `setDefaultClassNumber` call against the first account's dog ID returns `null` (not an error) — matches the existing pattern for other cross-account `dogs`-table assertions in that block.

#### 4. CHECK constraint coverage

**File**: `tests/unit/data-integrity.test.ts`

**Intent**: Extend the file's existing CHECK-constraint-testing convention (see the `competition_scores` score-range block at line 131) with the new column's constraint.

**Contract**: A direct DB update setting `default_class_number = 4` (or any value outside `{1,2,3}`) on a seeded dog is rejected by the CHECK constraint; setting it to `NULL` after a non-null value succeeds (the "clear" path).

### Success Criteria:

#### Automated Verification:

- Unit/integration tests pass: `npm run test`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl`/Postman confirms: `PATCH` with a valid class number sets the default and returns it; `PATCH` with `null` clears it; `PATCH` with `4` returns 400; a cross-account dog ID returns 404; signed-out returns 401

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: UI — Default Toggle & Dropdown Badge

### Overview

Wires the page-load fallback to the dog's marked default and adds the toggle control plus the dropdown "Default" indicator.

### Changes Required:

#### 1. Page-load fallback

**File**: `src/pages/dogs/[id]/competition-results.astro`

**Intent**: When no `?classNumber=` is present, fall back to the dog's `default_class_number` first; when the dog has no marked default, fall back to Class 3 (the last class — dogs spend the longest time there) instead of today's Class 1. Pass the dog's current default down to the grid island so it can render the toggle/badge state without an extra fetch.

**Contract**: Change the existing `defaultClass` resolution (currently `COMPETITION_CLASSES.find((c) => c.sort_position === 1)`) to first try `COMPETITION_CLASSES.find((c) => c.class_number === selectedDog.default_class_number)`, falling back to the last class by `sort_position` (today, `sort_position === 3`) when that's `null`/not found — the `requestedClass` (from the query param) still takes precedence over both, unchanged. The trailing defensive literal `?? 1` on `selectedClassNumber` (line 39, for the theoretical case `COMPETITION_CLASSES` is empty) becomes `?? 3` to match. Pass a new `dogDefaultClassNumber={selectedDog.default_class_number}` prop to `CompetitionResultsGrid`.

#### 2. Star toggle control and dropdown badge

**File**: `src/components/competition-results/CompetitionResultsGrid.tsx`

**Intent**: Adds an icon-only golden star toggle next to the existing class `Select` in the toolbar row — filled solid when the currently viewed class is the dog's marked default, outlined (empty interior) otherwise — and a "· Default" marker on whichever `SelectItem` matches the current default, independent of which class is currently being viewed. The toggle is an inline, always-visible toolbar control (not a modal), so per the established 401-redirect lesson it redirects to `/auth/signin` on a 401, matching `ScoreCell.tsx`'s handling rather than `AddCompetitionDialog.tsx`'s modal exception. Being icon-only (no visible text label), it needs an explicit accessible name — a star with no label is not self-describing to screen reader users.

**Contract**: New local state `dogDefaultClassNumber` initialized from the `dogDefaultClassNumber` prop. `isCurrentDefault = selectedClassNumber === dogDefaultClassNumber`. Toggle renders lucide-react's `Star` icon inside a plain `<button type="button">` (not the shadcn `Button` text component — this is an icon affordance): `<Star className={cn("size-5 text-yellow-400", isCurrentDefault && "fill-yellow-400")} />`, i.e. `fill-yellow-400` applied only when `isCurrentDefault` (lucide's default `fill="none"` otherwise leaves the interior empty, so the unfilled state needs no extra class). The button carries `aria-label={isCurrentDefault ? "Clear default" : "Set as default"}` and a matching `title` for a hover tooltip — both re-evaluated on every render so they track the toggled state. `onClick` sends `PATCH /api/dog/${dogId}/default-class` with body `{ classNumber: isCurrentDefault ? null : selectedClassNumber }`; on `401`, `window.location.href = "/auth/signin"`; on success, updates local `dogDefaultClassNumber` state and shows a `toast.success(...)` confirming the new state (e.g. "Class N set as default" / "Default cleared"); on other failures, `toast.error(...)` and no state change. `SelectItem` label gets a trailing `{cls.class_number === dogDefaultClassNumber && <span className="text-white/40"> · Default</span>}`. The toggle sits in the existing "Row 1" flex container (`CompetitionResultsGrid.tsx:176`) alongside the `Select` and `AddCompetitionDialog`, wrapping with them as a unit on narrow viewports per the existing comment's stated intent for that row.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- On desktop: viewing Class 2, click the outlined star — it fills solid gold, dropdown shows "Class 2 · Default"; reload the page with no `?classNumber=` — it opens on Class 2
- Switch to Class 1 (still no default marked on it) — dropdown still shows the "· Default" marker on Class 2, not Class 1; the star for Class 1 renders outlined (empty), not filled
- Click the filled star while viewing Class 2 — it reverts to outlined, dropdown marker disappears; reload with no `?classNumber=` — it falls back to Class 3
- A dog that has never had a default marked (`default_class_number` is `NULL` from creation) opens directly on Class 3 when visiting competition-results with no `?classNumber=`
- Hover the star: tooltip reads "Set as default" or "Clear default" matching its current state; inspect the accessible name (e.g. via screen reader or dev tools) to confirm the `aria-label` matches
- On mobile viewport: confirm the toolbar row (selector + star toggle + add-competition) wraps cleanly with no overlap or cut-off content
- Signing out and clicking the toggle redirects to `/auth/signin`

**Implementation Note**: This is the final phase — pause here for manual confirmation that the full slice is ready to ship.

---

## Testing Strategy

### Unit Tests:

- CHECK constraint on `dogs.default_class_number` (Phase 2): rejects out-of-range values, accepts `NULL` after a prior non-null value

### Integration Tests:

- Cross-account authorization: a second account cannot set/clear another account's dog's default class

### Manual Testing Steps:

1. A dog with no marked default (fresh dog, or one created before this change) opens competition-results on Class 3 with no `?classNumber=`
2. Mark a default via the star toggle (outlined → filled gold), reload with no query param, confirm it opens on that class
3. View a non-default class, confirm the dropdown still shows the marker on the actual default, not the currently-viewed class, and that class's star renders outlined
4. Clear the default via the star toggle (filled → outlined), reload, confirm fallback to Class 3
5. Confirm the star's tooltip/`aria-label` text matches its fill state at every step
6. Mobile viewport: confirm the toolbar row wraps without overlap
7. Sign out mid-session and click the toggle, confirm redirect to `/auth/signin`

## Performance Considerations

None beyond the existing page — this adds one nullable column to an already-fetched row and one lightweight PATCH; no new queries on the read path.

## Migration Notes

The schema addition is purely additive — the new column defaults to `NULL` for every existing dog, no backfill required. However, the Phase 3 fallback change is a deliberate **behavior** change, not just additive: every dog without a marked default (i.e. every existing dog, until a handler marks one) now opens on Class 3 instead of Class 1 as soon as this ships — there is no gradual rollout or opt-in for the fallback switch itself.

## References

- Related roadmap entry: `context/foundation/roadmap.md` (S-03: Default competition class)
- PRD requirement: `context/foundation/prd-v2.md` (FR-008)
- Service-layer precedent: `src/lib/services/training-elements.ts:96-115` (`renameTrainingElement`)
- API-route precedent: `src/pages/api/dog/[id]/elements/[elementId]/index.ts` (PATCH shape), `src/pages/api/dog/[id]/competitions/index.ts:11` (zod literal-union pattern)
- 401-redirect lesson: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & Types

#### Automated

- [x] 1.1 Migration applies cleanly — dbc428f
- [x] 1.2 Type checking passes — dbc428f
- [x] 1.3 Linting passes — dbc428f

#### Manual

- [x] 1.4 Supabase Studio shows the new column with CHECK constraint — dbc428f
- [x] 1.5 Out-of-range value rejected in SQL editor — dbc428f

### Phase 2: Service, API & Test Coverage

#### Automated

- [x] 2.1 Unit/integration tests pass — 195268d
- [x] 2.2 Type checking passes — 195268d
- [x] 2.3 Linting passes — 195268d

#### Manual

- [x] 2.4 PATCH set/clear/invalid/cross-account/signed-out all verified manually — 195268d

### Phase 3: UI — Default Toggle & Dropdown Badge

#### Automated

- [x] 3.1 Type checking passes — 99d5266
- [x] 3.2 Linting passes — 99d5266
- [x] 3.3 Unit tests pass — 99d5266

#### Manual

- [x] 3.4 Dog with no marked default opens on Class 3 (not Class 1) with no `?classNumber=` — 99d5266
- [x] 3.5 Set default via star toggle, reload, opens on that class — 99d5266
- [x] 3.6 Dropdown marker follows the actual default, not the viewed class; non-default star renders outlined — 99d5266
- [x] 3.7 Clear default via star toggle, reload, falls back to Class 3 — 99d5266
- [x] 3.8 Star tooltip/aria-label text matches fill state at every step — 99d5266
- [x] 3.9 Mobile toolbar row wraps without overlap — 99d5266
- [x] 3.10 401 redirect on sign-out mid-session — 99d5266
