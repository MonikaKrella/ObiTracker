# Highlight Correctness & Recalculation Wiring — Test Phase 2 Implementation Plan

## Overview

Add the missing automated test coverage for Risks #2 and #5 from the test-plan (§2, §3 Phase 2). This means: filling the five identified Tier 3 highlight edge-case gaps, adding comprehensive boundary tests for the date-window utilities, extracting two private helpers and one inline formula out of `TrainingGrid.tsx` so they can be unit-tested, and asserting the "highlights always use 30-day data regardless of display window" design invariant.

## Current State Analysis

One test file exists: `src/lib/highlight.test.ts` with 12 cases. It covers the reported 8-element incident (added as Correction 5) and the Tier 1/2 boundaries. Five Tier 3 edge cases are missing (G1–G5 — see research §2). Three date utilities in `src/lib/dates.ts` have zero coverage. The tick-toggle → highlight recalculation wiring is untested. `src/lib/training-grid-helpers.ts` does not exist yet.

## Desired End State

`npm run test` passes with all new test cases. The test suite protects against:
- Incorrect highlights for any Tier 3 tie configuration, suppression edge, or Tier 2 happy-path
- Off-by-one or UTC-offset errors in rolling-window boundary math
- Accidental future changes that make highlight ranking sensitive to the display window (currently always 30-day)
- Regressions in `applyTick` or the tick-count counting formula

Verifiable by: `npm run test` exits 0, `npm run lint` passes, and the training grid still behaves identically in `npm run dev` (Phase 3 is a pure refactor — no user-visible change).

### Key Discoveries

- `src/lib/highlight.test.ts:191` — the 8-element incident is already covered; G1–G5 are the remaining gaps (research §2)
- `src/components/training-grid/TrainingGrid.tsx:109-119` — `tickCounts` useMemo counts `dateSet.size` (all 30-day ticks), never a window-filtered count — this is intentional and documented in the JSDoc
- `src/components/training-grid/TrainingGrid.tsx:135` — `applyOptimisticTick` is called synchronously before `startTransition`, making highlight updates immediate on tap
- `vitest.config.ts` — `environment: "node"`, no path-alias resolution; test-importable modules must only use `import type` for `@/` paths (esbuild strips them)
- `applyTick` and `buildTicksByElement` are private, unexported functions in `TrainingGrid.tsx` — they must be extracted to `src/lib/training-grid-helpers.ts` before they can be tested; the component then imports them from there

## What We're NOT Doing

- No React Testing Library or JSDOM setup — the vitest config stays `environment: "node"` throughout
- No tests on `TrainingGrid.tsx`'s rendered output (JSX, CSS classes) — the wiring tests cover only the pure-function layer
- No changes to the highlight algorithm or date utilities — this is test coverage only (plus the Phase 3 refactor which moves code without changing it)
- No test for the display-window column-slicing (`visibleDates = dates.slice(-selectedWindow)`) — that is a trivial `Array.prototype.slice` call with no business logic
- No coverage of the toggle API route or `toggleTrainingLog` service — those are Phase 3 of the overall test-plan rollout (data integrity), not this change

## Implementation Approach

Three sequential phases, each ending with a passing `npm run test`. Phase 1 reorganises the test directory and fills the highlight gaps. Phase 2 adds the date utility tests. Phase 3 is the only phase that touches production code (a pure refactor — no behaviour change), extracting three private helpers before testing them.

## Critical Implementation Details

**vitest path-alias constraint.** `vitest.config.ts` has no `resolve.alias` configuration. Any `@/...` import that resolves to a runtime value will fail. All test-importable modules in `src/lib/` must use `import type` exclusively for `@/types` imports (esbuild strips type-only imports). Verify this before adding any new import to `training-grid-helpers.ts`.

**`highlight.test.ts` relative import after move.** The current file has `import { computeHighlights } from "./highlight"`. After the file moves to `src/lib/tests/highlight.test.ts`, that import must become `"../highlight"`. The `import type { TrainingElement } from "@/types"` line stays unchanged (esbuild-stripped).

**`applyTick` must be moved, not duplicated.** Do not export it from `TrainingGrid.tsx` while keeping the definition there — move the definition entirely to `training-grid-helpers.ts` and import it back into `TrainingGrid.tsx`. Duplication would let them drift.

**React compiler constraint on useMemo.** The `tickCounts` useMemo body can call `buildTickCounts(elements, ticks)` once the function is extracted — a pure-function call inside useMemo is compiler-clean. Do not add any side effects.

---

## Phase 1: Reorganise Test Directory and Extend Highlight Tests

### Overview

Create `src/lib/tests/`, relocate the existing test file there (updating its import path), and add the six cases identified in research (G1–G5 Tier 3 + G5 Tier 2 happy-path). No production code changes in this phase.

### Changes Required

#### 1. Move `src/lib/highlight.test.ts` → `src/lib/tests/highlight.test.ts`

**File**: `src/lib/tests/highlight.test.ts` *(new path; old file is deleted)*

**Intent**: Relocate the test file into the `src/lib/tests/` directory that will hold all three test files for this change. The `tests/` subdirectory keeps test files out of the module root without breaking vitest's default glob (`**/*.test.ts`).

**Contract**: Update the module import on line 3 from `"./highlight"` to `"../highlight"`. The `import type { TrainingElement } from "@/types"` line is unchanged. All 12 existing tests continue to pass.

#### 2. Add six missing test cases to `src/lib/tests/highlight.test.ts`

**File**: `src/lib/tests/highlight.test.ts`

**Intent**: Cover the five Tier 3 edge cases (G1–G5) identified in the research coverage gap table, plus one Tier 2 happy-path case omitted from the original test file.

**Contract**: Append six new `it(...)` blocks inside the existing `describe("computeHighlights", ...)` block, each with hard-coded expected output derived independently from FR-007 and the tier rules (never from calling `computeHighlights` to generate the expectation — see test-plan oracle discipline):

- **G1** `n=7, A=B=5 (rank-1 2-way tie), C=4, D=3, E=2, F=1, G=0` — greenSet expands to {A,B} then fills rank-2 (C, unique) → 3 green; red fills normally → A=green, B=green, C=green, D=null, E=red, F=red, G=red. Verifies rank-1 tie expansion in non-suppressed Tier 3.
- **G2** `n=7, A=7, B=6, C=5, D=4, E=3, F=1, G=1 (rank-last 2-way tie)` — redSet expands to {F,G} then fills rank-2-from-last (E, unique) → 3 red; green fills normally → A=green, B=green, C=green, D=null, E=red, F=red, G=red. Verifies red-side rank-last tie expansion.
- **G3** `n=7, A=7, B=C=5 (tied at rank-2, freq=2), D=4, E=3, F=2, G=1` — rank-2 slot skipped (freq≠1); rank-3 check still points at B (g not incremented), also skipped → greenSet={A} only; red fills normally → A=green, B=null, C=null, D=null, E=red, F=red, G=red. Verifies Correction-5 rank-2/3 uniqueness guard.
- **G4** `n=8, all elements at 0 ticks` — rank-1 tie: all 8 → greenSet.size=8, 8×2≥8 → suppressed; rank-last tie: all 8 → redSet.size=8 → suppressed → all null. Verifies Tier 3 all-equal suppression path.
- **G5** `n=4, A=5, B=4, C=3, D=2 (all unique)` — Tier 2: topIsUnique → green=A; bottomIsUnique → red=D → A=green, B=null, C=null, D=red. Verifies Tier 2 happy-path with a unique winner (the only n=4 test today has ties at both ends).

### Success Criteria

#### Automated Verification

- `npm run test` passes (all existing + 6 new cases green)
- `npm run lint` passes
- `npm run build` succeeds (production code untouched)

#### Manual Verification

- Confirm no existing test was accidentally modified by scanning the 12 original `it(...)` descriptions — they must be byte-for-byte identical

**Implementation Note**: After this phase passes all automated checks and the manual confirmation above, proceed to Phase 2.

---

## Phase 2: Date Utility Tests

### Overview

Create `src/lib/tests/dates.test.ts` with comprehensive boundary coverage for the three date utilities: `getTrainingWindow`, `generateDateRange`, and `isFutureUtcDate`. No production code changes.

### Changes Required

#### 1. Create `src/lib/tests/dates.test.ts`

**File**: `src/lib/tests/dates.test.ts` *(new file)*

**Intent**: Regression-protect the rolling-window boundary math that Risk #5 depends on. The research confirmed the implementation is correct analytically; this phase converts that analysis into machine-enforced assertions.

**Contract**: Import `{ getTrainingWindow, generateDateRange, isFutureUtcDate }` from `"../dates"` (relative, no `@/` alias needed — these functions take primitives). Implement the following test cases, grouped into three `describe` blocks:

**`describe("getTrainingWindow")`:**

- `windowDays=7, today=2026-06-25` → `startDate="2026-06-19"`, `endDate="2026-06-25"`. Today is the last day of the 7-day window; start is today minus 6 days (formula: `today − (windowDays − 1)`).
- `windowDays=14, today=2026-06-25` → `startDate="2026-06-12"`, `endDate="2026-06-25"`. Verifies the 14-day variant without a dedicated arithmetic check.
- `windowDays=30, today=2026-06-25` → `startDate="2026-05-27"`, `endDate="2026-06-25"`. The standard production case.
- Month boundary: `windowDays=7, today=2026-07-03T00:00:00Z` → `startDate="2026-06-27"`. Verifies `setUTCDate` correctly handles a window that crosses a month turn (June 27 is the right answer, not June 28 from an off-by-one).

**`describe("generateDateRange")`:**

- `windowDays=7, today="2026-06-25"` → array length 7, first element `"2026-06-19"`, last element `"2026-06-25"`. Confirms inclusive-end, correct count.
- `windowDays=30, today="2026-06-25"` → array length 30. Confirms the production window generates exactly 30 dates.
- Month boundary: `windowDays=7, today="2026-07-03"` → first element `"2026-06-27"`. Symmetric check to `getTrainingWindow`'s month-boundary case.
- Cross-function consistency: for `windowDays=30` and `today=new Date("2026-06-25T00:00:00Z")`, assert `generateDateRange(30, getTrainingWindow(30, today).endDate)[0] === getTrainingWindow(30, today).startDate`. The two functions must agree on the window's oldest date, since `grid.astro` feeds the output of one into the other.

**`describe("isFutureUtcDate")`:**

- `dateStr="2026-06-26"` (tomorrow relative to today `2026-06-25`) → `true`.
- `dateStr="2026-06-25"` (today) → `false`. Today is not a future date (strict `>` comparison).
- `dateStr="2026-06-24"` (yesterday) → `false`.

### Success Criteria

#### Automated Verification

- `npm run test` passes (all Phase 1 cases + 11 new date cases green)
- `npm run lint` passes

#### Manual Verification

- No test in this file imports any `@/` path as a value import — all `@/` aliases must be `import type` only (per vitest constraint)

**Implementation Note**: After this phase passes, proceed to Phase 3.

---

## Phase 3: Extract Training-Grid Helpers and Wiring Tests

### Overview

Extract three pure functions from `TrainingGrid.tsx` into a new `src/lib/training-grid-helpers.ts` module so they can be unit-tested without React or JSDOM. Update `TrainingGrid.tsx` to import from the new module (no behaviour change). Write tests for the helpers and for the "highlights always use 30-day data" design invariant.

### Changes Required

#### 1. Create `src/lib/training-grid-helpers.ts`

**File**: `src/lib/training-grid-helpers.ts` *(new file)*

**Intent**: House the three pure, React-free functions that the `TrainingGrid` component uses for tick-state management and count computation. Extracting them here makes them unit-testable under the existing vitest `environment: "node"` setup.

**Contract**: Export three functions. All `@/types` imports must be `import type` (esbuild-stripped):

- `applyTick(prev: Map<string, Set<string>>, elementId: string, date: string, checked: boolean): Map<string, Set<string>>` — current private function in `TrainingGrid.tsx:40-49`. Returns a new Map reference (immutable pattern).
- `buildTicksByElement(elements: TrainingElement[], initialTicks: Pick<TrainingLog, "element_id" | "trained_on">[]): Map<string, Set<string>>` — current private function in `TrainingGrid.tsx:29-38`. Initialises empty Sets for every element, then populates from the initial ticks array.
- `buildTickCounts(elements: TrainingElement[], ticks: Map<string, Set<string>>): Map<string, number>` — extracted from the inline `useMemo` body in `TrainingGrid.tsx:109-117`. For each element, writes `dateSet.size` (counts all ticks across all dates in the Set, never filtered by a display window).

#### 2. Update `src/components/training-grid/TrainingGrid.tsx`

**File**: `src/components/training-grid/TrainingGrid.tsx`

**Intent**: Replace the private function definitions and the inline useMemo body with imports from `training-grid-helpers.ts`. This is a pure refactor — no logic change, no API change, no user-visible change.

**Contract**:
- Remove the `applyTick` and `buildTicksByElement` function definitions (lines 29–49).
- Add `import { applyTick, buildTicksByElement, buildTickCounts } from "@/lib/training-grid-helpers"`.
- The `tickCounts` useMemo body (lines 109–117) is replaced with a call to `buildTickCounts(elements, ticks)`. The `[elements, ticks]` dependency array is unchanged.
- The `applyOptimisticTick` function body continues to call `applyTick` — now imported rather than locally defined.
- `buildTicksByElement` continues to be called in `useState`'s initialiser — unchanged call-site.

#### 3. Create `src/lib/tests/training-grid.test.ts`

**File**: `src/lib/tests/training-grid.test.ts` *(new file)*

**Intent**: Test the three extracted helpers and assert the design invariant that `buildTickCounts` is window-agnostic (counts all ticks, never a display-window-filtered subset). Each test uses only plain Map/Set operations — no React, no component mounting.

**Contract**: Import `{ applyTick, buildTicksByElement, buildTickCounts }` from `"../training-grid-helpers"`. `import type { TrainingElement, TrainingLog }` from `"@/types"` is safe (esbuild-stripped). Use a helper `makeElement(id: string): TrainingElement` analogous to `makeElements` in `highlight.test.ts`.

Implement the following test cases:

**`describe("applyTick")`:**

- Calling with `checked=true` adds the date to the element's Set. The returned map is a new reference (not the same object as `prev`).
- Calling with `checked=false` removes the date from the element's Set.
- Calling on an element that has no entry in the map (missing key) does not throw and leaves other elements unchanged.

**`describe("buildTicksByElement")`:**

- Given two elements and an empty `initialTicks`, both elements map to an empty Set.
- Given two elements and ticks for one of them, that element's Set contains the ticked dates and the other element's Set is empty.
- A tick for an unknown element ID (not in the elements list) is silently ignored (the `?.add()` optional chain guard in the original function).

**`describe("buildTickCounts")`:**

- Basic: two elements, one with 3 ticks and one with 0 → returned map has `{ "elem-a": 3, "elem-b": 0 }`.
- Elements absent from the ticks map default to 0 (the initialiser `elements.map((e) => [e.id, 0])`).

**`describe("design invariant: buildTickCounts is window-agnostic")`:**

- Set up one element whose ticks Set contains 30 distinct date strings (full 30-day window).
- Compute `buildTickCounts` → result is 30.
- Compute the window-sensitive alternative (count only the dates that fall within a 7-day slice of those same 30 dates) → result is 7.
- Assert the two values differ, confirming that `buildTickCounts` uses `dateSet.size` (30) rather than a filtered count (7). This test documents the intentional design decision: the display window never affects highlight ranking.

#### 4. Update `vitest.config.ts` comment

**File**: `vitest.config.ts`

**Intent**: Keep the explanatory comment accurate — it currently names only `highlight.ts` and `dates.ts` as tested modules. Extend it to cover `training-grid-helpers.ts`.

**Contract**: Append `src/lib/training-grid-helpers.ts` to the listed tested modules in the inline comment. No functional change to the config.

### Success Criteria

#### Automated Verification

- `npm run test` passes (all prior cases + new helper + wiring + invariant tests green)
- `npm run lint` passes (react-compiler rule must not flag the updated useMemo)
- `npm run build` succeeds (production bundle unchanged — same exports, same runtime behaviour)

#### Manual Verification

- Open the training grid in `npm run dev`; tick and untick several elements and confirm highlight colours update immediately on tap (no regression from the refactor)
- Switch between 7d / 14d / 30d windows; confirm highlight colours do not change when switching (window-agnostic design is preserved)
- Confirm no `@/` value import was introduced in `training-grid-helpers.ts` by inspecting its import block

**Implementation Note**: After all automated checks pass and the manual verifications above confirm no regression, this phase — and the change — is complete.

---

## Testing Strategy

### Unit Tests

- **highlight algorithm**: 12 existing + 6 new = 18 cases across Tier 1, Tier 2, and Tier 3, including all identified boundary and tie configurations
- **date utilities**: 11 cases covering all three functions, window boundaries for 7/14/30d, month-turn arithmetic, and cross-function consistency
- **training-grid helpers**: ~10 cases covering `applyTick`, `buildTicksByElement`, `buildTickCounts`, and the window-agnostic design invariant

### Integration Tests

Not in scope for this phase. The integration layer (tick persistence, deletion cascade, cross-account authorization) is Phases 3–4 of the overall test-plan rollout.

### Manual Testing Steps

1. Run `npm run dev`, navigate to a dog's training grid with 7+ elements
2. Tick an element; confirm the row highlight colour updates immediately (no flicker or delay)
3. Untick the same element; confirm the colour reverts immediately
4. Switch between 7d, 14d, and 30d windows; confirm highlight colours do not change
5. Confirm the test command: `npm run test` — all cases green in terminal

---

## References

- Research: `context/changes/testing-highlight-correctness-recalculation-wiring/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk #2, Risk #5), §3 Phase 2, §6.1
- Highlight algorithm: `src/lib/highlight.ts`
- Existing tests (reference pattern): `src/lib/highlight.test.ts`
- Date utilities: `src/lib/dates.ts`
- Grid component (helper extraction source): `src/components/training-grid/TrainingGrid.tsx:29-49, 109-117`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reorganise Test Directory and Extend Highlight Tests

#### Automated

- [x] 1.1 `npm run test` passes (all 18 highlight cases green) — cc05cd5
- [x] 1.2 `npm run lint` passes — cc05cd5
- [x] 1.3 `npm run build` succeeds — cc05cd5

#### Manual

- [x] 1.4 Confirm 12 original `it(...)` descriptions are unchanged — cc05cd5

### Phase 2: Date Utility Tests

#### Automated

- [x] 2.1 `npm run test` passes (all prior + 11 date cases green) — a129648
- [x] 2.2 `npm run lint` passes — a129648

#### Manual

- [x] 2.3 Confirm no value import uses `@/` alias in `dates.test.ts` — a129648

### Phase 3: Extract Training-Grid Helpers and Wiring Tests

#### Automated

- [x] 3.1 `npm run test` passes (all prior + helper + invariant cases green)
- [x] 3.2 `npm run lint` passes (react-compiler rule passes on updated useMemo)
- [x] 3.3 `npm run build` succeeds

#### Manual

- [x] 3.4 Tick and untick elements in `npm run dev`; highlight updates immediately
- [x] 3.5 Switch 7d/14d/30d windows; highlight colours are unchanged
- [x] 3.6 Confirm no `@/` value import in `training-grid-helpers.ts`
