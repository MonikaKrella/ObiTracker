---
title: ObiTracker — Invariant Aggregate-Guardian Refactor Plan
created: 2026-08-17
type: refactor-plan
---

# ObiTracker — Invariant Aggregate-Guardian Refactor Plan

This is a **plan only**. No production code is modified by this document.

## Step 0 — Context

Requirements: `context/foundation/prd.md` (locked, `status: draft`). Stack/layers confirmed by inspection:
Astro 6 SSR (`src/pages/**/*.astro`) + React 19 islands (`src/components/**`) + Supabase Postgres
(`supabase/migrations/*.sql`) + thin service layer (`src/lib/services/*.ts`) + pure domain helpers
(`src/lib/highlight.ts`, `src/lib/training-grid-helpers.ts`, `src/lib/dates.ts`).

This document builds directly on `context/domain/01-domain-distillation.md` (Steps 0–5 already performed
there: ubiquitous language, subdomain classification, candidate invariants, PRD/code crossovers, and a
preliminary ranking). Step 1–2 below re-derive the invariant list and re-run the classification
independently against the live code (not merely inherited), then Steps 3–5 go deeper than the distillation
did: exact diagnosis with file:line evidence, and a concrete aggregate design.

---

## Step 1 — Identified business invariants

| #   | Invariant                                                                                                                                                                                                                                                                                             | Source (docs)                                                                                                                                                  | Source (code)                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Highlight classification must be a complete, deterministic function of a dog's tick history** — every element gets exactly one of `green \| red \| null`, computed by one authoritative rule (3-tier + tie-expansion + suppression), and no element may be silently excluded from that computation. | `prd.md:38` (Primary success criterion: "identify what to train next in under 10 seconds"); `prd.md:95-96` (FR-007); `prd.md:104-108` (Business Logic section) | `src/lib/highlight.ts:50-151` (`computeHighlights`); precondition stated at `highlight.ts:43-44`: "`tickCounts` MUST include ALL elements... elements absent from the map are invisible to the algorithm"       |
| 2   | At most one training-log row per `(element, day)` — a day is ticked or not, never double-counted.                                                                                                                                                                                                     | `prd.md:118` (presence-only, tick/untick)                                                                                                                      | `CONSTRAINT training_logs_element_id_trained_on_unique UNIQUE (element_id, trained_on)` (`supabase/migrations/20260530000003_create_training_logs.sql:17`)                                                      |
| 3   | A training-log row's `element_id` must belong to the `dog_id` it's filed under (no cross-dog corruption).                                                                                                                                                                                             | Not in `prd.md`                                                                                                                                                | RLS `WITH CHECK` EXISTS-join (`20260530000003_create_training_logs.sql:42-47`) + app-level `elementBelongsToDog()` (`src/lib/services/training-elements.ts:149-166`) — "defense in depth" per its own docstring |
| 4   | A tick may only be logged for today or a past day, never a future day.                                                                                                                                                                                                                                | `prd.md:91-93` (FR-006)                                                                                                                                        | `isFutureUtcDate()` guard in Zod schema only (`src/pages/api/dog/[id]/logs/index.ts:13-17`); no DB `CHECK` constraint                                                                                           |
| 5   | A handler cannot have two live dogs with the same name (case-insensitive).                                                                                                                                                                                                                            | Not in `prd.md`                                                                                                                                                | `isDogNameTaken()` check-then-insert (`src/lib/services/dogs.ts:35-47`, `src/pages/api/dog/index.ts:33-38`); no DB unique index                                                                                 |
| 6   | An element's name is unique within its dog.                                                                                                                                                                                                                                                           | Not in `prd.md`                                                                                                                                                | DB `UNIQUE (dog_id, name)` (byte-exact) + app-level case-insensitive `ilike` check (`src/lib/services/training-elements.ts:31-52`) — two layers, not perfectly aligned                                          |
| 7   | Deleting an element deletes its entire tick history (no orphaned logs).                                                                                                                                                                                                                               | Not in `prd.md`                                                                                                                                                | `ON DELETE CASCADE` (`20260530000003_create_training_logs.sql:13`)                                                                                                                                              |
| 8   | A soft-deleted dog is invisible and cannot be selected.                                                                                                                                                                                                                                               | Not in `prd.md`                                                                                                                                                | RLS `is_deleted = FALSE` baked into SELECT policy (`20260531000001_dogs_soft_delete.sql:13-15`)                                                                                                                 |

---

## Step 2 — Classification and selection

| #   | Invariant                | (a) Core-ness                                                                                                        | (b) Spread across layers                                                             | (c) Enforcement                                                                                                                                                                            |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Highlight classification | **Maximal** — _is_ the Primary success criterion (`prd.md:38`), the one thing the Vision names as the differentiator | **One layer only**, and the wrong one: a single React component (`TrainingGrid.tsx`) | **Sole gatekeeper is client UI code.** No service, no API route, no repository ever produces or returns a highlight. Precondition is documented, never checked → violations fail silently. |
| 2   | Tick uniqueness          | High (data-loss guardrail, `prd.md:46`)                                                                              | DB only                                                                              | Enforced, single source of truth                                                                                                                                                           |
| 3   | Cross-dog log integrity  | Moderate                                                                                                             | RLS + app, twice                                                                     | Enforced redundantly (strong)                                                                                                                                                              |
| 4   | Future-date guard        | Moderate (FR-006 semantics)                                                                                          | API only                                                                             | Declared, narrow gap (needs valid session credentials to bypass)                                                                                                                           |
| 5   | Dog name uniqueness      | Low-moderate (Supporting, not Core, per `01-domain-distillation.md` Step 2)                                          | App only                                                                             | Declared, racy (no DB backstop)                                                                                                                                                            |
| 6   | Element name uniqueness  | Low-moderate (Supporting)                                                                                            | DB + app, slightly misaligned                                                        | Enforced with a minor case-sensitivity gap                                                                                                                                                 |
| 7   | Cascade delete of logs   | Low                                                                                                                  | DB only                                                                              | Enforced                                                                                                                                                                                   |
| 8   | Soft-delete invisibility | Low-moderate                                                                                                         | RLS + app                                                                            | Enforced redundantly                                                                                                                                                                       |

**Selected: #1, the highlight classification invariant.**

It wins on both axes simultaneously, not narrowly:

- **Most core**: every other invariant in this table is infrastructure (ownership, uniqueness, cascade
  hygiene) that a generic CRUD app would also need. Invariant #1 is the one sentence the PRD's Vision and
  Primary Success Criterion are both written about (`prd.md:22-24`, `prd.md:38`). Nothing else in the
  domain comes close.
- **Least enforced — and not by degree, categorically**: invariants #4 and #5 are "declared but racy" —
  partial, narrow gaps in an otherwise-present enforcement chain. Invariant #1 has **no enforcement chain
  at all** outside a single UI component's `useMemo`. There is no `GET` endpoint, service function, or
  repository anywhere in `src/lib/services/` that returns a highlight classification — grep confirms
  `computeHighlights` has exactly one call site in the entire codebase (`TrainingGrid.tsx:89`). A future
  consumer (a CSV export, a print view, a mobile client hitting the API directly, a "today's focus" email
  digest) has literally nothing to call. This is precisely the "client (UI) is the sole gatekeeper"
  pattern this review is designed to catch.

---

## Step 3 — Diagnosis

### 3.1 Where the rule lives today

```
grid.astro (SSR, Astro page)
  ├─ getTrainingElements(supabase, dogId)   → elements
  ├─ getTrainingLogs(supabase, dogId, ...)  → initialTicks   (separate, unrelated query)
  └─ <TrainingGrid elements={elements} initialTicks={initialTicks} .../>
                                                     │
                                                     ▼
TrainingGrid.tsx (React island, client:load)
  ├─ ticks       = useState(buildTicksByElement(elements, initialTicks))
  ├─ tickCounts  = useMemo(buildTickCounts(elements, ticks))
  └─ highlights  = useMemo(computeHighlights(elements, tickCounts))   ← THE INVARIANT LIVES HERE, ONLY HERE
```

- `grid.astro:37-45` fetches `elements` and `initialTicks` but never imports or calls `computeHighlights`,
  `buildTickCounts`, or anything from `highlight.ts`. It passes raw, unclassified data to the client.
- `dashboard.astro` never references highlights, green, or red at all (confirmed by repo-wide grep of
  `src/pages/**`) — no other page has any awareness this classification exists.
- `computeHighlights` (`src/lib/highlight.ts:50-151`) is a pure function with **zero side effects and zero
  callers outside `TrainingGrid.tsx:89`**. It is not exported from a service (`src/lib/services/*.ts`
  contains no `highlights` module), not wrapped by any API route (`src/pages/api/dog/**` has no `grid` or
  `highlights` endpoint), and not covered by RLS or any DB object (it operates purely in memory on data the
  DB already returned unfiltered).

**This is the "client is the sole gatekeeper" case named directly in this review's own methodology**: the
one piece of logic that decides what the Primary Success Criterion actually shows the handler is reachable
through exactly one code path, and that path is a presentational React component, not a domain or service
boundary. Nothing stops that component from being bypassed (a different SSR page, a future non-JS
fallback, a print stylesheet, a future public API for mobile) or from silently diverging if a second
implementation is ever added elsewhere, because there is no architectural seam forcing reuse.

### 3.2 The precondition is documented, not enforced — and the swallow already has a name

`highlight.ts:43-44` states the precondition in prose: _"`tickCounts` MUST include ALL elements... elements
absent from the map are invisible to the algorithm."_ Nothing in `computeHighlights` checks this. The
precondition is upheld today only because its one caller (`buildTickCounts`,
`src/lib/training-grid-helpers.ts:47-55`) happens to always default every element to `0` first.

The layer below that, `buildTicksByElement` (`training-grid-helpers.ts:8-17`), has its own documented
swallow: _"ticks for element IDs not in the list are silently ignored (optional-chain guard)"_
(`training-grid-helpers.ts:3-6`), implemented as `map.get(tick.element_id)?.add(tick.trained_on)` — a tick
for an `element_id` absent from the current `elements` list is dropped with no error, no log entry, no
count. **This exact behavior is asserted as correct by an existing test**
(`tests/unit/training-grid.test.ts:59-65`, `"a tick for an unknown element ID is silently ignored"`).

Today this is reachable only through data that shouldn't exist given the schema's own constraints (a
`training_logs.element_id` is FK'd to `training_elements` with `ON DELETE CASCADE`, so an orphaned tick
can't normally persist — see invariant #7). But nothing in `highlight.ts` or `training-grid-helpers.ts`
verifies this itself; both modules trust an upstream guarantee they don't check, in a codebase that
elsewhere treats exactly this class of gap seriously enough to add explicit defense-in-depth
(`elementBelongsToDog()`, `src/lib/services/training-elements.ts:149-166`, docstring: _"should not be the
only thing standing between a forged/mismatched `elementId` and a cross-dog log row"_). The highlight
pipeline is the one place that same discipline was not applied — and it's the one place where a silent
wrong answer directly undermines the Primary Success Criterion rather than a security boundary.

### 3.3 Summary of the gap

| Layer                              | Enforces the invariant?                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| DB / RLS                           | No — DB has no concept of "highlight"; returns raw rows only |
| Service (`src/lib/services/*.ts`)  | No — no highlights module exists                             |
| API (`src/pages/api/**`)           | No — no endpoint returns a classification                    |
| SSR page (`grid.astro`)            | No — fetches raw data, never classifies it                   |
| **Client UI (`TrainingGrid.tsx`)** | **Yes — the only place, via an unchecked precondition**      |

---

## Step 4 — Aggregate-Guardian design

This invariant is a _read/classification_ invariant, not a state-transition invariant, so "illegal
operation" here means "attempting to construct a classified view from inconsistent data," not "an illegal
state transition on a mutable entity." The aggregate-guardian pattern still applies: make one object the
only legal way to produce a highlight, give its factory real preconditions, and make every consumer —
SSR page, API route, and client optimistic-update path — go through it.

### Aggregate root: `TrainingBoard`

```ts
// src/lib/domain/training-board.ts

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

  /**
   * The ONLY way to construct a TrainingBoard. Fails fast — never
   * silently drops a tick — instead of trusting the caller's data.
   */
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

  /** The single authoritative highlight computation — body unchanged from today's computeHighlights. */
  highlights(): ReadonlyMap<string, HighlightColor> {
    /* ...exact tier 1/2/3 + suppression algorithm currently in highlight.ts:50-151... */
  }

  tickCountFor(elementId: string): number {
    const count = this.tickCounts.get(elementId);
    if (count === undefined) throw new UnknownElementTickError(elementId);
    return count;
  }
}
```

- `computeHighlights`'s existing body is **moved verbatim** into `TrainingBoard.highlights()` — no
  algorithm change, no re-litigating the 3-tier/suppression rules that already survived five corrections.
- The precondition from `highlight.ts:43-44` becomes a real runtime check in the factory: an inconsistent
  tick throws `UnknownElementTickError` instead of being invisibly dropped (closes the gap in §3.2).
- `TrainingBoard` has no setters and no mutation methods — it's an immutable snapshot, matching the
  "presence-only, no history" character of the domain (no notes/comments per `prd.md:118`).

### Repository: `TrainingBoardRepository`

```ts
// src/lib/services/training-board.ts

export async function loadTrainingBoard(supabase: SupabaseClient, dogId: string): Promise<TrainingBoard> {
  const [elements, ticks] = await Promise.all([
    getTrainingElements(supabase, dogId),
    getTrainingLogs(supabase, dogId /* full history bounds, window-agnostic per crossover #1 */),
  ]);
  return TrainingBoard.create(
    elements,
    ticks.map((t) => ({ elementId: t.element_id, trainedOn: t.trained_on })),
  );
}
```

This is the one place `TrainingBoard.create` is called from persisted data. The two underlying queries stay
as they are today (`Promise.all`, not one transaction) — the aggregate's own fail-fast constructor is what
now catches any inconsistency between them, instead of relying on the queries being perfectly synchronized.

### Thin API: `GET /api/dog/[id]/grid`

```ts
// src/pages/api/dog/[id]/grid.ts
export const prerender = false;

export const GET: APIRoute = async (context) => {
  // ...auth + dogId parse + ownership check, same pattern as logs/index.ts...
  const board = await loadTrainingBoard(supabase, dogId);
  return Response.json({
    highlights: Object.fromEntries(board.highlights()),
  });
};
```

This is new: today no endpoint exposes highlights at all. It gives any future non-React consumer
(mobile client, export feature, digest email) a real integration point instead of "reimplement
`computeHighlights` yourself and hope it doesn't drift."

### `grid.astro` (SSR) — moves from "never touches highlights" to the authoritative caller

```ts
const board = await loadTrainingBoard(supabase, selectedDog.id);
const initialHighlights = Object.fromEntries(board.highlights());
// ...pass initialHighlights to <TrainingGrid> as a prop, alongside elements/initialTicks
```

### Client (`TrainingGrid.tsx`) — recompute after a tick still allowed, but through the same aggregate

The client still needs to recompute highlights instantly on tap, without a network round trip
(`prd.md:62`, "single tap... no confirmation dialog"). It does so by calling
`TrainingBoard.create(elements, ticksToRecords(ticks)).highlights()` inside the existing `useMemo` —
**the same class, the same fail-fast constructor** — instead of the current bare `computeHighlights` call
against unguarded data. `initialHighlights` (from SSR) seeds the first paint so pre-hydration and
non-JS/print rendering are correct too, closing the "client is sole gatekeeper" gap even for the very first
response.

---

## Step 5 — Before / after, phased plan, tests

### Before / after

| Rule location                         | Before                                                                                        | After                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Algorithm                             | `src/lib/highlight.ts` — free function, unchecked precondition                                | `TrainingBoard.highlights()` — method on a validated aggregate         |
| Precondition ("all elements present") | Documented in a comment, never checked                                                        | Enforced in `TrainingBoard.create()`; throws `UnknownElementTickError` |
| Unknown-element tick                  | Silently dropped (`training-grid-helpers.ts:8-17`, asserted by `training-grid.test.ts:59-65`) | Throws — fails fast, does not produce a silently-wrong classification  |
| Server-side availability              | None — no service, no API route                                                               | `loadTrainingBoard()` service + `GET /api/dog/[id]/grid`               |
| `grid.astro`                          | Fetches raw data, never classifies                                                            | Calls `loadTrainingBoard`, passes `initialHighlights` to the island    |
| Client (`TrainingGrid.tsx`)           | Sole gatekeeper; calls `computeHighlights` directly                                           | One of two callers (SSR + client), both going through `TrainingBoard`  |

### Phased plan (test-first, per this repo's existing scoped Vitest exception for this exact module)

1. **Phase 1 — test-first.** Write `tests/unit/training-board.test.ts` against the not-yet-existing
   `TrainingBoard` class. Port all 9 existing trace-table cases from `highlight.test.ts` as
   `TrainingBoard.create(...).highlights()` assertions (hard-coded expected maps, not oracle-derived, per
   the existing "oracle problem" discipline noted in `context/archive/2026-06-23-.../research.md:335`).
   Add new cases:
   - Legal: `create()` with ticks whose `elementId` set exactly matches `elements` → succeeds.
   - Illegal: `create()` with one tick whose `elementId` is not in `elements` → throws
     `UnknownElementTickError`.
   - Legal: `create([], [])` → `highlights()` returns an empty map (n=0 case, unchanged from today).
   - Illegal: `tickCountFor()` called with an unknown id → throws (not `undefined`).
2. **Phase 2 — implement `TrainingBoard`** in `src/lib/domain/training-board.ts`, moving the algorithm body
   from `highlight.ts` verbatim. Run Phase 1 tests to green.
3. **Phase 3 — implement `loadTrainingBoard()`** in `src/lib/services/training-board.ts`. No new tests
   required beyond existing service-layer conventions (no dedicated test suite for services per
   `CLAUDE.md`), but manually verify against a seeded dog.
4. **Phase 4 — add `GET /api/dog/[id]/grid`.** Follow the auth/ownership pattern in
   `src/pages/api/dog/[id]/logs/index.ts:19-52` (401 → dogId parse → ownership check → service call →
   typed JSON response, errors mapped to `500`/`404`, never swallowed).
5. **Phase 5 — wire `grid.astro`** to call `loadTrainingBoard()` and pass `initialHighlights` to
   `<TrainingGrid>`. Update `tests/unit/training-grid.test.ts:59-65` — this test currently asserts the
   silent-swallow as correct; it must be replaced with an assertion that the _new_ aggregate-level
   construction throws for the same input, or explicitly deleted with a comment pointing at
   `training-board.test.ts` as its replacement (do not leave both a "silently ignored" and a "throws"
   assertion coexisting for the same input shape).
6. **Phase 6 — wire `TrainingGrid.tsx`** to build highlights via `TrainingBoard.create(...).highlights()`
   seeded from `initialHighlights` for first paint, matching the recompute-on-tap UX exactly as today.
7. **Phase 7 — delete `computeHighlights` and `highlight.ts`** once nothing imports them (grep to confirm
   zero remaining references before removal, per this repo's "delete unused code outright" convention).

### New load-bearing names to register

No contract registry file exists in this repo today (checked: no match for "contract registry" anywhere in
`context/` or `src/`). If one is introduced, it should include:

- `TrainingBoard` (aggregate root, `src/lib/domain/training-board.ts`)
- `TrainingBoard.create()` (sole factory / invariant guard)
- `UnknownElementTickError` (named domain error)
- `loadTrainingBoard()` (repository function, `src/lib/services/training-board.ts`)
- `GET /api/dog/[id]/grid` (new API route)

---

## Summary

The most core, least-enforced invariant in ObiTracker is not a data-integrity rule but the highlight
classification itself — the literal Primary Success Criterion (`prd.md:38`) — which today is computed
exclusively inside `TrainingGrid.tsx`'s `useMemo`, with no service, API, or repository ever producing it
independently. Its own documented precondition ("`tickCounts` must include all elements") is unchecked, and
the layer beneath it silently drops ticks for unrecognized elements — a behavior an existing test
(`training-grid.test.ts:59-65`) currently asserts as correct rather than flags as a gap. The proposed fix
introduces a `TrainingBoard` aggregate whose `create()` factory fails fast (`UnknownElementTickError`)
instead of silently producing a wrong classification, a `loadTrainingBoard()` repository, and a new
`GET /api/dog/[id]/grid` endpoint so the SSR page, the API, and the client's optimistic-update path all
route through the same guarded object instead of one React component being the sole gatekeeper. The
algorithm itself — the 3-tier/tie-expansion/suppression rule that already survived five corrections — is
moved verbatim, not redesigned. The plan is phased test-first, reusing this repo's existing scoped Vitest
exception for this exact module, and explicitly calls out the one existing test that must change meaning
(from "asserts a swallow" to "asserts a throw") rather than being left to silently diverge from the new
behavior.
