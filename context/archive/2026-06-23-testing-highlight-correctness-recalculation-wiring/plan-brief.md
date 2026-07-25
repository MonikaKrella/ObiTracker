# Highlight Correctness & Recalculation Wiring — Plan Brief

> Full plan: `context/changes/testing-highlight-correctness-recalculation-wiring/plan.md`
> Research: `context/changes/testing-highlight-correctness-recalculation-wiring/research.md`

## What & Why

Phase 2 of the phased test rollout (`context/foundation/test-plan.md` §3). Covers Risks #2 and #5: the green/red highlight rule must be provably correct across all element-count and tie configurations (including the reported 8-element incident), and the rolling-window boundary math must be regression-protected. A design-invariant test is also added to machine-enforce the intentional architecture decision that highlight ranking always uses 30-day data, not the current display window.

## Starting Point

One test file exists — `src/lib/highlight.test.ts` — with 12 cases. The 8-element incident is already covered; five Tier 3 edge cases are not. Three date utilities in `src/lib/dates.ts` have zero coverage. The tick-toggle → highlight recalculation chain runs through two private functions in `TrainingGrid.tsx` that cannot be imported by tests in the current `environment: "node"` setup.

## Desired End State

`npm run test` passes across 18 highlight cases, 11 date-boundary cases, and ~10 training-grid helper and wiring cases. The three extracted helper functions live in `src/lib/training-grid-helpers.ts`. `TrainingGrid.tsx` behaviour is identical to today (pure refactor). The test suite now machine-enforces all three protection goals listed in the research.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| Integration test layer for wiring | Pure unit test on extracted helpers | No RTL/JSDOM setup needed; pure functions are already the testable surface the project uses | Plan |
| dates.test.ts scope | Comprehensive (boundary + month-turn + cross-function) | Month-turn arithmetic is the one case `setUTCDate` handles invisibly and could silently break if the formula changed | Plan |
| Design invariant test | Yes — one explicit unit test | The test-plan's own Risk #5 description assumed the opposite behaviour; a test is the clearest, most durable correction | Plan |
| Test file location | `src/lib/tests/` (new subdirectory; `highlight.test.ts` moves here too) | Keeps the three new test files together without cluttering the module root; vitest's default glob picks up `tests/` subdirectory automatically | Plan |
| Helper extraction file | `src/lib/training-grid-helpers.ts` | `applyTick` / `buildTicksByElement` / `buildTickCounts` are pure functions with no React dependencies; moving them out of the component is architecturally sound and required for `environment: "node"` testability | Plan |

## Scope

**In scope:**
- Move `src/lib/highlight.test.ts` → `src/lib/tests/highlight.test.ts`
- Add 6 missing highlight cases (G1–G5 Tier 3 + G5 Tier 2 happy-path)
- Create `src/lib/tests/dates.test.ts` (11 cases)
- Extract `applyTick`, `buildTicksByElement`, `buildTickCounts` from `TrainingGrid.tsx` → `src/lib/training-grid-helpers.ts`
- Create `src/lib/tests/training-grid.test.ts` (~10 cases including design invariant)

**Out of scope:**
- React Testing Library / JSDOM — vitest config stays `environment: "node"`
- Toggle API route tests (Phase 3 of overall rollout)
- Cross-account authorization tests (Phase 4)
- Visual or layout tests of any kind
- Any change to highlight algorithm or date utility logic

## Architecture / Approach

All test files import pure functions via relative paths — no path-alias resolution needed (`@/types` imports are `import type` only, stripped by esbuild). Phase 3 is the only phase that touches production code, and it is a pure refactor: `applyTick` and `buildTicksByElement` move from a private scope in `TrainingGrid.tsx` to an exported module; `buildTickCounts` is extracted from an inline `useMemo` body into the same module; `TrainingGrid.tsx` imports them back. Runtime behaviour is identical.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|----------------|----------|
| 1. Reorganise + extend highlight tests | `src/lib/tests/` created; 6 new Tier 3/2 cases; all 18 highlight cases green | Relative import path breaks after move (`./highlight` → `../highlight`) |
| 2. Date utility tests | 11 boundary cases for `getTrainingWindow`, `generateDateRange`, `isFutureUtcDate` | None — pure functions, no production changes |
| 3. Extract helpers + wiring tests | `training-grid-helpers.ts` extracted; `TrainingGrid.tsx` refactored; ~10 helper + invariant tests | react-compiler lint rule on the updated `useMemo`; must confirm `buildTickCounts` call is compiler-clean |

**Prerequisites:** Phases must run in order (Phase 1 creates the `tests/` directory; Phase 3 modifies production code last, after all pure-test phases are stable).  
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- `npm run test` exists and runs vitest — assumed from test-plan §6.1; verify before starting Phase 1.
- The react-compiler lint rule accepts a `buildTickCounts(elements, ticks)` call inside `useMemo` — it should (pure function, no side effects), but verify with `npm run lint` after Phase 3.
- `vitest`'s default `include` glob (`**/*.test.ts`) picks up `src/lib/tests/*.test.ts` without config changes — true for vitest ≥ 1.x; the project uses 4.1.9. ✓

## Success Criteria (Summary)

- `npm run test` exits 0 with all ~39 new + existing cases green
- `npm run build` succeeds after Phase 3 (production bundle identical)
- Ticking an element in `npm run dev` still updates highlight colours immediately, and switching the display window still leaves highlight colours unchanged
