# Training Board — Invariant Aggregate-Guardian Refactor Implementation Plan

## Overview

Move the highlight classification invariant — the literal Primary Success Criterion ("identify
what to train next in under 10 seconds," `prd.md:38`) — out of a single React component's
`useMemo` and into a real domain aggregate (`TrainingBoard`) that a service, an API route, and the
client all share. Today `computeHighlights()` has exactly one call site in the entire codebase
(`TrainingGrid.tsx:89`); nothing else — no SSR page, no API route, no repository — can ever produce
a highlight independently, and the function's own documented precondition ("`tickCounts` MUST
include ALL elements") is never actually checked. This is a pure refactor: the 3-tier /
tie-expansion / suppression algorithm (which already survived five corrections post-launch, per
`context/archive/2026-06-17-training-grid/research.md`) moves verbatim — no business-rule changes,
no observable UX change for the handler.

## Current State Analysis

- `computeHighlights()` (`src/lib/highlight.ts:50-151`) is a pure function, called only from
  `TrainingGrid.tsx:89` inside a `useMemo([elements, tickCounts])`.
- `grid.astro` fetches `elements` and `initialTicks` via `Promise.all([getTrainingElements,
getTrainingLogs])` (`grid.astro:41-45`) but never imports anything from `highlight.ts` — it hands
  raw, unclassified data straight to the client.
- `buildTickCounts()` (`src/lib/training-grid-helpers.ts:47-55`) always defaults every element to
  `0` before counting, which is the _only_ reason `computeHighlights`'s "all elements present"
  precondition currently holds — nothing enforces it if a different caller ever bypassed
  `buildTickCounts`.
- `buildTicksByElement()` (`src/lib/training-grid-helpers.ts:8-17`) silently drops any tick whose
  `element_id` isn't in the current `elements` list (`.get(...)?.add(...)`), asserted as correct by
  `tests/unit/training-grid.test.ts:59-65` ("a tick for an unknown element ID is silently
  ignored"). This is a **different function** from the one this refactor changes — see Key
  Discoveries.
- `tests/unit/highlight.test.ts` holds 17 trace-table cases against `computeHighlights` (not 9 —
  correcting `context/domain/02-invariant-aggregate-refactor.md`'s count).
- No non-UI consumer of a highlight exists anywhere: no service in `src/lib/services/*.ts`, no
  route under `src/pages/api/dog/**`.

## Desired End State

A `TrainingBoard` aggregate is the sole legal way to produce a highlight classification.
`grid.astro` constructs one from the data it already fetches and fails safe (renders the existing
"service unavailable" overlay) if construction ever fails; a new `GET /api/dog/[id]/grid` endpoint
gives any future non-React consumer a real integration point; `TrainingGrid.tsx`'s client-side
recompute-on-tap goes through the same class. `highlight.ts` and `highlight.test.ts` are deleted.
The handler sees **no visible change whatsoever** on the happy path — same grid, same ticks, same
green/red rows, same 7/14/30 window behavior.

**One deliberate, scoped exception:** `grid.astro`'s new try/catch (Phase 5) also now catches
pre-existing `getTrainingElements`/`getTrainingLogs` fetch failures, not just the new
`TrainingBoard.create()` failure mode. Today, with no global error page or middleware try/catch in
this codebase, a Supabase fetch error crashes to an unhandled SSR exception; after this refactor it
degrades to the same "service unavailable" overlay instead. This is judged a strict improvement on
an already-rare failure path, not a regression — but the "byte-for-byte identical" framing below
holds for the algorithm and the happy path, not for this one pre-existing error path.

### Key Discoveries:

- `getTrainingLogs(supabase, dogId, startDate, endDate)` (`src/lib/services/training-logs.ts:12-28`)
  requires an explicit bounded window — it does not fetch "full history." Today's actual behavior
  (`grid.astro:23-24`) is a **fixed 30-day window** via `getTrainingWindow(30)` +
  `generateDateRange`, independent of the 7/14/30 _display_ selector. `loadTrainingBoard()` must
  replicate this exact bound, not the looser "full history" phrasing in
  `02-invariant-aggregate-refactor.md`'s pseudocode — getting this wrong would silently change which
  ticks feed the ranking (crossover #1 in `01-domain-distillation.md`), violating "zero observable
  behavior change."
- `TrainingBoard` (as designed) keeps only a `Map<elementId, count>` — it deliberately discards
  _which_ dates were ticked. It can never be `grid.astro`'s source for `initialTicks` (the client
  needs to know which specific dates are checked, not just a count). `grid.astro` therefore keeps
  its existing `getTrainingElements` + `getTrainingLogs` fetch unchanged and constructs a
  `TrainingBoard` from that same data purely to validate it and obtain highlights — it does not
  call `loadTrainingBoard()` (which re-fetches from scratch and is used only by the new,
  separate-request API route).
- `tests/unit/training-grid.test.ts:59-65` tests `buildTicksByElement`, not `computeHighlights` —
  a different function, with an intentionally different contract (defensive Map-building for
  client render state vs. strict domain-boundary validation on raw persisted data). It is **not**
  touched by this refactor, correcting `02-invariant-aggregate-refactor.md`'s Phase 5 instruction
  to "update" it.
- `vitest.config.ts` only works because every currently-tested module (`highlight.ts`, `dates.ts`,
  `training-grid-helpers.ts`) uses `import type` exclusively for `@/...` imports, which esbuild
  strips — no Vite alias resolution is configured. `src/lib/domain/training-board.ts` must follow
  the same discipline (`import type { TrainingElement } from "@/types"` only) to stay testable.
- On the client, `TrainingBoard.create()` can never actually throw: the `ticks` state it's built
  from is always seeded via `buildTicksByElement` (which already filters to known element IDs) and
  mutated only via `applyTick` on `elementId`s that came from rendered, known rows. No client-side
  try/catch is needed around the client's `useMemo` call.

## What We're NOT Doing

- Not changing the highlight algorithm's business logic (tiers, tie-expansion, suppression) —
  moved verbatim.
- Not changing the window-agnostic ranking semantics (crossover #1) — highlights still rank over
  the fixed 30-day fetch regardless of the 7/14/30 display selector, exactly as today.
- Not reconciling `prd.md`'s draft FR-007 wording with the actual algorithm — a product/doc
  decision, not a code refactor.
- Not touching `context/domain/03-anti-corruption-layer.md` (Supabase `User` type leak) — a
  separate refactor target.
- Not addressing domain invariants #2-4 from `01-domain-distillation.md` (dog-name uniqueness
  race, future-date DB-level constraint, soft-delete/reorder documentation gaps) — explicitly
  out of scope per `02-invariant-aggregate-refactor.md`'s own Step 2 selection.
- Not modifying `tests/unit/training-grid.test.ts` — its existing cases test an unrelated,
  unchanged function.
- Not adding a DB-level constraint for this invariant — it's a cross-row computed classification,
  not a row-level check Postgres can express.
- Not threading a new `initialHighlights` prop down to `TrainingGrid.tsx` — the client's own
  `useMemo` recomputes identically on every render (it must, to react to tick toggles), so a static
  SSR-computed copy would be redundant. `grid.astro`'s own `TrainingBoard` construction exists
  purely to validate/fail-fast, not to hand data to the client.

## Implementation Approach

Test-first, following this repo's existing scoped Vitest exception for this exact module (per
`CLAUDE.md` and precedent in `highlight.test.ts`). Build the aggregate and its test suite first
(Phases 1-2), then the repository and API route that depend on it (Phases 3-4, purely additive —
nothing existing changes yet), then rewire the two existing call sites one at a time (Phases 5-6),
then delete the now-dead code (Phase 7). Each phase after the first two is independently shippable
and safe to pause after.

## Critical Implementation Details

- **Window bound.** `loadTrainingBoard()` must call `getTrainingWindow(30)` /
  `generateDateRange(30, endDate)` exactly as `grid.astro` does today, then pass those bounds to
  `getTrainingLogs`. Do not fetch an unbounded "full history" — see Key Discoveries.
- **Two independent construction sites, one class.** `grid.astro` builds a `TrainingBoard` directly
  from data it already has in memory (no extra fetch); `loadTrainingBoard()` is a separate function
  that fetches its own data from scratch and is called only by the new API route (a genuinely
  separate HTTP request, so a second fetch there is not wasteful duplication). Do not make
  `grid.astro` call `loadTrainingBoard()` — that would double the DB round-trip for the same
  request.
- **`grid.astro` error handling.** Wrap the existing data-fetch block (today gated only by
  `!supabase`) so that _either_ a missing Supabase client _or_ a thrown `TrainingBoard.create()`
  error (including `UnknownElementTickError`) sets the same `serviceUnavailable` flag already
  consumed by `TrainingGrid.tsx`'s `ServiceUnavailableGrid` branch — one unified failure surface,
  not two. `serviceUnavailable` is declared `const` today (`grid.astro:34`); it must become `let`
  since the catch branch reassigns it.
- **API route error handling.** No special-casing needed for `UnknownElementTickError` in
  `GET /api/dog/[id]/grid` — it's a plain `Error` subclass, so the existing generic
  try/catch-to-500 pattern (identical to every other route under `src/pages/api/dog/**`) already
  maps it to a `500` with its message.

## Phase 1: Test-first — `TrainingBoard` test suite

### Overview

Write the test suite against the not-yet-existing `TrainingBoard` class so Phase 2 has a concrete
green target.

### Changes Required:

#### 1. New test file

**File**: `tests/unit/training-board.test.ts`

**Intent**: Port every existing trace-table case from `tests/unit/highlight.test.ts` (all 17,
verbatim expected outputs) as `TrainingBoard.create(elements, ticks).highlights()` assertions,
reusing the same `makeElements` helper pattern. Add new cases covering the aggregate's own
construction contract, which `computeHighlights` never had.

**Contract**: Import `TrainingBoard`, `UnknownElementTickError`, and `TickRecord` from
`@/lib/domain/training-board` (not-yet-existing — this file is written first and fails to compile
until Phase 2). New cases beyond the 17 ported ones:

- `TrainingBoard.create(elements, ticks)` where every tick's `elementId` is in `elements` →
  succeeds, `.highlights()` returns the expected map.
- `TrainingBoard.create(elements, [{ elementId: "unknown", trainedOn: "2026-06-01" }])` → throws
  `UnknownElementTickError`.
- `TrainingBoard.create([], [])` → `.highlights()` returns an empty map (n=0, matches ported case).

### Success Criteria:

#### Automated Verification:

- Test file compiles once Phase 2 lands: `npm run test`

#### Manual Verification:

- N/A (this phase is test-only; nothing runs until Phase 2)

---

## Phase 2: Implement `TrainingBoard`

### Overview

Create the aggregate. The algorithm body is moved verbatim from `computeHighlights` — no
re-litigating the tier/suppression rules.

### Changes Required:

#### 1. New domain module

**File**: `src/lib/domain/training-board.ts`

**Intent**: The sole legal way to construct a classified view of a dog's training elements. The
factory fails fast on inconsistent data instead of silently trusting a documented-but-unchecked
precondition.

**Contract**: `import type { TrainingElement } from "@/types"` only (no runtime import — see Key
Discoveries on `vitest.config.ts`).

```ts
export class UnknownElementTickError extends Error {
  constructor(public readonly elementId: string) {
    super(`Tick references element "${elementId}", which is not in this board's element set`);
    this.name = "UnknownElementTickError";
  }
}

export interface TickRecord {
  elementId: string;
  trainedOn: string; // "YYYY-MM-DD"
}

export type HighlightColor = "green" | "red" | null;

export class TrainingBoard {
  private constructor(
    private readonly elements: readonly TrainingElement[],
    private readonly tickCounts: ReadonlyMap<string, number>,
  ) {}

  static create(elements: TrainingElement[], ticks: TickRecord[]): TrainingBoard {
    const counts = new Map<string, number>(elements.map((e) => [e.id, 0]));
    for (const tick of ticks) {
      if (!counts.has(tick.elementId)) {
        throw new UnknownElementTickError(tick.elementId);
      }
      counts.set(tick.elementId, counts.get(tick.elementId)! + 1);
    }
    return new TrainingBoard(elements, counts);
  }

  highlights(): ReadonlyMap<string, HighlightColor> {
    // body moved verbatim from src/lib/highlight.ts:50-151, operating on
    // this.elements / this.tickCounts instead of function parameters.
    // Preserve the full business-rule JSDoc from highlight.ts:1-49 on this method.
  }
}
```

### Success Criteria:

#### Automated Verification:

- Phase 1 tests pass: `npm run test`
- Type checking passes: `npm run build` (runs `astro check`)
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A (pure function, no UI wired yet)

---

## Phase 3: `loadTrainingBoard()` repository

### Overview

The one place `TrainingBoard.create()` is called from freshly-persisted data, for use by the new
API route in Phase 4. Also introduces `logsToTickRecords`, the raw-row-to-`TickRecord[]` mapping
helper this phase needs first — Phase 5's `grid.astro` reuses it unchanged, so it cannot wait until
Phase 6.

### Changes Required:

#### 1. New helper: `logsToTickRecords`

**File**: `src/lib/training-grid-helpers.ts`

**Intent**: Shape-conversion helper shared by `loadTrainingBoard()` (this phase) and `grid.astro`
(Phase 5) — both need to turn raw persisted log rows into `TickRecord[]`.

**Contract**: `logsToTickRecords(logs: Pick<TrainingLog, "element_id" | "trained_on">[]): TickRecord[]`
— maps each row to `{ elementId: log.element_id, trainedOn: log.trained_on }`, matching this file's
existing style (`buildTicksByElement`, `applyTick`).

#### 2. New service file

**File**: `src/lib/services/training-board.ts`

**Intent**: Fetch a dog's elements and ticks (identical bounds to `grid.astro`'s existing fetch)
and hand back a validated `TrainingBoard`.

**Contract**: `loadTrainingBoard(supabase: SupabaseClient, dogId: string): Promise<TrainingBoard>`.
Internally: `getTrainingWindow(30)` → `{ startDate, endDate }`; `Promise.all([getTrainingElements(supabase,
dogId), getTrainingLogs(supabase, dogId, startDate, endDate)])`; map the raw logs via
`logsToTickRecords`; call `TrainingBoard.create(elements, records)`.

#### 3. New test coverage for `logsToTickRecords`

**File**: `tests/unit/training-grid.test.ts`

**Intent**: Add (do not modify existing) a `describe` block for `logsToTickRecords`, following the
file's existing style.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Manually invoke `loadTrainingBoard()` against a seeded dog (e.g. via a temporary script or the
  Phase 4 route once it exists) and confirm the returned highlights match what the grid currently
  shows for that dog.

---

## Phase 4: `GET /api/dog/[id]/grid` endpoint

### Overview

Purely additive — gives a future non-React consumer (mobile client, export, digest) a real
integration point. Nothing existing calls this yet.

### Changes Required:

#### 1. New API route

**File**: `src/pages/api/dog/[id]/grid.ts`

**Intent**: Return the current highlight classification for a dog, following this codebase's
standard route shape.

**Contract**: `export const prerender = false; export const GET: APIRoute = ...`. Same
auth → dogId parse → ownership (`getDogById`) → service-call → response shape as
`src/pages/api/dog/[id]/logs/index.ts:19-65`: `401` if no session, `404` if `dogId` isn't a valid
UUID or the dog isn't found/owned, else call `loadTrainingBoard(supabase, dogId)` and respond
`Response.json({ highlights: Object.fromEntries(board.highlights()) })`. Errors (including
`UnknownElementTickError`) fall through the existing generic try/catch → `500` with `err.message`,
per Critical Implementation Details.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl` (or browser devtools, while signed in) `GET /api/dog/<id>/grid` for a real dog returns
  `{"highlights": {...}}` matching the grid's on-screen green/red rows.
- Same request while signed out returns `401`.
- Request for a dog owned by a different account returns `404`.

---

## Phase 5: Wire `grid.astro`

### Overview

`grid.astro` becomes an authoritative caller of the aggregate — validating the data it already
fetches — instead of handing raw data to the client untouched.

### Changes Required:

#### 1. Astro page

**File**: `src/pages/dogs/[id]/grid.astro`

**Intent**: After the existing `Promise.all([getTrainingElements, getTrainingLogs])` fetch,
construct a `TrainingBoard` from that same data to validate it before rendering. Any failure
(missing Supabase client, or a thrown `TrainingBoard.create()` error) degrades to the existing
service-unavailable overlay rather than crashing the SSR render.

**Contract**: Change the `serviceUnavailable` declaration at `grid.astro:34` from
`const serviceUnavailable = !supabase;` to `let serviceUnavailable = !supabase;` (it needs to be
reassignable — see below). Wrap the existing `if (supabase) { ... }` fetch block (currently
`grid.astro:40-45`) in a `try/catch` that also attempts `TrainingBoard.create(elements, records)`,
mapping `initialTicks` to `TickRecord[]` via `logsToTickRecords` (added in Phase 3, reused here
as-is). On catch, set `serviceUnavailable = true` (the existing prop already handles the UI). The
constructed board's `.highlights()` result is not passed as a prop — see Critical Implementation
Details / What We're NOT Doing.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Existing E2E spec still passes: `npm run test:e2e -- mobile-grid`

#### Manual Verification:

- Grid renders identically to before for a dog with existing tick history — same rows, same
  green/red highlights, same columns.
- Temporarily break the Supabase env vars (or otherwise force a construction failure) and confirm
  the "Something went wrong, please try later" overlay still renders instead of a crashed page.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 6.

---

## Phase 6: Wire `TrainingGrid.tsx`

### Overview

The client's recompute-on-tap path goes through the same aggregate instead of calling
`computeHighlights` directly.

### Changes Required:

#### 1. Client island

**File**: `src/components/training-grid/TrainingGrid.tsx`

**Intent**: Replace the `computeHighlights(elements, tickCounts)` call (currently line 89) with
`TrainingBoard.create(elements, records).highlights()`, where `records` is the client's `ticks`
state (`Map<string, Set<string>>`) flattened to `TickRecord[]`.

**Contract**: Add a small helper — `ticksMapToTickRecords(ticks: Map<string, Set<string>>):
TickRecord[]` — to `src/lib/training-grid-helpers.ts` (flattens each element's date `Set` into one
`{elementId, trainedOn}` entry per date), matching this file's existing style
(`buildTicksByElement`, `applyTick`, and the `logsToTickRecords` helper added in Phase 3). No new
try/catch needed around the `useMemo` — see Key Discoveries (this path cannot throw given
`buildTicksByElement`'s pre-filtering).

#### 2. New test coverage for `ticksMapToTickRecords`

**File**: `tests/unit/training-grid.test.ts`

**Intent**: Add (do not modify existing) a `describe` block for `ticksMapToTickRecords`, following
the file's existing style.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Tapping a cell still ticks/unticks instantly with no visible change in behavior.
- Highlights recompute correctly and instantly on tap, exactly as before (no network round-trip
  needed for the recompute, only for persistence).
- Switching the 7/14/30 window still leaves highlighted rows unchanged (window-agnostic ranking
  preserved).

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 7.

---

## Phase 7: Cleanup and documentation

### Overview

Remove the now-dead code and document the new domain-layer convention.

### Changes Required:

#### 1. Delete dead files

**Files**: `src/lib/highlight.ts`, `tests/unit/highlight.test.ts`

**Intent**: Confirm zero remaining references (`computeHighlights` has no callers left after Phase
6), then delete both outright, per this repo's "delete unused code, no re-export shims" convention.

**Contract**: `grep -rn "computeHighlights\|from \"@/lib/highlight\"\|from \"../../src/lib/highlight\"" src tests` returns no results before deletion.

#### 2. Document the new layer

**File**: `CLAUDE.md`

**Intent**: Add one line to "Key conventions" so future work knows where invariant-guarding
aggregate classes belong, distinct from the existing thin service wrappers.

**Contract**: Add under "Key conventions": `**Domain layer**: src/lib/domain/ for aggregate roots
that enforce a business invariant via a private constructor + create() factory (e.g.
TrainingBoard). src/lib/services/ stays the thin data-access layer that constructs one from
persisted rows.`

### Success Criteria:

#### Automated Verification:

- Grep confirms zero remaining references before deletion (see Contract above)
- Full test suite passes: `npm run test`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Final end-to-end pass: open the training grid for a dog with real history, confirm highlights,
  ticking, and window-switching are all indistinguishable from before this refactor started.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/training-board.test.ts` — all 17 ported trace-table cases + the new
  construction/error cases (Phase 1).
- `tests/unit/training-grid.test.ts` — additive only: new cases for `logsToTickRecords` (Phase 3)
  and `ticksMapToTickRecords` (Phase 6). Existing cases untouched.

### Integration Tests:

- None added — no test runner convention exists for API routes or service functions in this repo
  (per `CLAUDE.md`); verified manually per each phase's Manual Verification.

### Manual Testing Steps:

1. Open `/dogs/[id]/grid` for a dog with real tick history before and after the full refactor;
   confirm identical rows, highlights, and column rendering.
2. Tap several cells rapidly (testing the existing debounce/optimistic-update path) and confirm
   behavior is unchanged.
3. Switch between 7/14/30 windows and confirm highlighted rows never change (window-agnostic
   ranking preserved).
4. Hit `GET /api/dog/[id]/grid` directly (signed in, signed out, and for another account's dog) and
   confirm the three response codes described in Phase 4.

## Performance Considerations

None — `TrainingBoard.create()` is the same O(elements + ticks) work `computeHighlights` +
`buildTickCounts` already did, just recombined into one class. `loadTrainingBoard()` issues the
same two queries `grid.astro` already issues today, just from a different call site (the new,
separate-request API route).

## Migration Notes

No data migration. No schema change. Purely a code-organization refactor plus one new read-only
API route.

## References

- Domain analysis: `context/domain/01-domain-distillation.md`
- Refactor design source: `context/domain/02-invariant-aggregate-refactor.md`
- Original grid implementation: `context/archive/2026-06-17-training-grid/plan.md`
- Highlight algorithm history: `context/archive/2026-06-17-training-grid/research.md` (Corrections
  1-5), `context/archive/2026-06-23-testing-highlight-correctness-recalculation-wiring/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles.

### Phase 1: Test-first — TrainingBoard test suite

#### Automated

- [x] 1.1 Test file compiles once Phase 2 lands: `npm run test` — 22b52f8

### Phase 2: Implement TrainingBoard

#### Automated

- [x] 2.1 Phase 1 tests pass: `npm run test` — 22b52f8
- [x] 2.2 Type checking passes: `npm run build` — 22b52f8
- [x] 2.3 Linting passes: `npm run lint` — 22b52f8

### Phase 3: loadTrainingBoard() repository

#### Automated

- [x] 3.1 Unit tests pass: `npm run test` — 64a651e
- [x] 3.2 Type checking passes: `npm run build` — 64a651e
- [x] 3.3 Linting passes: `npm run lint` — 64a651e

#### Manual

- [x] 3.4 Manually invoke against a seeded dog and confirm highlights match the current grid — 64a651e

### Phase 4: GET /api/dog/[id]/grid endpoint

#### Automated

- [x] 4.1 Type checking passes: `npm run build` — 64a651e
- [x] 4.2 Linting passes: `npm run lint` — 64a651e

#### Manual

- [x] 4.3 Signed-in request returns `{"highlights": {...}}` matching the grid — 64a651e
- [x] 4.4 Signed-out request returns `401` — 64a651e
- [x] 4.5 Request for another account's dog returns `404` — 64a651e

### Phase 5: Wire grid.astro

#### Automated

- [x] 5.1 Type checking passes: `npm run build` — 33ce387
- [x] 5.2 Linting passes: `npm run lint` — 33ce387
- [x] 5.3 Existing E2E spec still passes: `npm run test:e2e -- mobile-grid` — 33ce387

#### Manual

- [x] 5.4 Grid renders identically to before for a dog with existing tick history — 33ce387
- [x] 5.5 Forced construction failure still shows the service-unavailable overlay, not a crash — 33ce387

### Phase 6: Wire TrainingGrid.tsx

#### Automated

- [x] 6.1 Unit tests pass: `npm run test` — d5c71e7
- [x] 6.2 Type checking passes: `npm run build` — d5c71e7
- [x] 6.3 Linting passes: `npm run lint` — d5c71e7

#### Manual

- [x] 6.4 Tapping a cell ticks/unticks instantly with no visible change — d5c71e7
- [x] 6.5 Highlights recompute correctly and instantly on tap — d5c71e7
- [x] 6.6 Switching 7/14/30 window leaves highlighted rows unchanged — d5c71e7

### Phase 7: Cleanup and documentation

#### Automated

- [x] 7.1 Grep confirms zero remaining references to `computeHighlights`/`highlight.ts` before deletion
- [x] 7.2 Full test suite passes: `npm run test`
- [x] 7.3 Type checking passes: `npm run build`
- [x] 7.4 Linting passes: `npm run lint`

#### Manual

- [x] 7.5 Final end-to-end pass: grid is indistinguishable from before this refactor
