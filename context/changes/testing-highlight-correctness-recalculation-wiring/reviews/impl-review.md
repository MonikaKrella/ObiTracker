<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Highlight Correctness & Recalculation Wiring

- **Plan**: context/changes/testing-highlight-correctness-recalculation-wiring/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-28
- **Verdict**: APPROVED
- **Findings**: 0 critical | 0 warnings | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success Criteria

### Automated (all phases)
- ✅ `npm run test` → 37 tests across 3 files, all green
- ✅ `npm run lint` → passes (projectService warnings are pre-existing parser quirk)
- ✅ `npm run build` → succeeded in 26s

### Manual (from Progress section)
- ✅ 1.4 12 original `it(...)` descriptions confirmed unchanged
- ✅ 2.3 No `@/` value import in `dates.test.ts`
- ✅ 3.4 Tick/untick highlights update immediately
- ✅ 3.5 7d/14d/30d switch leaves highlights unchanged
- ✅ 3.6 No `@/` value import in `training-grid-helpers.ts`

## Findings

### F1 — Plan text says "six" new highlight cases but describes/implements five

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-highlight-correctness-recalculation-wiring/plan.md (Phase 1 intro paragraph)
- **Detail**: The plan's Phase 1 intro says "six new `it(...)` blocks" but the enumerated cases are G1–G5 (five). The implementation correctly implements all five described cases. The "six" is a counting error in the plan text — no missing case exists in the spec or the code.
- **Fix**: Change "Six new `it(...)` blocks" → "Five new `it(...)` blocks" in the plan's Phase 1 intro paragraph.
- **Decision**: FIXED — corrected "Six" → "Five" in plan.md Phase 1 intro paragraph

### F2 — `TrainingLog` absent from `import type` in training-grid.test.ts

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/tests/training-grid.test.ts:3
- **Detail**: Plan specified `import type { TrainingElement, TrainingLog }` from `"@/types"`. The file imports only `TrainingElement`. `TrainingLog` is never referenced in the test file — all tick fixtures use inline `Map<string, Set<string>>` types — so the omission is correct and the plan spec was overly prescriptive. Zero functional impact.
- **Fix**: Either accept as-is (the omission is correct), or add `TrainingLog` to the import type line if future tests need it.
- **Decision**: ACCEPTED — correct omission; TrainingLog unused in the file

### F3 — `applyTick` missing-key contract undocumented in both code and test

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/training-grid-helpers.ts:29–38 / src/lib/tests/training-grid.test.ts:33–48
- **Detail**: When `elementId` is not in `prev`, `applyTick` clones the Map, creates a fresh Set, optionally adds the date, and inserts the new Set under that key — a silent insertion. The test description says the call "does not throw and leaves other elements unchanged" but never asserts what happens to the missing key itself (a new entry IS created if `checked=true`). This is pre-existing behaviour extracted verbatim from the component; in production the missing-key path is never exercised (`buildTicksByElement` seeds all IDs first). But the test description and the actual contract don't fully agree.
- **Fix**: Add one assertion to the missing-key test: `expect(result.has("elem-missing")).toBe(true)` to document the actual insertion semantics, or add a defensive early-return guard in `applyTick` if the preferred contract is a true no-op: `if (!next.has(elementId)) return next;`
- **Decision**: SKIPPED — production path is unreachable; buildTicksByElement always seeds all IDs first
