---
date: 2026-06-25T00:00:00Z
researcher: Claude Sonnet 4.6
git_commit: 1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c
branch: training-grid
repository: ObiTracker
topic: "Highlight correctness & recalculation wiring — test coverage audit and boundary analysis"
tags: [research, codebase, highlight, training-grid, dates, unit-tests, integration]
status: complete
last_updated: 2026-06-25
last_updated_by: Claude Sonnet 4.6
---

# Research: Highlight correctness & recalculation wiring

**Date**: 2026-06-25  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: 1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c  
**Branch**: training-grid  
**Repository**: ObiTracker

---

## Research Question

Phase 2 of the test-plan rollout. Covers risks #2 and #5:

- **Risk #2** — The highlight calculation marks the wrong rows green/red (8-element incident). Where does `computeHighlights` live, what tier cases does the existing test file cover, and what gaps remain?
- **Risk #5** — A rolling-window boundary day is included or excluded inconsistently, or a UTC offset shifts a tick out of its window. How is the window boundary computed, and does window-switching affect highlight ranking?

---

## Summary

Four headline findings determine the shape of every test in Phase 2:

1. **The 8-element incident is already covered** — `src/lib/highlight.test.ts:191-213` reproduces exactly: 1 element with 1 tick, 7 tied at 0. The bug surfaced because the _old_ highlight logic (before the Correction-5 fix) arbitrarily filled rank-2/3 green slots from the 7-way zero-tick tie. The current code + existing test prove that is now guarded. The test gaps are in _other_ Tier 3 edge cases, not this specific scenario.

2. **Highlight recalculation fires synchronously on every tick** — `applyOptimisticTick` (called _before_ `startTransition` in `TickCell.handleChange`) immediately updates `ticks` state in `TrainingGrid`, which invalidates the `tickCounts` memo, which invalidates the `highlights` memo — all in the same commit. No deferred render, no stale highlight on the same tap. A component/integration test of this wiring does not yet exist.

3. **Window-switching does NOT affect highlight ranking — this is intentional** — `tickCounts` and `highlights` always count ticks across the fixed 30-day dataset fetched at SSR. Changing the window (7/14/30d) only slices `visibleDates` (which date columns are rendered). The test-plan Risk #5's "switching windows recalculates highlight ranking" assumption does not match the implementation; the actual Risk #5 test target is the 30-day boundary math in `src/lib/dates.ts`.

4. **`src/lib/dates.ts` has zero test coverage** — `getTrainingWindow`, `generateDateRange`, and `isFutureUtcDate` are pure, parameter-injected functions with no test file. These are the exact functions Risk #5 depends on.

---

## Detailed Findings

### 1. `computeHighlights` — algorithm and code location

**File**: [`src/lib/highlight.ts`](https://github.com/MonikaKrella/ObiTracker/blob/1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c/src/lib/highlight.ts)

The algorithm is a pure function with signature:

```typescript
computeHighlights(
  elements: TrainingElement[],       // all elements for the dog, in display order
  tickCounts: Map<string, number>,   // elementId → count across the full 30-day window
): Map<string, "green" | "red" | null>
```

Three tiers keyed on `n = elements.length`:

| Tier | n | Rule |
|------|---|------|
| 1 | ≤ 3 | No highlights — too few for a signal |
| 2 | 4–6 | Single winner only; tie at top or bottom → no highlight for that colour |
| 3 | ≥ 7 | Top-3 / bottom-3 with rank-1 tie expansion, rank-2/3 uniqueness guard, and set-size suppression (≥ half → suppress that colour) |

**Suppression threshold (Tier 3):** `set.size * 2 >= n` → suppress. For the size-3 normal case, this only fires when `n ≤ 6`, but n≥7 means a standard 3-element set is never suppressed. It fires in practice only when a rank-1 tie group is large enough to reach half the total.

**Green precedence:** green overwrites red when an element qualifies for both (lines 147–148). In practice this is a dead code path for valid inputs with n≥7 (the same element cannot simultaneously have both the highest and lowest tick count unless all counts are equal, in which case suppression fires for both colours first).

---

### 2. Existing test coverage audit — `src/lib/highlight.test.ts`

**File**: [`src/lib/highlight.test.ts`](https://github.com/MonikaKrella/ObiTracker/blob/1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c/src/lib/highlight.test.ts)

| Line | Test | Tier | Verdict |
|------|------|------|---------|
| 22 | n=0 → empty map | 1 | ✅ |
| 183 | n=1 → no highlights | 1 | ✅ |
| 129 | n=3, clear ranking → no highlights | 1 | ✅ |
| 112 | n=4, tie at top AND bottom → no highlights | 2 | ✅ |
| 93 | n=5, 2-way tie at top, unique bottom | 2 | ✅ |
| 144 | n=5, 4-way tie at top, unique bottom | 2 | ✅ |
| 51 | n=6, all unique → green A, red F | 2 | ✅ |
| 72 | n=6, 3-way tie at top → green suppressed, unique bottom red | 2 | ✅ |
| 163 | n=6, all zeros → no highlights (Tier 2 tie both ends) | 2 | ✅ |
| 216 | n=7, all unique → top-3 green, bottom-3 red | 3 | ✅ |
| 26 | n=8, 4-way tie at top → green suppressed (4*2≥8), red H/G/F | 3 | ✅ |
| 191 | n=8, 1 tick among 8 → green=D only, red suppressed (7-way tie) | 3 | ✅ **the reported incident** |

**Total: 12 cases. Tier 1: 3. Tier 2: 6. Tier 3: 3.**

#### Coverage gaps

The following Tier 3 edge cases have no test:

| Gap | Scenario | Expected result | Why it matters |
|-----|----------|----------------|----------------|
| **G1** | n=7: A=B=5 (rank-1 2-way tie), C=4, D=3, E=2, F=1, G=0. Green rank-1 tie adds A+B, then rank-2 C (unique, freq=1) → greenSet={A,B,C}. 3*2=6 < 7 → not suppressed. | A=green, B=green, C=green, E=red, F=red, G=red | Verifies rank-1 tie expansion + rank-2 uniqueness fill in the non-suppressed case |
| **G2** | n=7: A=7, B=6, C=5, D=4, E=3, F=1, G=1 (rank-last 2-way tie). redSet rank-last={F,G}, then rank-2-from-last E (unique, freq=1) → {F,G,E}. 3*2=6 < 7 → not suppressed. | A=green, B=green, C=green, E=red, F=red, G=red | Verifies rank-last tie expansion for red (symmetric to G1 but for the red side) |
| **G3** | n=7: A=7, B=C=5 (tied rank-2, freq=2), D=4, E=3, F=2, G=1. After rank-1 (A), rank-2 skipped (freq(5)=2≠1), rank-3 also skipped (still at byDesc[1]=B). greenSet={A}. Red: G, then F (unique), then E (unique) → {G,F,E}. | A=green, E=red, F=red, G=red | Verifies rank-2/3 tie causes slot skip rather than arbitrary pick (the Correction-5 guard) |
| **G4** | n=8, all zeros. greenSet: all 8 at rank-1 (highest=0) → size=8, 8*2≥8 → suppressed. redSet same → suppressed. | All null | Verifies Tier 3 all-equal suppression (analogous to Tier 2's n=6-all-zeros test but through the suppression path) |
| **G5** | n=4, all unique: A=5, B=4, C=3, D=2. topIsUnique: byDesc[0][1]=5 ≠ byDesc[1][1]=4 → green A. bottomIsUnique: byAsc[0][1]=2 ≠ byAsc[1][1]=3 → red D. | A=green, D=red | The "happy path" Tier 2 case with a unique winner — only n=4 test currently has ties at both ends |

**No Tier 1 gaps.** All three Tier 1 boundary cases (n=0, n=1, n=3) are covered.

**No Tier 2 gaps that affect bug protection** (the 5 existing Tier 2 cases cover the uniqueness guard and tie suppression), but G5 (n=4, all unique) completes the happy-path picture.

---

### 3. Recalculation wiring — tick toggle to highlight update

The chain from user tap to updated row colour:

```
TickCell.handleChange()
  └─ onOptimisticTick(elementId, date, next)           // synchronous, BEFORE startTransition
       └─ TrainingGrid.applyOptimisticTick(...)
            └─ setTicks(prev => applyTick(...))         // ticks state updated
                 └─ tickCounts useMemo([elements, ticks])
                      └─ counts dateSet.size for each element
                           └─ highlights useMemo([elements, tickCounts])
                                └─ computeHighlights(elements, tickCounts)
                                     └─ re-render: row bg classes updated
```

**Key files:**

- `src/components/training-grid/TickCell.tsx:51-70` — `handleChange` calls `onOptimisticTick` synchronously before `startTransition`; `startTransition` wraps the `setOptimisticChecked` + `onToggle` (network) call.
- `src/components/training-grid/TrainingGrid.tsx:131-137` — `applyOptimisticTick` comment explains the synchronous choice: "highlight recompute commits in lockstep with the tap rather than being deferred as a transition update."
- `src/components/training-grid/TrainingGrid.tsx:109-119` — `tickCounts` and `highlights` memos; both depend on `ticks` state.

**`tickCounts` counts ALL ticks in the 30-day window, not just visible ones:**
```typescript
// TrainingGrid.tsx:109-117
const tickCounts = useMemo(() => {
  const counts = new Map<string, number>(elements.map((e) => [e.id, 0]));
  for (const [elementId, dateSet] of ticks) {
    if (counts.has(elementId)) {
      counts.set(elementId, dateSet.size);   // dateSet holds ALL 30 days of ticks
    }
  }
  return counts;
}, [elements, ticks]);
```

`ticks` is initialized from `initialTicks` (all 30-day logs fetched at SSR) and each toggle adds/removes from that `Set<string>` — the visible window slice (`visibleDates`) is used only for column rendering, never for tick counting.

**Integration test gap:** No test verifies that tapping a cell causes the row's highlight class to update in the same render. This is the wiring test called out in the test-plan Risk Response for #2.

---

### 4. Window switching and highlight ranking — DESIGN FINDING (Risk #5 reframe)

**The test-plan Risk Response for #5 says:** "Switching 7/14/30-day windows recalculates grid columns and highlight ranking using only ticks within the newly selected window."

**The implementation does NOT do this — and this is intentional, not a bug.**

Evidence:

1. `src/pages/dogs/[id]/grid.astro:23` — SSR always fetches a fixed 30-day window: `getTrainingWindow(30)`.
2. `src/components/training-grid/TrainingGrid.tsx:72-78` (JSDoc comment): "`tickCounts`/`highlights` always cover the full 30-day `dates`/ticks data — the window selector only slices which date columns are rendered, never which ticks feed the highlight algorithm."
3. `src/components/training-grid/TrainingGrid.tsx:121` — `visibleDates = dates.slice(-selectedWindow)` changes only columns; `ticks` and `tickCounts` are unaffected by `selectedWindow`.

**What window switching actually does:**
- Updates `selectedWindow` state → `visibleDates` memo recomputes → table renders fewer/more date columns.
- Triggers the scroll-to-right `useEffect` (`scrollRef.current.scrollLeft = scrollRef.current.scrollWidth`).
- Does NOT touch `ticks`, `tickCounts`, or `highlights`.

**Consequence for Risk #5 testing:**
The Risk #5 test target is the correctness of `getTrainingWindow(30)` and `generateDateRange(30, endDate)` in `src/lib/dates.ts` — specifically whether boundary days (first and last of the 30-day window) are correctly included, and whether UTC date comparison is consistent end-to-end.

---

### 5. Date utility functions — `src/lib/dates.ts`

**File**: [`src/lib/dates.ts`](https://github.com/MonikaKrella/ObiTracker/blob/1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c/src/lib/dates.ts)

**Zero test coverage. No `dates.test.ts` file exists.**

#### `getTrainingWindow(windowDays, today?)`

```typescript
export function getTrainingWindow(windowDays, today = new Date()) {
  const endDate = today.toISOString().slice(0, 10);   // UTC date as "YYYY-MM-DD"
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
```

**Boundary analysis:**
- For windowDays=7, today=2026-06-25: endDate="2026-06-25", start=June 25−6=June 19. Window is June 19–June 25, exactly 7 days inclusive. ✓
- For windowDays=30, today=2026-06-25: start=June 25−29=May 27. Window is May 27–June 25, exactly 30 days inclusive. ✓
- Formula `windowDays - 1` is correct for an inclusive-end window. Off-by-one would be `windowDays`, which would give 31 days for a 30d window.

**UTC safety:** `today.toISOString()` always returns UTC. `setUTCDate`/`getUTCDate` are UTC-safe. No local timezone conversion occurs. ✓

#### `generateDateRange(windowDays, today)`

```typescript
export function generateDateRange(windowDays, today) {
  const end = new Date(`${today}T00:00:00Z`);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
```

**Boundary analysis:**
- i=windowDays-1: d = today − (windowDays−1) = startDate → index 0 (oldest)
- i=0: d = today = endDate → last index

For windowDays=30: generates exactly 30 dates. `dates[0]` matches `getTrainingWindow(30).startDate` ✓ — both compute today − 29 days using `setUTCDate`.

**Cross-function consistency:** `grid.astro` calls both functions with the same `windowDays=30`. The date sequences are in sync: `getTrainingLogs` is called with `startDate`/`endDate` from `getTrainingWindow`, and `generateDateRange` produces the same 30-date list that populates `TrainingGrid.dates`. ✓

#### `isFutureUtcDate(dateStr, today?)`

```typescript
export function isFutureUtcDate(dateStr, today = new Date()) {
  const todayStr = today.toISOString().slice(0, 10);
  return dateStr > todayStr;   // lexical comparison; "YYYY-MM-DD" is lexically ordered
}
```

Used in the API route's Zod schema to reject ticks on future dates (`trainedOn.refine(v => !isFutureUtcDate(v))`). Pure string comparison — no `Date` parsing on the input string. ✓ (Today's date is NOT rejected; strict `>` means "tomorrow or later" only.)

**Key gap for Risk #5:** There are no automated tests for any of these three functions. The boundary-day inclusion/exclusion is manually verifiable from the code but not regression-protected.

---

### 6. API route and toggle service

**Toggle API route**: [`src/pages/api/dog/[id]/logs/index.ts`](https://github.com/MonikaKrella/ObiTracker/blob/1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c/src/pages/api/dog/%5Bid%5D/logs/index.ts)

**Toggle service**: [`src/lib/services/training-logs.ts`](https://github.com/MonikaKrella/ObiTracker/blob/1be6e2611e9fcb6dd672a0de0a0e326abb25ac6c/src/lib/services/training-logs.ts)

Not a Phase 2 test target (that's Phase 3), but relevant context for the recalculation wiring: the toggle API succeeds silently (returns `{ success: true, state: "ticked"|"unticked" }`). The client doesn't use `state` to update the grid — it relies entirely on the optimistic update already committed before the API call. If the API call fails, `handleToggle` reverts via `applyOptimisticTick(elementId, date, !next)`.

---

## Code References

| File | Lines | What's there |
|------|-------|-------------|
| `src/lib/highlight.ts` | 1–151 | `computeHighlights` — full 3-tier algorithm |
| `src/lib/highlight.test.ts` | 1–238 | 12 existing test cases (see audit table in §2) |
| `src/lib/dates.ts` | 1–57 | `getTrainingWindow`, `generateDateRange`, `isFutureUtcDate` — zero test coverage |
| `src/components/training-grid/TrainingGrid.tsx` | 109–119 | `tickCounts`/`highlights` useMemo chain |
| `src/components/training-grid/TrainingGrid.tsx` | 131–137 | `applyOptimisticTick` — synchronous, before startTransition |
| `src/components/training-grid/TrainingGrid.tsx` | 72–78 | JSDoc explaining 30-day-always design decision |
| `src/components/training-grid/TrainingGrid.tsx` | 121 | `visibleDates = dates.slice(-selectedWindow)` — window slices columns only |
| `src/components/training-grid/TickCell.tsx` | 51–70 | `handleChange` — synchronous `onOptimisticTick` then `startTransition` |
| `src/pages/dogs/[id]/grid.astro` | 23–24 | Always fetches 30-day window; SSR resolves display window from cookie |
| `src/components/training-grid/window-options.ts` | 12–21 | `WINDOW_OPTIONS = [7,14,30]`, `isWindowDays` guard |

---

## Architecture Insights

### The "30-day anchor, variable display" design

The grid is built around a deliberate split:
- **Data layer (SSR, fixed):** Always fetches 30 days of ticks. Highlights are computed from this 30-day dataset.
- **Display layer (client, variable):** The 7/14/30d selector slices which date columns are shown. No re-fetch, no highlight recompute.

This choice is documented in two places (grid.astro comment, TrainingGrid JSDoc) and the plan.md (referenced but not read in this session). It implies that two elements with identical 30-day tick counts but different tick distributions within 7 days would show the same highlight — a deliberate product decision, not a bug.

### Synchronous optimistic highlight update

The decision to call `applyOptimisticTick` before `startTransition` (rather than inside it) makes the highlight colour change instant on tap, not deferred behind the pending network call. This mirrors the design intent: the grid is a real-time training aid; a handler cannot afford a visible "highlight lag" between tapping a cell and seeing the row colour update.

### `useOptimistic` + manual state split

The component uses both:
- `ticks` (plain `useState`) — the source of truth for `tickCounts`/`highlights`, updated synchronously via `applyOptimisticTick`.
- `optimisticChecked` (`useOptimistic` in TickCell) — the per-cell visual state, auto-reverts on failed transition.

This split means a cell failure reverts the checkbox visual AND triggers highlight recompute (via `applyOptimisticTick(elementId, date, !next)` in `handleToggle`'s catch). The design is internally consistent.

---

## Historical Context

The 3-tier algorithm was iteratively refined:

- **Phase 1 (research.md):** `context/changes/training-grid/research.md` (2026-06-17) — established that client-side highlight recalculation via a pure function was the right approach (no server round-trip needed). Initial specification was simpler.
- **`last_updated_note` in training-grid research.md:** "Tightened computeHighlights suppression threshold to >= half; introduced 3 tiers — n≤3 no highlights, 4≤n≤6 single-winner only (no ties), n≥7 full top-3/bottom-3 algorithm" — the tiers were added as refinements after the initial design.
- **Correction 5 (JSDoc in highlight.ts:29-35):** The rank-2/3 uniqueness guard was corrected on 2026-06-20 after identifying that the original "no tie expansion" wording was implemented as "just take the next array slot" — which arbitrarily promoted elements from a tied group. The `countFrequency` map was introduced to close this gap.

The 8-element incident was the event that revealed Correction 5 and prompted the current algorithm. It is now covered by the test at `highlight.test.ts:191`.

---

## Open Questions / Plan Inputs

The following questions are decision points for the Phase 2 plan:

### Q1 — Integration test layer for recalculation wiring

The test-plan calls for "integration (tick-toggle-triggers-recalculation wiring)." Given that the wiring is pure React state + useMemo (no API involvement), the cheapest approach is a **React Testing Library component test** of `TrainingGrid` (render with initial ticks, simulate a `change` event on a checkbox, assert the row's class list changes).

Alternatively, a **pure logic unit test** could verify that `tickCounts` and `highlights` recompute correctly after `applyTick`, without mounting the full component.

The plan should decide: RTL component test vs. pure logic unit test.

### Q2 — Scope of `dates.ts` unit tests

`getTrainingWindow` and `generateDateRange` need tests. Candidates:
- Exact startDate for each window (7, 14, 30 days)
- Date count (exactly N dates from `generateDateRange`)
- Cross-function consistency: `getTrainingWindow(30).startDate === generateDateRange(30, endDate)[0]`
- `isFutureUtcDate`: today → not future, tomorrow → future, boundary day (today) → not future
- Month boundary: window spanning a month boundary (e.g., July 1 − 30 = June 1, not June 2)
- February / leap year if feasible

### Q3 — `dates.test.ts` filename and location

`src/lib/dates.test.ts` — following the colocated pattern established by `src/lib/highlight.test.ts` (test-plan §6.1).

### Q4 — New test cases for highlight.test.ts (5 gaps)

See G1–G5 in §2. G1–G4 are Tier 3 cases worth adding. G5 (n=4 all-unique) rounds out Tier 2. All are pure unit tests extending the existing file.

### Q5 — Oracle discipline

The test-plan risk response warns against the "oracle problem" — asserting against the calculation's own output. All new tests must derive expected values from FR-007 and the tier rules, not from a `computeHighlights` call. The existing test file already does this correctly (hard-coded expected maps).

---

## Related Research

- [`context/changes/training-grid/research.md`](../training-grid/research.md) — original training-grid design research; Section 4 covers the highlight algorithm history; Correction 5 update note in frontmatter.
