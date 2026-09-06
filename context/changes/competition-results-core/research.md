---
date: 2026-09-06T16:35:10+0000
researcher: Claude Sonnet 5
git_commit: d65708f9fffe68667ecbe87ee7f184b61914c110
branch: docs-update
repository: MonikaKrella/ObiTracker
topic: "Competition results core (S-01) — schema, domain logic, UI, and testing conventions to plan against"
tags: [research, codebase, competition-results, training-board, rls, grid-ui, domain-layer]
status: complete
last_updated: 2026-09-06
last_updated_by: Claude Sonnet 5
---

# Research: Competition results core (S-01)

**Date**: 2026-09-06T16:35:10+0000
**Researcher**: Claude Sonnet 5
**Git Commit**: d65708f9fffe68667ecbe87ee7f184b61914c110
**Branch**: docs-update
**Repository**: MonikaKrella/ObiTracker

## Research Question

What existing schema, domain-layer, UI, and testing conventions should the implementation plan for **S-01 "competition-results-core"** (per dog: select a competition class, enter raw per-exercise scores, see live averages, see top-2/bottom-2 highlighting, filtered by a time window) build on, extend, or deliberately introduce as new?

## Summary

S-01 is the V2 north star. Its prerequisite (F-01, competition reference data: `competition_classes`/`exercises`) and a sibling foundation slice (F-02, the `TrainingBoard` domain-aggregate refactor) are both already shipped and archived, and both are direct structural precedent for this slice:

- **Schema**: two well-established dog-scoped table patterns exist (`training_elements`'s no-`account_id`/EXISTS-subquery style vs. `training_logs`'s denormalized-`account_id` style for query-heavy read paths) plus the just-shipped reference-data pattern (SELECT-only, `USING (true)`, no anon). S-01's read-heavy averaging/highlighting query shape argues for `training_logs`'s denormalized style, not the default EXISTS style. **No existing precedent for tags, decimal/quarter-point values, or numeric upsert** — these are new.
- **Domain logic**: `TrainingBoard` (`src/lib/domain/training-board.ts`) is the direct shape to imitate (private constructor + `static create()` factory, fail-fast), but its 3-tier/suppression/tie-expansion algorithm is hardcoded for a top-3/bottom-3 rule over tick _counts_; nothing is extracted as reusable, so a new aggregate for top-2/bottom-2 over score _averages_ must be built independently, re-deriving (simpler) tier thresholds and tie-expansion.
- **UI**: `TrainingGrid.tsx` + `grid.astro` supply directly reusable patterns (sticky-column/opaque-background grid, full-bleed horizontal-scroll layout, SSR→island hydration-swap, skeleton loading states, the `sr-only`-zoom-bug workaround) but leave real gaps: no `Select` component, no decimal input, no tooltip primitive, no right-edge-sticky column precedent, no URL-param state precedent (the existing window selector uses a cookie).
- **Testing**: the cross-account (`tests/unit/cross-account-authorization.test.ts`) and data-integrity (`tests/unit/data-integrity.test.ts`) test files are designed to be extended, not reinvented; the mobile E2E spec (`tests/e2e/mobile-grid.spec.ts`) is the template for a new mobile competition-results spec. A documented anti-pattern (API-only validation with no DB `CHECK`) should NOT be repeated for the score value-range constraint.
- **Scope flag**: the task brief mentions "up to 3 tags," but tags are FR-011 / **S-04 "competition-tags"**, a separate roadmap slice with S-01 as its prerequisite — not part of S-01 per the roadmap's own sequencing. This should be confirmed with the user before planning (see Open Questions).

## Detailed Findings

### Schema & RLS conventions

Three precedent shapes exist in `supabase/migrations/`:

1. **`dogs`** (`20260530000001_create_dogs.sql`) — root of the ownership chain: `account_id uuid REFERENCES auth.users(id)`. RLS ownership check `(select auth.uid()) = account_id` (the `(select ...)` wrapper is mandatory — see `[[supabase_grants_service_role]]`-adjacent lesson in `context/foundation/lessons.md`). One named policy per operation per role (`<table>_<op>_authenticated`). `REVOKE SELECT ... FROM anon` inline in the same migration. Shared `set_updated_at()` trigger for `updated_at`. Soft-delete columns (`is_deleted`, `deleted_at`) were added in a later migration by **dropping and recreating** the SELECT policy, not patching it.
2. **`training_elements`** (`20260530000002_create_training_elements.sql`) — no own `account_id`; ownership proven via `EXISTS (SELECT 1 FROM dogs WHERE dogs.id = dog_id AND dogs.account_id = (select auth.uid()))` in every policy. `UNIQUE (dog_id, name)`.
3. **`training_logs`** (`20260530000003_create_training_logs.sql`) — deliberately denormalizes `account_id` (documented rationale: O(1) RLS check + a composite index `(account_id, dog_id, trained_on)` that the highlight algorithm's query shape needs). No UPDATE policy (presence-only: insert=tick, delete=untick). INSERT policy chains **three** EXISTS checks, including cross-FK consistency (`training_elements.dog_id` must match the row's own `dog_id`) — direct precedent for `competition_scores` needing to verify an exercise's `class_id` matches the parent competition's class.
4. **Reference data** (`20260903000001_create_competition_reference_data.sql`, `...002_add_class_number...sql`) — `competition_classes`/`exercises`, SELECT-only RLS (`USING (true)`), no INSERT/UPDATE/DELETE policy at all, grants inlined in the same migration (not retrofitted). `exercises.class_id → competition_classes.id`, `CHECK (multiplier > 0)` is the **only** existing CHECK-constraint precedent in the schema.

**Grants**: inline-in-creation-migration (reference-data style) is confirmed as the corrected current practice — the original `dogs`/`training_elements`/`training_logs` grants were retrofitted later (`20260718000001_explicit_grants.sql`, `20260719000001_service_role_table_grants.sql`) only because the original migrations predated the lesson; new tables should not repeat that gap. Per `[[supabase_grants_service_role]]`, grant `service_role` explicitly too.

**Service layer** (`src/lib/services/training-elements.ts`, `training-logs.ts`, `competition.ts`): every function takes `SupabaseClient` first, throws raw `result.error`, casts `result.data`. `training-logs.ts`'s `toggleTrainingLog` (insert-then-catch-`23505`-then-delete) is a boolean-toggle idiom that does **not** map onto a numeric score overwrite — a real `.upsert(..., { onConflict: "..." })` against a `UNIQUE(competition_id, exercise_id)` constraint is the correct analog instead. `training-elements.ts`'s `elementBelongsToDog` is the precedent for an app-level defense-in-depth ownership check before writing a dependent row.

**API routes** (`src/pages/api/dog/[id]/**`): `prerender = false`, inline module-scope zod schema (no shared schemas file exists for `/api/dog/*` routes — only `/api/auth/*` has one), 401 → dog ownership via `getDogById` → 404 (never 403), entity-specific ownership guard before mutation, generic try/catch → 500 with a three-way `err.message` extraction. New page routes must be added to `PROTECTED_ROUTES` in `src/middleware.ts:5`.

**Types** (`src/types.ts`): flat, snake_case, column-order-matches-schema entity interfaces; `New<Entity>` Insert DTOs via `Pick<Entity, "col1" | "col2">` with a doc comment on every omitted column explaining why (session-injected, DB-generated, DB-defaulted).

**Tests** (`tests/helpers/db.ts`, `cross-account-authorization.test.ts`, `data-integrity.test.ts`, `competition-reference-data.test.ts`): `createAdminClient`/`createAnonClient`/`createTestUser`/`seedDog`/`seedElement` are the established seeding primitives — a `seedCompetition`/`seedCompetitionScore` pair should follow the same `{ competitionId }`/`{ scoreId }` shape. The cross-account suite is structured as nested `describe` blocks per service module inside one file — extend it rather than starting a new file. The reference-data test file is the template for the RLS-boundary half of a hybrid table (dog-scoped but FK'd into read-only reference data).

### Domain logic — TrainingBoard pattern and what does/doesn't generalize

`src/lib/domain/training-board.ts` (192 lines) — `TrainingBoard`: private constructor + `static create(elements, ticks)` factory that fails fast (`UnknownElementTickError`) rather than silently trusting a precondition. `highlights()` implements a 3-tier system:

- n≤3 → no highlights at all.
- 4≤n≤6 → single-winner-only (direct adjacent-value comparison, no set, no expansion).
- n≥7 → full algorithm: boundary-rank (rank-1 green / rank-last red) tie-expansion via a `for...of` loop over a sorted array into a `Set`; ranks 2/3 are gated by a **global frequency map** (a count shared by any other element anywhere skips that slot, never filled by another candidate); a ≥50%-coverage suppression rule clears the green (or red) set in isolation after it's built; green overwrites red on overlap.

**No generic tie-expansion/ranking utility exists anywhere** (`grep` confirms) — this logic is entirely inline and specific to `TrainingBoard.highlights()`. `context/domain/01-domain-distillation.md` and `02-invariant-aggregate-refactor.md` contain zero prior design thinking about generalizing this shape to competition results (in fact `01-domain-distillation.md` lists competition results as an explicit Non-Goal, predating the current PRD v2).

**What DOES generalize**: the private-constructor/`static create()`-factory shape itself (per CLAUDE.md's "Domain layer" convention), the `loadTrainingBoard()` repository pattern (`Promise.all([...])` two independent fetches, reconciled by the aggregate's fail-fast constructor, not a DB join), the `logsToTickRecords`/`ticksMapToTickRecords` thin-adapter pattern (raw DB row → domain record, no validation — validation lives entirely in the factory), and the `GET /api/dog/[id]/grid`-style endpoint shape.

**What must be re-derived, not ported**: the FR-014 rule is simpler than `TrainingBoard`'s — "if all exercise averages are equal, no exercise is highlighted" is the only stated degenerate case (no 3-tier n≤3/≤6/≥7 special-casing is specified in the PRD), and there's no stated suppression rule. Ranking is over **averages** (a `Map<exerciseId, number>` derived from raw scores within the selected window), not raw tick counts, and top-2/bottom-2 not top-3/bottom-3. `src/lib/dates.ts` only has fixed-rolling-window helpers (day-count based) — nothing for calendar-period windows (all-time/last-year/last-6-months) — a new date-window helper is needed.

**Recommendation surfaced by research** (not a decision — flag for planning): build a parallel aggregate (e.g. `CompetitionBoard` or similar) rather than computing averages/highlights only inside a React `useMemo`, to avoid recreating the exact "highlight logic has no owner" gap F-02 was built to close (this is also FR-017/FR-018's explicit intent — reusable classification, not UI-only).

### UI & UX conventions

`grid.astro` (96 lines) / `TrainingGrid.tsx` (325 lines) supply the following **directly reusable** patterns:

- **Full-bleed horizontal scroll**: `mx-[calc(50%-50vw)] px-4 lg:px-8` breakout from `AuthLayout`'s `max-w-4xl` column (`grid.astro`), `overflow-x-auto [overflow-y:clip]` wrapper + `table-fixed border-collapse` table (`TrainingGrid.tsx`).
- **Sticky column + header**: `sticky left-0 z-20` on the row-header cell, `sticky top-0 z-30/z-20` on the header row, with **opaque** (not translucent) backgrounds via `src/components/training-grid/sticky-colors.ts`'s `STICKY_BG` map — translucent stickies bleed through on iOS Safari. No precedent exists yet for a **right-edge** sticky column (the new grid's trailing "average" column would be a first).
- **SSR→island hydration-swap**: `useMounted()` gates interactive markup; a parallel static duplicate markup block renders pre-mount to avoid layout shift. Real cost: doubled render branches.
- **Loading/error states**: no spinner — `SkeletonGridTable` (`animate-pulse` placeholders) + a dark overlay message, for both `serviceUnavailable` and empty-elements cases.
- **Tap-target zoom bug**: a `size-11` `<label>` wrapping a **fully-sized, `opacity-0`** (not `sr-only`) `<input>` — `sr-only`'s 1×1px collapse triggers a mobile WebKit/Blink zoom-to-focused-element bug inside a horizontally-scrolling container. Directly relevant to any new tap/focus targets (score cells, tag chips).
- **Window-selector state**: a **cookie** (`Astro.cookies` + client-side `document.cookie` write), not a URL query param or localStorage — chosen specifically so SSR can render the correct initial state with no post-hydration flicker. No URL-param precedent exists anywhere in this flow.

**Gaps — genuinely new patterns this slice must introduce**:

1. No decimal/quarter-point numeric input anywhere (`Input.tsx` is a generic text wrapper; `type="number"` has zero existing usage). No `react-hook-form`/`zodResolver` anywhere — the established pattern is plain `useState` + manual `fetch` + server-side zod + toast-on-error (see `AddElementDialog.tsx`, the direct template for an "add a competition" dialog).
2. No `Select` component exists — only `DropdownMenu` (navigation-style, `asChild`+`<a>`, as in `DogSwitcher.tsx`). A controlled-value class-picker needs either `npx shadcn@latest add select` or a repurposed `DropdownMenu` with `onSelect`.
3. No tooltip primitive exists (`src/components/ui/` has no `tooltip.tsx`) — needed for the tags truncate+hover requirement (FR-011, but see Open Questions on scope).
4. No scroll-lag/perf testing precedent.

**Mobile E2E template**: `tests/e2e/mobile-grid.spec.ts` (58 lines, `Pixel 5` emulation, the only configured Playwright project) asserts `window.visualViewport.scale ≈ 1` (guards the historical shrink-to-fit regression), `document.body.scrollWidth ≈ clientWidth` (page-level overflow — note the `documentElement.scrollWidth` gotcha: Chromium clamps it once `overflow-x:hidden` is set on `html`), and a tap-interaction re-check of the same scale invariant. Pure ARIA-role locators. Self-cleanup via a `finally` block (no DB teardown fixture). Direct template for a new `mobile-competition-results.spec.ts`, extended with score-entry and scroll-smoothness assertions that have no existing precedent.

### Prior testing/architecture decisions relevant to S-01

- **Mobile regression history** (`context/archive/2026-06-22-testing-mobile-field-use-regression-guard/`): the exact viewport-meta and zoom-on-focus bugs above were real production incidents, not hypothetical — the full-bleed-width mechanism is a fragile 3-layer uncontained chain with no shared abstraction (`AuthLayout`'s column → page breakout → component's own `overflow-x-auto`); any new mobile-capable page hand-rolls the same breakout and should get the same Playwright guard.
- **Cross-account architecture** (`context/archive/2026-06-28-testing-cross-account-authorization-gate/`): confirms RLS-first, no app-level cross-account filter, is the sole enforcement mechanism; reads/deletes return null/empty on a cross-account attempt, inserts throw a `PostgrestError` (`WITH CHECK` failure) — tests must use `.rejects` for inserts vs. direct value assertions for reads. HTTP layer always maps cross-account access to 404, never 401/403.
- **Data-integrity lesson — DB constraints over API-only validation** (`context/archive/2026-06-28-testing-data-integrity-at-the-api-layer/`, cross-referenced in `context/foundation/post-mvp-notes.md:127-131`): `training_logs`'s future-date guard is documented as an API-only gap (no DB `CHECK`) — an explicitly named anti-pattern. For `competition_scores`'s 0–10/quarter-point range, **prefer a DB-level `CHECK` constraint** (e.g. `CHECK (score >= 0 AND score <= 10 AND score * 4 = floor(score * 4))`) over repeating the API-only pattern, since this is a fresh table and the lesson is already on record.
- **Concurrency pattern**: the established idiom for concurrent-write safety is a DB-level `UNIQUE` constraint + a `Promise.all`/`Promise.allSettled` integration test asserting final DB state is never corrupted — directly applicable to `competition_scores` via `UNIQUE (competition_id, exercise_id)`.
- **Highlight-correctness lesson** (`context/archive/2026-06-23-testing-highlight-correctness-recalculation-wiring/`): the training-grid highlight algorithm evolved through 5 undocumented corrections before being pinned down — write hard-coded-expectation ("oracle discipline") unit tests up front for every tier/tie/all-equal configuration of the new top-2/bottom-2 rule, mirroring `training-board.test.ts`'s boundary-first trace-table convention (two `describe` blocks: behavioral trace table + factory-contract; helpers build minimal domain objects; full-map literal assertions, never partial).

## Code References

- `supabase/migrations/20260530000001_create_dogs.sql` — root ownership table, RLS + trigger + rollback conventions
- `supabase/migrations/20260530000002_create_training_elements.sql:2-3,11,20-55` — EXISTS-subquery ownership pattern, named UNIQUE constraint convention
- `supabase/migrations/20260530000003_create_training_logs.sql:5-9,17,29-47,57-58` — denormalized `account_id` rationale, cross-FK consistency check, composite index
- `supabase/migrations/20260903000001_create_competition_reference_data.sql:34-56` — SELECT-only reference-data RLS/grant shape
- `supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql:3-6` — independent-column-despite-1:1-today precedent
- `supabase/migrations/20260718000001_explicit_grants.sql`, `20260719000001_service_role_table_grants.sql` — retrofit grants (do not repeat the retrofit pattern; inline instead)
- `src/lib/services/training-elements.ts:31-52,149-166,176-189` — duplicate-check, ownership-guard, RPC-call patterns
- `src/lib/services/training-logs.ts:40-75` — boolean toggle-via-unique-violation idiom (not applicable to numeric scores)
- `src/lib/services/competition.ts` — read-only reference-data service, full file
- `src/pages/api/dog/[id]/elements/index.ts`, `.../logs/index.ts`, `.../grid.ts` — standard API route shape
- `src/middleware.ts:5,8-9,43-55` — `PROTECTED_ROUTES`, `selectedDog` resolution, API-route exclusion
- `src/types.ts:1-7,54-71` — entity/DTO conventions
- `src/lib/domain/training-board.ts` (full file, 192 lines) — aggregate shape, 3-tier/suppression/tie-expansion algorithm
- `tests/unit/training-board.test.ts` (full file, 377 lines) — trace-table test convention
- `src/lib/services/training-board.ts` — repository pattern (`Promise.all` + fail-fast construct)
- `src/pages/api/dog/[id]/grid.ts` — API-route-over-aggregate pattern
- `src/lib/training-grid-helpers.ts:46-62` — thin adapter pattern (`logsToTickRecords`, `ticksMapToTickRecords`)
- `src/lib/dates.ts` — only fixed-rolling-window helpers exist; calendar-period windows are new
- `src/pages/dogs/[id]/grid.astro` (full file, 96 lines) — full-bleed layout, fetch/fail-fast pattern, cookie-based window state
- `src/components/training-grid/TrainingGrid.tsx` (full file, 325 lines) — sticky grid, hydration-swap, skeleton states
- `src/components/training-grid/sticky-colors.ts` — opaque sticky-background rationale
- `src/components/training-grid/TickCell.tsx:42-81` — optimistic update + `opacity-0`-not-`sr-only` zoom-bug workaround
- `src/components/dogs/DogSwitcher.tsx` — only dropdown precedent (navigation-style, not controlled-value)
- `src/components/training-elements/AddElementDialog.tsx` (full file, 103 lines) — dialog/form/loading/toast template
- `src/components/ui/input.tsx` — generic text input, no numeric/decimal precedent
- `tests/e2e/mobile-grid.spec.ts` (full file, 58 lines) — mobile quality-bar assertions template
- `tests/helpers/db.ts` (full file, 124 lines) — seeding/auth primitives
- `tests/unit/cross-account-authorization.test.ts`, `tests/unit/data-integrity.test.ts`, `tests/unit/competition-reference-data.test.ts` — extend, don't reinvent

## Architecture Insights

- **Two competing ownership-proof patterns coexist by design**, chosen per query shape: EXISTS-subquery (simpler, default) vs. denormalized `account_id` (chosen only when a query-heavy read path needs a composite index). S-01's averaging/highlighting read path resembles the training grid's, which argues for the denormalized style for `competition_scores` (and possibly `competitions`) — a conscious choice to make in planning, not a default.
- **Grants belong inline in the creation migration now** — the retrofit migrations (`20260718...`, `20260719...`) are historical debt from before this was a written lesson, not a pattern to repeat.
- **RLS is the sole enforcement layer**; the app never adds a redundant cross-account filter — but service-layer functions still add defense-in-depth ownership checks before writes to catch a caller passing IDs that don't belong together (not for cross-account, which RLS already blocks, but for cross-_entity_ consistency, e.g. an exercise belonging to a different class than the competition selected).
- **Domain aggregates are per-invariant, not shared** — this codebase has so far preferred one self-contained aggregate method over extracting a generic ranking/tie-expansion utility, even though `TrainingBoard` and the new competition-averaging rule are conceptually similar. Planning should decide explicitly whether to keep that precedent (write a second, independent aggregate) or use this as the moment to extract a shared utility — research found no signal either way was pre-decided.
- **DB `CHECK` constraints are the corrected direction**, not API-only validation — this is a live, named lesson from a prior audit (`context/foundation/post-mvp-notes.md:127-131`), directly actionable for the score value-range constraint.

## Historical Context (from prior changes)

- `context/archive/2026-09-03-competition-reference-data/plan.md` — F-01, the direct schema/service-layer precedent this slice builds on; its own "What We're NOT Doing" section explicitly defers `competitions`/scores tables to S-01.
- `context/archive/2026-09-04-training-board-refactor/plan.md` — F-02, the direct domain-aggregate precedent; 7-phase test-first sequencing (test suite → aggregate → repository → API route → wire SSR → wire client → cleanup) is a reusable phasing template for a new aggregate.
- `context/archive/2026-06-22-testing-mobile-field-use-regression-guard/` — mobile viewport/zoom bug history and fixes.
- `context/archive/2026-06-28-testing-cross-account-authorization-gate/` — RLS-first architecture confirmation, test suite to extend.
- `context/archive/2026-06-28-testing-data-integrity-at-the-api-layer/` — DB-constraint-over-API-validation lesson, concurrency test pattern.
- `context/archive/2026-06-23-testing-highlight-correctness-recalculation-wiring/` — "oracle discipline" testing lesson, history of undocumented algorithm drift to avoid repeating.
- `context/foundation/post-mvp-features.md:11-51` — worked averaging example (average is always over raw/unmultiplied points; multiplier is display-only) and more detailed tags UX than the PRD — **but not the canonical seed-data source** (the migration is ground truth for exercises/multipliers, per the F-01 archive's own correction note).
- `context/foundation/post-mvp-notes.md:115-131` — anon RPC EXECUTE grant lesson, API-only-validation anti-pattern, racy check-then-insert anti-pattern (`Dog` name uniqueness) — all reinforce "prefer a DB constraint."

## Related Research

- None yet under `context/changes/**/research.md` or `context/archive/**/research.md` specifically targets S-01; the closest prior research is `context/archive/2026-09-04-training-board-refactor/`'s domain analysis (`context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`), read in full during this research and found to contain no prior thinking about generalizing to competition results.

## Open Questions

1. **Tags scope mismatch.** `context/foundation/roadmap.md:37,133-143` and `prd-v2.md:121-122,167` scope tags (FR-011, "up to 3 short tags per competition") as **S-04 "competition-tags"**, a separate slice with S-01 as its prerequisite — not part of S-01. No existing schema/UI precedent for tags exists anywhere in the codebase. Recommend confirming with the user whether S-01's plan should (a) exclude tags entirely, deferred to S-04 per the roadmap's own sequencing, or (b) explicitly widen S-01's scope to include them now. Owner: user.
2. **Ownership-proof pattern for `competitions`/`competition_scores`** — EXISTS-subquery (`training_elements`-style) vs. denormalized `account_id` (`training_logs`-style, justified by query-heavy read paths). Given S-01's averaging/highlighting query shape resembles the training grid's, the denormalized style is the research-informed lean, but this is a planning decision, not yet made.
3. **Shared vs. per-aggregate tie-expansion logic** — no existing generic utility; whether to extract one now (given `TrainingBoard` and a new competition-averaging aggregate share a conceptual shape) or keep the established per-aggregate-inline precedent is undecided.
4. **Time-window state mechanism** — cookie (matching the existing 7/14/30 selector) vs. URL query param (if the new all-time/last-year/last-6-months filter should be shareable/bookmarkable) has no forcing precedent either way.
