# Training Grid Implementation Plan

## Overview

Build the training grid (S-04) — the product's north star. The handler opens `/dogs/[id]/grid` and sees, at a glance, which training elements are over- and under-trained within a 7/14/30-day window, and can tick/untick any visible day with a single tap. `training_logs` already exists with the right schema, indexes, and RLS (`supabase/migrations/20260530000003_create_training_logs.sql`) — this plan adds the read/write service layer, the toggle API, the highlight algorithm, and the grid UI on top of it. No new migration is needed.

## Current State Analysis

- `training_elements` and `training_logs` tables, RLS, and indexes are live (S-03, merged). `TrainingElement`/`TrainingLog` types exist in `src/types.ts`.
- The `training-elements` feature (`src/components/training-elements/`, `src/pages/dogs/[id]/elements.astro`, `src/pages/api/dog/[id]/elements/`) establishes every convention this plan reuses: service-layer functions that always source `account_id`/ownership from the session, zod-validated API routes with a uniform 401→404→400→500 error shape, and the `useMounted()` SSR-hydration-guard pattern for React islands (`src/components/hooks/useMounted.ts`).
- There is no test runner in the project (`package.json` has no `test` script, no `vitest`/`jest` dependency). CLAUDE.md is explicit: "No test suite is configured — do not add one unless asked." This plan is the asked-for exception, scoped to exactly one function.
- No shadcn `Tabs`/`ToggleGroup`/`Select` component is installed; the window selector is a small custom segmented button group built from the existing `Button` component (`variant="default"` for the active window, `variant="outline"` for the others).

## Desired End State

A handler can navigate to `/dogs/[id]/grid` (linked from the per-dog dashboard), see a sticky-header/sticky-column grid of their training elements × the last 7/14/30 days, with the top/bottom elements highlighted green/red per the tiered algorithm, tap any cell to tick/untick it with immediate visual feedback, and switch windows via three buttons whose selection survives a page reload (via `localStorage`, not a URL query param). Data fetching and highlight calculation are always scoped to a fixed 30-day window, independent of the 7/14/30 selector — the selector only changes which already-fetched date columns are rendered (see Critical Implementation Details). Verification: visit the route on a fresh dog (empty state), a dog with elements but no ticks (unhighlighted grid), and a dog with ≥7 elements and varied tick counts (correct green/red rows); confirm a tick persists after reload; confirm window switching is instant with no network call and never changes which rows are highlighted.

### Key Discoveries:

- `src/lib/services/training-elements.ts` and its API routes (`src/pages/api/dog/[id]/elements/index.ts`, `reorder.ts`) are the template for the new service/route pair — thin routes, business logic in `src/lib/`.
- `src/middleware.ts:44-55` already resolves and protects `Astro.locals.selectedDog` for any `/dogs/<uuid>/*` path — `grid.astro` needs no new middleware work.
- `TrainingElementsManager.tsx:98-110`'s `!mounted` branch is plain inline JSX duplicating a simplified version of the interactive markup, not a separate shared component — the new grid island follows the same shape rather than factoring out a `StaticTrainingGrid` component.
- `research.md` Section 9 contains the fully-traced, authoritative `computeHighlights` implementation (3 tiers, tie expansion, ≥half suppression) — to be copied, not redesigned.
- The research draft of the toggle endpoint catches *any* INSERT error and falls through to DELETE. This is a bug: a genuine RLS/ownership failure would silently become a no-op "untick." Fixed in Phase 2 by checking the Postgres unique-violation code (`23505`) before falling through.

## What We're NOT Doing

- No new Supabase migration — `training_logs` schema, indexes, and RLS already cover this feature.
- No per-user timezone handling — UTC throughout, per research.md Q4 (already resolved); the date guard added in Phase 2 is timezone-neutral by construction (see Critical Implementation Details).
- No progressive-enhancement (no-JS-functional) window selector — consistent with the rest of the app (e.g. `DogSwitcher` is `client:only="react"`), the window selector simply doesn't render until the island hydrates.
- No competition-results integration, no session notes, no sharing — out of scope per the PRD's Non-Goals.
- No broader test infrastructure — Vitest is added scoped to `computeHighlights` only, not as a general project test suite.

## Implementation Approach

Five phases, each independently demoable: (1) pure algorithm + date helpers + their tests, (2) the data layer (service + toggle API), (3) a working but read-only SSR grid page, (4) the interactive island layered on top of the same markup, (5) dashboard wiring and an accessibility pass. This mirrors the dependency order — UI phases consume the pure functions and API built in 1–2 — and lets each phase be manually verified in a real browser before the next one adds complexity.

## Critical Implementation Details

- **Vitest needs no Astro/Vite integration.** Every `@/...` import inside the tested files (`highlight.ts`, `dates.ts`) is `import type`, which esbuild strips entirely during transpilation — no runtime module resolution is attempted for it. A plain `defineConfig` from `vitest/config` is sufficient; do not reach for `getViteConfig` from `astro/config` or add a path-alias plugin. Test files use relative imports (`./highlight`) since they live alongside their source files.
- **Date guard is timezone-neutral by construction.** `trained_on` strings are `YYYY-MM-DD` and compare correctly with plain lexical `<=`/`>` (no `Date` parsing needed). The guard compares the tapped date against the *request-time* server UTC date, not the handler's local clock — and because the grid only ever renders dates ≤ its own SSR render-time "today," a legitimate tap can never exceed a later request-time "today." The guard only blocks dates the rendered grid could never have produced (forged/buggy direct API calls), regardless of what timezone the handler is physically in.
- **`error.code === "23505"` must gate the INSERT→DELETE fallback**, not "any insert error." Falling through to DELETE on every error type would turn a real failure (RLS violation, malformed FK) into a silent, incorrect "untick."
- **Scroll-to-today must re-run on window change, not just on mount.** Switching from 30→7 days changes the table's `scrollWidth`; the `useEffect` driving `scrollLeft = scrollWidth` needs `[selectedWindow]` in its dependency array, or the grid stays scrolled to a stale offset after a window switch.
- **Data fetching and highlight calculation are always fixed at 30 days, decoupled from the 7/14/30 selector.** The selector is a pure display/column-visibility concern, never a data-scoping concern: SSR always fetches and the highlight algorithm always runs over the full 30-day tick history, regardless of which window is currently selected. This also resolves plan-review F1 (Phase 3 previously fetched only the requested window, which would have produced wrong highlights and an incomplete `useMemo` chain on switch-up).
- **The selected window lives in `localStorage` (key `trainingGridWindow`), not a `?window=` URL param.** SSR has no access to `localStorage`, so the server always renders the full 30 date columns; the client reads the stored value after mount (mirroring `useMounted`'s hydration-guard timing) and slices the rendered columns down to 7/14/30 from there. There is no server-side window resolution and no query-param parsing anywhere in this feature.
- **Date column headers are always derived from date functions, never from the DB.** `generateDateRange(30, today)` produces all 30 column dates independent of which dates actually have `training_logs` rows — a day with zero ticks still gets its own column with empty checkboxes. Headers display `formatHeaderDate(date)` (`DD.MM`, e.g. `"21.05"`), not the raw ISO string.

## Phase 1: Pure Functions & Test Infrastructure

### Overview

Implement the highlight algorithm and date helpers as pure, dependency-free functions, and add a minimal Vitest suite scoped to the highlight algorithm — the one piece of business logic where a silent regression would directly break the product's core value proposition.

### Changes Required:

#### 1. Test infrastructure

**Files**: `package.json`, `vitest.config.ts` (new, repo root)

**Intent**: Add a test runner narrowly scoped to this change's one critical function, per the explicit exception to "no test suite unless asked."

**Contract**: `devDependencies.vitest` (latest stable) added; `scripts.test` = `"vitest run"`. `vitest.config.ts` uses plain `defineConfig` from `"vitest/config"` with `test: { environment: "node" }` — no Astro/Vite integration (see Critical Implementation Details).

#### 2. Highlight algorithm

**File**: `src/lib/highlight.ts` (new)

**Intent**: Implement the authoritative tiered green/red classification (FR-007 plus the 2026-06-17/18 clarifications) as a pure function with no imports from outside `src/lib`.

**Contract**: `export function computeHighlights(elements: TrainingElement[], tickCounts: Map<string, number>): Map<string, "green" | "red" | null>`. Copy the implementation verbatim from `research.md` Section 9 — three tiers: n≤3 → no highlights; 4≤n≤6 → single-winner-only (green/red each require a unique, non-tied extreme value, no expansion); n≥7 → full top-3/bottom-3 with rank-1 tie expansion and post-build ≥half suppression per colour independently. `tickCounts` must include every element (defaulting to 0) — the caller's responsibility, documented in the function's JSDoc.

#### 3. Highlight algorithm tests

**File**: `src/lib/highlight.test.ts` (new)

**Intent**: Lock in the tiered algorithm against regression, since this is the one function granted a testing exception.

**Contract**: One `it()` per row of `research.md`'s 9-row edge-case trace table, plus: n=0 → empty map; n=7 with no rank-1 tie → green/red sets of size 3 are NOT suppressed (the documented minimum-n boundary for Tier 3 to surface a result). Assert via `Object.fromEntries(result)` for readable failure diffs.

#### 4. Date helpers

**File**: `src/lib/dates.ts` (new)

**Intent**: SSR-deterministic, testable date-window math shared by the Astro page (Phase 3) and the API route's date guard (Phase 2).

**Contract**:
- `getTrainingWindow(windowDays: number, today?: Date): { startDate: string; endDate: string }` — rolling window ending at `today` (inclusive), both bounds as `YYYY-MM-DD`.
- `generateDateRange(windowDays: number, today: string): string[]` — ascending `[oldest, ..., today]`.
- `isFutureUtcDate(dateStr: string, today?: Date): boolean` — lexical string comparison, no `Date` parsing (see Critical Implementation Details).
- `formatHeaderDate(dateStr: string): string` — formats a `YYYY-MM-DD` string as `DD.MM` (e.g. `"2026-05-21"` → `"21.05"`) for column headers; pure string slicing, no `Date` parsing.

No dedicated test file for this module — the testing exception is scoped to `computeHighlights` only; verify manually (see Manual Verification below).

#### 5. CI wiring

**File**: `.github/workflows/ci.yml` (modify)

**Intent**: Per plan-review F2 — the testing exception exists because a silent `computeHighlights` regression would break the product's core value proposition; that justification is void if the new suite never runs in CI. Add a `npm run test` step alongside the existing lint/build steps so a regression cannot merge with green CI.

**Contract**: Add `- run: npm run test` to the `ci` job, after the existing `npm run lint` step and before `npm run build` (mirrors the two existing steps' shape — no new env vars or secrets needed, since the `computeHighlights`/`dates.ts` tests have no Supabase dependency).

### Success Criteria:

#### Automated Verification:

- `npm install` completes cleanly with `vitest` added
- `npm run test` passes — every `highlight.test.ts` case green
- `npm run lint` passes
- `npm run build` succeeds
- CI runs `npm run test` as a workflow step (verify the `.github/workflows/ci.yml` diff)

#### Manual Verification:

- Manually cross-check 2-3 `computeHighlights` outputs against `research.md`'s trace table by eye, independent of the unit tests
- Manually verify `generateDateRange(7, "2026-06-19")` returns the 7 correct oldest→newest UTC dates ending at `"2026-06-19"`, and `getTrainingWindow(7, new Date("2026-06-19"))` returns matching `startDate`/`endDate`

---

## Phase 2: Service Layer & Toggle API

### Overview

Add the read path (`getTrainingLogs`) and the write path (`toggleTrainingLog` + its API route) for tick data, following the existing service/route conventions exactly.

### Changes Required:

#### 1. Training logs service

**File**: `src/lib/services/training-logs.ts` (new)

**Intent**: Minimal-payload read of tick history for a window, plus an idempotent toggle that the API route delegates to — mirrors `training-elements.ts`'s pattern of keeping business logic out of the route handler.

**Contract**:
- `getTrainingLogs(supabase, dogId, startDate, endDate): Promise<Pick<TrainingLog, "element_id" | "trained_on">[]>` — `.eq("dog_id", dogId).gte("trained_on", startDate).lte("trained_on", endDate)`, ordered by `trained_on` ASC, `[]` on no rows, throws on error.
- `toggleTrainingLog(supabase, dogId, elementId, accountId, trainedOn): Promise<"ticked" | "unticked">` — attempts INSERT with `{ element_id, dog_id, account_id, trained_on }`. On success, return `"ticked"`. On error, check `error.code === "23505"` (the `training_logs_element_id_trained_on_unique` violation) — only then DELETE the matching row (`.eq("element_id", elementId).eq("dog_id", dogId).eq("trained_on", trainedOn)`) and return `"unticked"`. Any other error code is rethrown (see Critical Implementation Details).

#### 2. Toggle API route

**File**: `src/pages/api/dog/[id]/logs/index.ts` (new)

**Intent**: Thin route wiring the toggle service to the standard 401 → ownership → validation → error-shape conventions used by every `/api/dog/[id]/...` route.

**Contract**:
- zod: `elementId: z.uuid()`; `trainedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isFutureUtcDate(v), "Cannot log a future date")`.
- `context.locals.user` null → 401. `context.params.id` not a valid UUID, or `getDogById` returns null → 404. zod failure → 400 with the first issue message.
- `account_id` passed to `toggleTrainingLog` is always `context.locals.user.id` — never from the request body.
- Success: `Response.json({ success: true, state })`. `export const prerender = false`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Two consecutive identical POSTs to `/api/dog/[id]/logs` return `state: "ticked"` then `state: "unticked"`
- POST with a `trainedOn` one day ahead of the current UTC date returns 400
- POST without a session cookie returns 401
- POST against a `dogId` not owned by the caller (or nonexistent) returns 404
- Direct DB inspection: the `training_logs` row appears/disappears exactly once per toggle, matching the API's reported state

---

## Phase 3: Astro Page Shell & Static Grid

### Overview

Ship a real, viewable, read-only grid page: correct dates, correct highlights, correct empty/error states — before any client interactivity exists.

### Changes Required:

#### 1. Grid page

**File**: `src/pages/dogs/[id]/grid.astro` (new)

**Intent**: SSR entry point — resolves the requested window from the URL, fetches elements and logs in parallel, and renders the grid component. Structurally mirrors `elements.astro` (back-link, heading, `AuthLayout`).

**Contract**:
- The page always fetches and renders the full, fixed `30`-day window. There is no `?window=` URL param and no per-request window resolution — the 7/14/30 selector is a client-only display concern added in Phase 4.
- `getTrainingWindow(30)` for the query bounds; `generateDateRange(30, endDate)` for the rendered date columns — both always called with the constant `30`, never with a request-derived value.
- When `supabase` is null: skip both service calls and pass `serviceUnavailable: true` with empty `elements`/`initialTicks` — per this change's explicit decision, distinct from the silent-empty-state precedent used elsewhere in the codebase.
- Otherwise: `Promise.all([getTrainingElements(...), getTrainingLogs(...)])`.
- Renders `<TrainingGrid dogId={selectedDog.id} elements={elements} initialTicks={initialTicks} dates={dates} today={endDate} serviceUnavailable={serviceUnavailable} />` — no `windowDays` prop (the island resolves its own display window from `localStorage` in Phase 4); no `client:load` yet (added in Phase 4).

#### 2. Grid component (static version)

**File**: `src/components/training-grid/TrainingGrid.tsx` (new)

**Intent**: First version of the grid — server-rendered table markup, no interactivity. Establishes the sticky-table structure and the three render states (error/empty/populated) that Phase 4 builds interactivity on top of.

**Contract**: Per plan-review F3, `grid.astro` renders `<TrainingGrid>` with no `client:` directive at all in this phase — every other React component reference in the codebase carries `client:load` or `client:only="react"`, so this is intentionally a first-of-its-kind, temporary state in this codebase, resolved on schedule when Phase 4 adds `client:load`.
- Computes `tickCounts` (every element defaulted to 0, then incremented from the full 30 days of `initialTicks`) and `highlights` via `computeHighlights` — plain consts (no hooks needed without interactivity). This computation always covers the full 30-day fetch and is never re-scoped to a narrower window; Phase 4 must preserve this invariant when it adds the window selector (see Critical Implementation Details).
- Header row: the top-left corner `<th>` (above the sticky name column) renders empty — no label, no `scope` attribute. Every date column's `<th scope="col">` renders `formatHeaderDate(date)` (e.g. `"21.05"`) instead of the raw ISO date. Dates come from `generateDateRange`'s output, never from the DB, so a date with zero ticks still renders its own column with empty checkboxes.
- `<table role="grid" aria-label="Training log for {dogName}">` inside a `<div class="overflow-x-auto [overflow-y:clip]">` wrapper; `table-fixed`; sticky header (`sticky top-0 z-20`), sticky name column (`sticky left-0 z-20`), sticky corner cell (`z-30`); `min-w-[2.75rem]` day columns, `min-w-[9rem]` name column; row background `bg-emerald-500/15` / `bg-rose-500/15` per highlight.
- Tick cells render as plain `<span aria-hidden="true">` checkmark indicators (visual only — `<input>`/`<label>` arrive with interactivity in Phase 4).
- `serviceUnavailable`: same table shell with `animate-pulse bg-white/5` placeholder cells and an overlaid "Something went wrong, please try later" message.
- Zero elements: "No training elements yet" with a link to `/dogs/[id]/elements`, per research Q3.
- Elements present but zero ticks in window: full grid renders, every row unhighlighted — no special-case empty state.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- `/dogs/[id]/grid` shows a 30-day grid ending today, with correct highlight colors for a dog with ≥7 elements and varied tick counts
- SSR always renders the full 30 date columns regardless of any URL — there is no `?window=` param to parse
- Zero training elements shows the "No training elements yet" empty state
- Elements present, zero ticks in window shows the full grid, unhighlighted
- Temporarily unsetting the Supabase env vars shows the skeleton + "Something went wrong, please try later" overlay, not a silent empty grid
- DevTools mobile emulation: grid scrolls horizontally without the sticky header or sticky name column breaking

---

## Phase 4: Interactive React Island

### Overview

Layer optimistic tap-to-toggle, the window selector, and scroll-to-today onto the Phase 3 markup, turning it into the full island.

### Changes Required:

#### 1. Grid island (interactive)

**File**: `src/components/training-grid/TrainingGrid.tsx` (modify)

**Intent**: Add the `useMounted` SSR-guard, the window selector, and the scroll-to-today effect; wire in the new sub-components.

**Contract**:
- `!mounted` branch renders the exact static markup from Phase 3 inline (no separate file — mirrors `TrainingElementsManager.tsx:98-110`'s pattern), including the `serviceUnavailable` and empty-element paths, which stay non-interactive even after mount.
- `selectedWindow` state defaults to `30` for the SSR-rendered first paint, then is read from `localStorage` (key `trainingGridWindow`) in a `useEffect` on mount and corrected if a stored value exists — `localStorage` is unavailable during SSR, so it is only ever read post-mount (consistent with `useMounted`'s hydration-guard timing). Window-selector buttons (`Button` `variant="default"` when active, `variant="outline"` otherwise) update `selectedWindow` and call `localStorage.setItem("trainingGridWindow", String(n))` synchronously in the same handler — no navigation, no URL change, no API call.
- The 7/14/30 selector controls **only which date columns are visible**. It never re-fetches and never changes the highlight set. `tickCounts` and `highlights` are computed once via `computeHighlights` from the full 30-day `allTicks` (prop), exactly as in Phase 3, and stay constant across window switches.
- `useMemo` chain: `allTicks` (prop) → `tickCounts` (defaulted to 0 per element, always over the full 30 days) → `highlights` (via `computeHighlights`, also always over the full 30 days) — independent of `selectedWindow`. Separately, `visibleDates = useMemo(() => dates.slice(-selectedWindow), [dates, selectedWindow])` slices the full 30-day `dates` prop down to the last `selectedWindow` entries for column rendering only.
- Scroll-to-today: a ref on the scroll wrapper; `useEffect(() => { ref.current.scrollLeft = ref.current.scrollWidth }, [selectedWindow])` — re-runs on window change, not just on mount (see Critical Implementation Details).
- `grid.astro` updated to add `client:load` to `<TrainingGrid>`.

#### 2. Row component

**File**: `src/components/training-grid/TrainingGridRow.tsx` (new)

**Intent**: Extract one element row out of `TrainingGrid` for readability — sticky name cell with the highlight background, one `TickCell` per date.

**Contract**: Props `{ element: TrainingElement; dates: string[]; highlight: "green" | "red" | null; ticks: Set<string>; onToggle: (elementId: string, date: string, next: boolean) => Promise<void> }`. Sticky `<td>` uses `cn()` for the `bg-emerald-500/15`/`bg-rose-500/15` conditional, following `ElementRow.tsx`'s existing `cn()` pattern.

#### 3. Tick cell

**File**: `src/components/training-grid/TickCell.tsx` (new)

**Intent**: Single optimistic tick cell exactly as designed in `research.md` Section 4.

**Contract**: `<label>` wrapping a `sr-only` `<input type="checkbox">`; `useOptimistic` for the immediate visual flip; an `AbortController` ref to cancel a superseded rapid tap; `aria-label={`${elementName} on ${date}`}`; calls `onToggle` from the parent, which is backed by `useTrainingGrid`.

#### 4. Toggle hook

**File**: `src/components/hooks/useTrainingGrid.ts` (new)

**Intent**: One shared implementation of the debounced, 401-aware fetch call, instead of duplicating it per cell.

**Contract**: `useTrainingGrid(dogId: string)` returns `toggleTick(elementId: string, date: string, next: boolean): Promise<void>` — debounces per `elementId+date` key (300ms), `POST /api/dog/[id]/logs`, `res.status === 401 → window.location.href = "/auth/signin"`, throws on non-OK so the caller's `useOptimistic` reverts and the cell shows a "Could not save — tap to retry" toast.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` succeeds
- `npm run test` still passes (Phase 1 suite unaffected)

#### Manual Verification:

- Tapping a cell ticks/unticks it immediately and the change persists after a page reload
- Rapid double/triple tap on the same cell ends in the correct final state, no flicker or revert-then-reapply flash
- Switching window (7/14/30) updates only the visible columns instantly with zero network requests (verify in DevTools Network tab) and no full-page reload or URL change; the highlighted (green/red) rows do not change
- Reloading the page preserves the previously selected window from `localStorage` (no URL param involved)
- Switching window resets the scroll position to today's column (not stuck at a stale offset)
- DevTools offline mode: tapping a cell shows the optimistic tick, then reverts with a "Could not save — tap to retry" toast
- Clearing session cookies and tapping a cell redirects to `/auth/signin`, not a confusing toast
- iOS Safari (device or simulator): sticky header and sticky column both work simultaneously while scrolling, no jitter, no transparent-sticky bleed-through

---

## Phase 5: Dashboard Wiring & Accessibility Polish

### Overview

Surface the grid from the dashboard and do a focused accessibility pass now that every interactive piece exists.

### Changes Required:

#### 1. Dashboard tile

**File**: `src/pages/dogs/[id]/dashboard.astro` (modify)

**Intent**: Make the grid reachable from the dog's dashboard, mirroring the existing "Manage elements" tile.

**Contract**: New tile alongside (not replacing) "Manage elements" — element-count summary text plus a "View training grid" link to `/dogs/${selectedDog.id}/grid`.

#### 2. Accessibility verification pass

**Files**: `src/components/training-grid/TrainingGrid.tsx`, `TrainingGridRow.tsx`, `TickCell.tsx` (verify/adjust, no new files)

**Intent**: Confirm the ARIA semantics designed in research.md Section 3 hold up once all interactive pieces are wired together.

**Contract**: `<th scope="col">` on date headers (text content `formatHeaderDate(date)`, e.g. `"21.05"`); the top-left corner `<th>` is empty with no `scope` (it doesn't head a column or row); `<th scope="row">` with `role="rowheader"` on element-name cells; every tick cell's computed `aria-label` reads naturally ("Heelwork, Jun 17, unchecked").

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (the project's `eslint-plugin-jsx-a11y` rules flag missing labels/roles)
- `npm run build` succeeds

#### Manual Verification:

- Dashboard tile link navigates to the grid and shows an accurate element count
- Keyboard-only navigation: Tab reaches each tick cell in row-then-column order, Space toggles, focus ring is visible
- Screen reader spot-check (VoiceOver or NVDA): row headers, column headers, and cell state announce correctly
- Touch target audit on a real phone: every tick cell is comfortably tappable (≥44×44px), no accidental adjacent-cell taps
- Full regression pass: adding an element makes it appear in the grid; deleting one removes it and its tick history; renaming one updates its grid label

---

## Testing Strategy

### Unit Tests:

- `computeHighlights` — all 9 trace-table cases from `research.md` Section 9, plus n=0 and the n=7 no-tie boundary case (Phase 1 only; no other module gets dedicated unit tests per the scoped testing exception).

### Integration Tests:

- None — no integration test runner exists in this project; covered by the Manual Verification steps per phase instead.

### Manual Testing Steps:

1. Seed a dog with ≥7 training elements and a varied 30-day tick history; visit `/dogs/[id]/grid` and confirm the green/red rows match a hand-computed expectation.
2. Tap several cells across different rows/columns, reload, and confirm every tick persisted.
3. Switch windows (7 → 14 → 30) and confirm only the visible date columns change — the green/red highlighted rows must stay identical across all three windows, since highlights are always computed from the full 30-day history regardless of the selector.
4. Test on an actual phone in field-like conditions (outdoors, gloved or cold fingers if possible) to validate the touch-target sizing claim, not just DevTools emulation.

## Performance Considerations

All tick history for the fixed 30-day window is fetched once at SSR; window switching only slices the rendered date columns client-side — it never re-filters tick data or recomputes highlights, and triggers no additional network round trips. At realistic data volumes (~10 elements × 30 days ≈ 300 rows max), this is negligible; no pagination or caching layer is needed for this feature.

## Migration Notes

Not applicable — no schema change in this plan.

## References

- Research: `context/changes/training-grid/research.md`
- Service layer pattern: `src/lib/services/training-elements.ts`
- API route pattern: `src/pages/api/dog/[id]/elements/index.ts`
- SSR↔island swap precedent: `src/components/training-elements/TrainingElementsManager.tsx:98-110`
- SSR hydration guard: `src/components/hooks/useMounted.ts`
- Existing migration this feature builds on: `supabase/migrations/20260530000003_create_training_logs.sql`

## Implementation Adaptations

The two deviations below were found and applied during Phase 4 manual testing, after the Phase blocks above were already written. They're recorded here rather than edited into "Critical Implementation Details" or the Phase 4 "Changes Required" above, so those sections stay an accurate historical record of what was originally planned.

### Window persistence: `localStorage` → cookie

**Originally planned** (see "Critical Implementation Details"): the 7/14/30 window selector persists to `localStorage`, read client-only after mount; SSR always renders the full 30-day grid regardless of the stored preference, with no `?window=` param and no per-request window resolution.

**What changed**: persistence moved to a cookie (`trainingGridWindow`, constants centralized in the new `src/components/training-grid/window-options.ts`), read server-side in `grid.astro` via `Astro.cookies.get(...)` and passed to `<TrainingGrid>` as a new `initialWindow` prop.

**Why**: the `localStorage` approach caused a real, visible hydration flicker on every page reload — the window-selector buttons popped in/out, and the grid briefly rendered all 30 columns before resizing down to the stored width, because SSR had no way to know the client's preference ahead of hydration. This surfaced during manual testing as a genuine UX defect, not a cosmetic nit. A cookie is readable by both SSR and client, so the correct column count and button states render on the very first paint — no flash, no resize.

**Impact**: `grid.astro` resolves `initialWindow` before rendering. `TrainingGrid.tsx` seeds `selectedWindow` from that prop (a plain `useState`) instead of the previous `useSyncExternalStore`-wrapped `localStorage` read; switching windows now calls `setWindowCookie()` (a module-level helper wrapping `document.cookie =`, needed to satisfy the React Compiler's immutability lint rule) instead of `localStorage.setItem`. The window-selector buttons and column count are no longer behind the `!mounted` swap at all — only the tick cells themselves (and the buttons' `disabled` state) still depend on `useMounted`, since tapping genuinely needs JS. The fixed-30-day data-fetch/highlight-calculation invariant is unaffected — only the persistence mechanism and rendering scope of the display-only selector changed.

### Highlight recompute timing fix

**Originally planned** (Phase 4, item 1's "Contract"): `tickCounts`/`highlights` are computed via `useMemo` from the `ticks` state, which `handleToggle` updates optimistically before awaiting the toggle API call, reverting on failure.

**What changed**: manual testing showed the optimistic highlight recompute lagged behind the tap — the row only recolored once the network save succeeded, not immediately on tap as the Contract implied. Root cause: `handleToggle`'s pre-await `setTicks` call ran inside `TickCell`'s `startTransition`, which defers any non-`useOptimistic` state update made in its dynamic extent to a low-priority transition update. `useOptimistic` is specially exempt from that deferral (hence the checkbox itself still flipped instantly) — the plain `ticks` state wasn't.

**Fix**: extracted `applyOptimisticTick` as its own function. `TickCell.handleChange` now calls it synchronously *before* `startTransition` starts (an urgent, non-transition update), instead of `handleToggle` applying it internally. `handleToggle` now only handles the network persist + revert-on-failure, and the revert call runs after the transition's promise has already settled, where the deferral doesn't apply — so it needed no special handling. A new `onOptimisticTick` prop threads this through `TrainingGridRow` → `TickCell`.

**Impact**: `src/components/training-grid/TrainingGrid.tsx`, `TrainingGridRow.tsx`, `TickCell.tsx`. No change to the underlying contract — `tickCounts`/`highlights` still always cover the full 30-day history, independent of the window selector — only *when* a tap's optimistic tick triggers the recompute changed.

### Missing `initial-scale=1` collapses the page on mobile

**Originally planned**: not addressed by any phase — `src/layouts/Layout.astro`'s `<meta name="viewport">` and global `html`/`body` styles predate this change and were out of scope for the plan's "Changes Required" sections.

**What changed**: manual mobile testing of Phase 4 (DevTools device emulation, real device characteristics) surfaced a regression of the Phase 3 manual check 3.8 ("mobile emulation: horizontal scroll works without breaking sticky header/column") — the entire page rendered shrunk into roughly the top-left 10–25% of the viewport, with the rest of the screen blank white, not just the grid table misbehaving.

**Root cause**: confirmed via headless-Chrome CDP instrumentation (`Emulation.setDeviceMetricsOverride` + live diagnostics) comparing the page before/after a fix. The viewport meta tag was `width=device-width` with no `initial-scale`. The grid's table is, by design, wider than a phone screen (30 day columns × `min-w-[3.5rem]` + the sticky name column ≈ 1650px), and that overflow is intentionally scrollable within the `overflow-x-auto` wrapper — but the *page's own* layout viewport still grows to accommodate it (`window.innerWidth` measured 1560px against a 390px device). Without an explicit `initial-scale=1`, the browser's mobile-viewport heuristic responds to that wider layout viewport by computing a shrink-to-fit zoom (`visualViewport.scale` measured 0.25) instead of leaving the page at 1:1 scale with the table scrolling internally — i.e. it zooms the *entire page* out to cram the 1560px-wide layout into the 390px screen, leaving most of the screen as blank space beyond the now-tiny rendered page. This reproduces exactly with the scroll-to-today effect's `scrollLeft = scrollWidth` assignment (Phase 4, item 1) in play — confirmed by reverting the fix and re-screenshotting the same seeded grid page, which reproduced the reported symptom pixel-for-pixel (content confined to a small top-left box, rest of the screen white).

**Fix**: `src/layouts/Layout.astro` — `<meta name="viewport" content="width=device-width, initial-scale=1" />` (was missing `initial-scale=1`); added `overflow-x: hidden` to the existing `html, body` style block as a defensive safety net so the page itself can never pick up a horizontal scrollbar/rubber-band from a similar overflow in the future (the grid's own internal `overflow-x-auto` wrapper remains the only intended horizontal scroller). Verified via CDP: `visualViewport.scale` goes from `0.25` (broken) to `1` (fixed) on the same seeded grid page, both before and after the scroll-to-today effect runs.

**Impact**: `src/layouts/Layout.astro` only — a single shared layout used by every page in the app (`AuthLayout.astro` → `Layout.astro`), not scoped to the training grid. This is a pre-existing latent bug the grid's unusually wide table was the first feature to surface; the fix benefits every page, not just `/dogs/[id]/grid`.

### `sr-only` tick checkbox triggers a second mobile white-page bug, distinct from the viewport fix above

**Originally planned** (Phase 4, item 3's "Contract"): `TickCell`'s `<input type="checkbox">` is visually hidden via Tailwind's `sr-only` utility (clips the element to 1×1px) inside the `<label>` wrapping the visible custom checkbox `<span>`.

**What changed**: after the `initial-scale=1` fix above, the user reported the white-page symptom *still* reproduced, but only on tapping a tick cell (not on initial load or window switching) — reload or switching back to desktop view restored the grid. This is a second, distinct bug surfaced by the same mobile testing pass, not a failure of the viewport fix.

**Root cause (hypothesis, not yet user-confirmed on-device)**: `sr-only` clips the checkbox `<input>` to a 1×1px bounding box. It is the only focusable, touch-tapped element in this entire feature hidden that way, and it sits inside the grid's `overflow-x-auto` horizontally-scrollable wrapper. Mobile WebKit/Blink has a known quirk where focusing a near-zero-size element inside a scrollable ancestor triggers a "scroll/zoom the focused element into view" heuristic that can compute an extreme zoom factor — consistent with the reported symptom being tap-triggered, scoped to the scroll wrapper, and cleared by reload (which drops focus).

**Fix**: `src/components/training-grid/TickCell.tsx` — replaced the `sr-only` clip technique with a full-size invisible overlay: the `<input>` is now `absolute inset-0 size-full opacity-0` inside a `relative` `<label>`, matching the visible `size-11` (44×44px) touch target's bounding box instead of collapsing to 1px. Still fully hidden visually (`opacity-0`) and still the real focus/tap target for accessibility — only the hiding mechanism changed.

**Impact**: `src/components/training-grid/TickCell.tsx` only. Not yet confirmed fixed on the user's actual mobile device as of this writing — pending retest before Phase 4's commit ritual proceeds.

### Undocumented new file: `sticky-colors.ts`

**What changed**: Phase 4's "Changes Required" never named `src/components/training-grid/sticky-colors.ts` as a new file, but it exists and is imported by both `TrainingGrid.tsx` and `TrainingGridRow.tsx`. Flagged by `/10x-impl-review`'s Phase 4 pass (F4) as a documentation gap, not a functional issue.

**Why it exists**: sticky cells (corner, header row, name column) must render fully opaque — a translucent background would let the date columns scrolling underneath show through (the iOS Safari bleed-through requirement from research.md). `STICKY_BG`/`TODAY_HEADER_BG` centralize the hand-picked opaque color approximations so `TrainingGrid.tsx` and `TrainingGridRow.tsx` don't duplicate them or form a circular import over a single shared constant.

**Impact**: `src/components/training-grid/sticky-colors.ts` only — no behavior change, this note just closes the documentation gap retroactively.

### Destructive button focus ring is invisible (shared `Button` component, not a grid file)

**Originally planned**: not addressed by any phase — Phase 5's "Accessibility verification pass" scoped its file list to `TrainingGrid.tsx`, `TrainingGridRow.tsx`, `TickCell.tsx` only.

**What changed**: manual testing of 5.4 (keyboard-only navigation, visible focus ring) on the dashboard found the "Delete dog" button's (`variant="destructive"`) focus-visible state nearly invisible — not a grid defect, but a pre-existing contrast bug in the shared `Button` component surfaced by this phase's keyboard-nav pass, the same way the Phase 4 viewport-meta bug was a `Layout.astro` defect surfaced by the grid's unusually wide table.

**Root cause**: the `destructive` variant's focus-visible ring was `ring-destructive/20` (`dark:ring-destructive/40`) — a translucent *red* ring drawn over the button's own solid red (`bg-destructive`) background. Same-hue ring-on-fill at 20–40% opacity produces almost no contrast, regardless of light/dark mode. No other variant has this problem because none of them use the same hue for both fill and ring.

**Fix**: `src/components/ui/button.tsx` — the `destructive` variant's focus-visible styles changed from `focus-visible:ring-destructive/20 ... dark:focus-visible:ring-destructive/40` to `focus-visible:border-2 focus-visible:border-white/90 focus-visible:bg-destructive/80 focus-visible:ring-white/80 ... dark:focus-visible:bg-destructive/50`: an explicit white focus border (the variant has no border at all otherwise), a white ring instead of a same-hue red one, and a darkened fill on focus (lower alpha lets the dark page backdrop show through).

**Impact**: `src/components/ui/button.tsx` only — shared by every `variant="destructive"` button in the app (currently just "Delete dog"), not scoped to the training grid. No change to any grid file.

### In-flight-request race window in `useTrainingGrid.ts` (accepted as risk)

**What changed**: nothing in code — this documents a known, narrow race surfaced by `/10x-impl-review`'s full-plan pass (F1), distinct from the debounce-timer-unmount race already fixed in Phase 4.

**The race**: the pending-toggle map entry for a key (`pendingRef`) is deleted synchronously the instant the debounce timer fires (`useTrainingGrid.ts:57`), before the `await fetch(...)` that follows begins. If the user taps the same cell again while that fetch is still in flight (round-trip > 300ms), the new tap's baseline is computed as `!next` — assuming the in-flight request has already resolved against the prior server state, when it hasn't. A second POST can fire against a cell whose true server state is still being mutated by the first one.

**Why accepted as risk**: the toggle endpoint flips whatever the row currently holds, so it always converges to *some* valid boolean — no data corruption, no wrong final DB state for any single tap's intent. The failure mode is a displayed/optimistic state that can desync from the true DB state until the next reload, and it needs round-trip latency > 300ms *and* a second tap landing in that exact window to trigger — narrow in practice. Closing it fully (tracking "request in flight" per key, not just "timer pending") would be a non-trivial restructuring of this hook's state shape, and there's no test harness for this hook to verify a fix against (only `highlight.ts` has the testing exception in this plan).

**Impact**: `src/components/hooks/useTrainingGrid.ts` only. No code change — documented as an accepted risk for future revisit if real-world latency/usage data shows this matters in practice.

### Undocumented function: `elementBelongsToDog` ownership check

**What changed**: Phase 2's "Changes Required" never named `elementBelongsToDog` (`src/lib/services/training-elements.ts`) as a planned addition, but it exists and is called from `src/pages/api/dog/[id]/logs/index.ts`, enforced before `toggleTrainingLog`, returning 404 on a cross-dog `elementId` before any write happens. Flagged by `/10x-impl-review`'s full-plan pass (F2) as a documentation gap, not a functional issue.

**Why it exists**: app-level defense-in-depth ownership check alongside the RLS `WITH CHECK` clause on `training_logs_insert_authenticated` (the primary boundary, already requires `training_elements.dog_id = dog_id`) — this is the belt-and-suspenders check that rejects a forged/mismatched `elementId` with a clean 404 before it ever reaches the database.

**Impact**: `src/lib/services/training-elements.ts` and `src/pages/api/dog/[id]/logs/index.ts` only — no behavior change, this note just closes the documentation gap retroactively.

### Undocumented new file: `.gitattributes`

**Originally planned**: not addressed by any phase — none of the five phases' "Changes Required" sections name a `.gitattributes` file.

**What changed**: a repo-root `.gitattributes` (`* text=auto eol=lf`) was added to normalize line endings to LF regardless of the checkout platform's `autocrlf` setting. Same shape as the `Layout.astro` viewport-meta and `button.tsx` focus-ring adaptations above — a pre-existing repo-level issue surfaced (and fixed) by this change's work, not a training-grid-specific decision.

**Why**: without it, a Windows checkout with `core.autocrlf=true` materializes CRLF on disk for every text file, which conflicts with Prettier's default LF expectation and floods `npm run lint` with unrelated errors.

**Impact**: `.gitattributes` only — repo-wide, not scoped to the training grid, same as the other infra-fix entries in this section.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pure Functions & Test Infrastructure

#### Automated

- [x] 1.1 `npm install` completes cleanly with `vitest` added — def8601
- [x] 1.2 `npm run test` passes — every `highlight.test.ts` case green — def8601
- [x] 1.3 `npm run lint` passes — def8601
- [x] 1.4 `npm run build` succeeds — def8601
- [x] 1.5 CI runs `npm run test` as a workflow step — def8601

#### Manual

- [x] 1.6 Manually cross-check 2-3 `computeHighlights` outputs against `research.md`'s trace table — def8601
- [x] 1.7 Manually verify `generateDateRange`/`getTrainingWindow` produce correct UTC date arrays/bounds — def8601

### Phase 2: Service Layer & Toggle API

#### Automated

- [x] 2.1 `npm run lint` passes — 47d601d
- [x] 2.2 `npm run build` succeeds — 47d601d

#### Manual

- [x] 2.3 Two consecutive POSTs toggle ticked → unticked correctly — 47d601d
- [x] 2.4 POST with a future `trainedOn` returns 400 — 47d601d
- [x] 2.5 POST without a session cookie returns 401 — 47d601d
- [x] 2.6 POST against an unowned/nonexistent `dogId` returns 404 — 47d601d
- [x] 2.7 Direct DB inspection confirms the row appears/disappears exactly once per toggle — 47d601d

### Phase 3: Astro Page Shell & Static Grid

#### Automated

- [x] 3.1 `npm run lint` passes
- [x] 3.2 `npm run build` succeeds

#### Manual

- [x] 3.3 Default SSR render shows a correct 30-day grid with correct highlights
- [x] 3.4 SSR always renders the full 30 date columns regardless of any URL — no `?window=` param exists
- [x] 3.5 Zero-elements empty state renders correctly
- [x] 3.6 Elements-with-zero-ticks renders the full unhighlighted grid
- [x] 3.7 Supabase misconfiguration shows the skeleton + error overlay, not a silent empty grid
- [x] 3.8 Mobile emulation: horizontal scroll works without breaking sticky header/column

### Phase 4: Interactive React Island

#### Automated

- [x] 4.1 `npm run lint` passes — 25d0891
- [x] 4.2 `npm run build` succeeds — 25d0891
- [x] 4.3 `npm run test` still passes — 25d0891

#### Manual

- [x] 4.4 Tapping a cell ticks/unticks immediately and persists after reload — 25d0891
- [x] 4.5 Rapid repeated taps end in the correct final state with no flicker — 25d0891
- [x] 4.6 Window switching updates only visible columns instantly with zero network requests; highlighted rows don't change — 25d0891
- [x] 4.7 Reloading the page preserves the selected window from a cookie (was `localStorage` in the original plan text; see Implementation Adaptations) — 25d0891
- [x] 4.8 Window switch resets scroll to today's column — 25d0891
- [x] 4.9 Offline tap shows optimistic tick then reverts with a retry toast — 25d0891
- [x] 4.10 Expired session redirects to `/auth/signin` on tap — 25d0891
- [x] 4.11 iOS Safari: sticky header + sticky column work simultaneously, no jitter/bleed-through (skipped — no Safari access, accepted as risk) — 25d0891

### Phase 5: Dashboard Wiring & Accessibility Polish

#### Automated

- [x] 5.1 `npm run lint` passes — 3de58d5
- [x] 5.2 `npm run build` succeeds — 3de58d5

#### Manual

- [x] 5.3 Dashboard tile links to the grid with an accurate element count — 3de58d5
- [x] 5.4 Keyboard-only navigation reaches and toggles every cell with a visible focus ring — 3de58d5
- [x] 5.5 Screen reader spot-check announces headers and cell state correctly (skipped — accepted as risk) — 3de58d5
- [x] 5.6 Touch target audit on a real phone confirms ≥44×44px tappable cells — 3de58d5
- [x] 5.7 Full regression pass: add/delete/rename element reflects correctly in the grid — 3de58d5
