# Cross-Account Authorization Gate — Implementation Plan

## Overview

Write integration tests that prove every dog-scoped API route denies cross-account access: a valid session for Account B cannot read or mutate Account A's dogs, training elements, or training logs. This covers Risk #4 from `context/foundation/test-plan.md §2`.

## Current State Analysis

The test harness from Phase 3 (`src/lib/tests/helpers/db.ts`) is fully reusable: `createAdminClient`, `createTestUser`, `seedDog`, and `seedElement` cover everything Phase 4 needs. `vitest.config.ts` already loads `.env` vars. No new helpers or config changes are required.

The service layer is the correct test surface (same rationale as Phase 3): service functions call `supabase.rpc` or `supabase.from(...)` using the caller's JWT-scoped client; RLS enforces ownership row-by-row. The research (§5) has already predicted the exact expected behavior for all 9 scenarios — two throw `PostgrestError` (RLS INSERT WITH CHECK failure), the rest return `null` / `false` / `[]` / void.

Phase 3 created a `beforeEach` + `afterEach` + `userCleanup()` lifecycle for one account. Phase 4 extends this to two accounts: userA ("victim", owns dogA and elements) and userB ("attacker", valid JWT, wrong ownership). The `afterEach` calls both `cleanupA()` and `cleanupB()`.

## Desired End State

`src/lib/tests/cross-account-authorization.test.ts` exists with 9 passing tests across three nested `describe` blocks (`dogs`, `training elements`, `training logs`). Running `npm run test` shows all tests green (currently 40 passing, target 49). `test-plan.md §3` Phase 4 status reads `complete`.

### Key Discoveries

- `sort_position` defaults to `0` for every element seeded without an explicit value (`supabase/migrations/20260530000002_create_training_elements.sql:9`). The reorder test cannot rely on `seedElement` — both elements would share `sort_position = 0`, making "unchanged" ambiguous. That test inserts elements inline with explicit values.
- `toggleTrainingLog`'s `accountId` parameter must be `userBId` (not `userAId`). The research §5 shows the cross-account attack path: DELETE returns 0 rows (RLS blocks), then INSERT is attempted with `account_id = B.id` — which fails the EXISTS dogs-ownership check. Using `userAId` here would not simulate the real attack.
- The two behavioral failure modes (null/false/[] vs throw) require different assertion strategies: direct value assertions for the former; `expect(fn()).rejects` for `createTrainingElement` and `toggleTrainingLog`.
- `reorderTrainingElements` returns `void` with no throw on cross-account call — assertions must query DB state, not inspect the return value.

## What We're NOT Doing

- Not testing the unauthenticated (no-session) path — the 401 gate is already exercised by existing test coverage and is a different failure mode than Risk #4.
- Not testing via HTTP (API routes) — service-layer calls are sufficient, match Phase 3 precedent, and avoid spinning up the Astro dev server.
- Not fixing the anon EXECUTE gap on `soft_delete_dog` / `reorder_training_elements` RPCs — noted as out-of-scope in research §3 and the lessons.md rule applies at implementation time, not test time.
- Not adding new helpers to `db.ts` — Phase 4 reuses the existing four exports without modification.

## Implementation Approach

Single test file following the Phase 3 structure: one top-level `describe`, nested `describe` blocks per resource type, all 9 `it()` cases, two-account lifecycle in `beforeEach`/`afterEach`. The reorder scenario gets inline element seeding (explicit `sort_position` values) rather than relying on `seedElement`.

## Critical Implementation Details

**`sort_position DEFAULT 0` breaks the reorder test.** `seedElement` doesn't expose `sort_position`, and the column defaults to `0`. If two elements are seeded without explicit positions, both have `sort_position = 0` — verifying "unchanged" after the cross-account reorder attempt would be trivially true regardless of whether the block worked. The reorder test must insert its two elements directly via `admin.from("training_elements").insert([...])` with values like `{ dog_id, name, sort_position: 1 }` and `{ ..., sort_position: 2 }`, then assert those values are still `1` and `2` in the DB after the cross-account reorder call.

**`toggleTrainingLog` `accountId` must be `userBId`.** The service function signature is `toggleTrainingLog(supabase, dogId, elementId, accountId, date)`. In the real handler, `accountId` comes from `context.locals.user.id` — the JWT owner. To simulate Account B attacking Account A, pass `userBId` as `accountId`. This triggers the attack path the research describes: DELETE returns 0 rows (log.account_id = A ≠ B), then INSERT with `account_id = B` fails the dogs-ownership EXISTS check.

---

## Phase 1: Cross-Account Integration Tests

### Overview

Create `src/lib/tests/cross-account-authorization.test.ts` with a two-account lifecycle and 9 test cases. No changes to existing files in this phase.

### Changes Required

#### 1. Cross-account test file

**File**: `src/lib/tests/cross-account-authorization.test.ts`

**Intent**: Prove that Account B's authenticated client cannot read or mutate any of Account A's dog-scoped resources. Each test calls a service function with `authClientB` targeting `dogAId` or `elementAId`, then asserts the expected denial behavior.

**Contract**: Top-level `describe("cross-account authorization (Risk #4)")`. `beforeEach` creates admin client, creates userA and userB via `createTestUser(admin)`, seeds `dogAId` under userA, seeds one element (`elementAId`) under dogA via `seedElement`. `afterEach` calls `cleanupA()` and `cleanupB()`. Three nested `describe` blocks:

- `"dogs"`: 2 tests — `getDogById` returns `null`; `softDeleteDog` returns `false`
- `"training elements"`: 5 tests — `getTrainingElements` returns `[]`; `createTrainingElement` rejects; `renameTrainingElement` returns `null`; `deleteTrainingElement` returns `false`; `reorderTrainingElements` is a no-op (DB sort_positions unchanged — inline element seeding with explicit positions)
- `"training logs"`: 2 tests — `getTrainingLogs` returns `[]`; `toggleTrainingLog` rejects

For scenarios that throw (`createTrainingElement`, `toggleTrainingLog`): use `await expect(promise).rejects.toBeDefined()` or `rejects.toThrow()` — do not assert a specific Postgrest error code.

For the reorder test: insert two elements via `admin.from("training_elements").insert([...])` with `sort_position: 1` and `sort_position: 2`; call `reorderTrainingElements(authClientB, dogAId, [elementId2, elementId1])`; then use the admin client to select `sort_position` for both elements and assert they equal `1` and `2` respectively.

Imports: `getDogById`, `softDeleteDog` from `"../services/dogs"`; `getTrainingElements`, `createTrainingElement`, `renameTrainingElement`, `deleteTrainingElement`, `reorderTrainingElements` from `"../services/training-elements"`; `getTrainingLogs`, `toggleTrainingLog` from `"../services/training-logs"`; `createAdminClient`, `createTestUser`, `seedDog`, `seedElement` from `"./helpers/db"`. All value imports use relative paths (no `@/` aliases in test files — see test-plan.md §6.1).

### Success Criteria

#### Automated Verification

- All 49 tests pass (40 prior + 9 new): `npm run test`
- No lint errors: `npm run lint`

#### Manual Verification

- Local Supabase must be running before the test run: `npx supabase status` confirms the local instance is active
- Confirm 9 new tests appear in the output, grouped under `cross-account authorization (Risk #4)` > `dogs` / `training elements` / `training logs`
- Temporarily change one assertion to the wrong expected value (e.g. expect `getDogById` to return a dog object) — confirm the test fails, proving it is testing RLS behavior and not a vacuously-passing assertion

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Documentation Update

### Overview

Update `test-plan.md` to mark Phase 4 complete and record key decisions, and update `change.md` status.

### Changes Required

#### 1. Test plan Phase 4 status

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that Phase 4 is shipped — update the rollout table status, the passing-test count, and add a Phase 4 entry to §6.5 so future readers can understand what was built and why.

**Contract**: In §3 rollout table, change Phase 4 status from `researched` to `complete`. In §4 Stack table, update Vitest test count from `40 passing` to `49 passing`. In §6.5, add a new `#### Phase 4 — Cross-account authorization gate` subsection documenting: what was built (the test file + two-account pattern), key design decisions (service layer; both accounts in `beforeEach`; `sort_position` inline seeding for reorder; `rejects.toBeDefined()` for throw scenarios; no code-specific error assertions).

#### 2. Change metadata

**File**: `context/changes/testing-cross-account-authorization-gate/change.md`

**Intent**: Advance the change status to `complete` and record the completion date.

**Contract**: Set `status: complete` and `updated: 2026-07-18`.

### Success Criteria

#### Automated Verification

- No lint errors on updated markdown files: `npm run lint`

#### Manual Verification

- `test-plan.md §3` shows Phase 4 with status `complete`
- `test-plan.md §4` shows the correct updated test count
- `test-plan.md §6.5` contains a Phase 4 section with the key decisions listed

---

## Testing Strategy

### Integration Tests

- All 9 scenarios in `src/lib/tests/cross-account-authorization.test.ts`
- Two-account lifecycle: both created in `beforeEach`, both cleaned in `afterEach`
- Admin client used for seeding and DB-state verification (count queries, sort_position queries)
- Auth client B used for all service calls under test

### Manual Testing Steps

1. Run `npx supabase status` — confirm local instance is up
2. Run `npm run test` — confirm 49 tests pass
3. Sanity-falsify one assertion (e.g. `expect(result).toBeNull()` → `expect(result).not.toBeNull()`) — confirm test fails correctly, then revert

## References

- Research: `context/changes/testing-cross-account-authorization-gate/research.md`
- Phase 3 test pattern: `src/lib/tests/data-integrity.test.ts`
- Shared helpers: `src/lib/tests/helpers/db.ts`
- Risk definition: `context/foundation/test-plan.md §2 Risk #4`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cross-Account Integration Tests

#### Automated

- [x] 1.1 All 49 tests pass: `npm run test`
- [x] 1.2 No lint errors: `npm run lint`

#### Manual

- [ ] 1.3 Local Supabase confirmed running before test run
- [ ] 1.4 9 new tests visible in output, grouped under the correct describe hierarchy
- [ ] 1.5 Sanity-falsify check: one assertion deliberately broken, test fails, then reverted

### Phase 2: Documentation Update

#### Automated

- [ ] 2.1 No lint errors on updated markdown: `npm run lint`

#### Manual

- [ ] 2.2 §3 Phase 4 status reads `complete`
- [ ] 2.3 §4 test count updated to 49 passing
- [ ] 2.4 §6.5 Phase 4 section present with key decisions recorded
