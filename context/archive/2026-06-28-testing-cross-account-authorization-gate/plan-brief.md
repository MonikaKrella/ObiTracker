# Cross-Account Authorization Gate — Plan Brief

> Full plan: `context/changes/testing-cross-account-authorization-gate/plan.md`
> Research: `context/changes/testing-cross-account-authorization-gate/research.md`

## What & Why

Prove that a valid authenticated session for Account B cannot read or mutate Account A's dogs, training elements, or training logs. This is Risk #4 from the test plan: the system has no OAuth, no sharing, no multi-user access to a dog's data — the gate must hold at the service layer for every dog-scoped operation.

## Starting Point

Phase 3 shipped a working two-client integration test harness (`src/lib/tests/helpers/db.ts`: `createAdminClient`, `createTestUser`, `seedDog`, `seedElement`) against a local Supabase instance. The research doc has already mapped all 6 dog-scoped routes, verified RLS policy correctness on all three tables, and predicted the exact expected behavior for every cross-account scenario — two throw `PostgrestError`, the remaining seven return null/false/[]/void.

## Desired End State

`src/lib/tests/cross-account-authorization.test.ts` exists with 9 passing tests, organized as `dogs` / `training elements` / `training logs`. Running `npm run test` shows 49 tests passing (up from 40). `test-plan.md §3` Phase 4 reads `complete`.

## Key Decisions Made

| Decision          | Choice                                                                        | Why (1 sentence)                                                                                                   | Source   |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| Test layer        | Service layer, not HTTP                                                       | Matches Phase 3 precedent; avoids the Astro dev server; RLS enforcement lives in the DB path                       | Research |
| Account lifecycle | Both users in one `beforeEach`                                                | Clean per-test isolation; avoids shared mutable state across tests                                                 | Plan     |
| Read coverage     | Include reads (getDogById, getTrainingElements, getTrainingLogs)              | Risk #4 says "read or modify" — reads are in scope                                                                 | Plan     |
| Reorder assertion | Verify DB sort_positions unchanged                                            | `reorderTrainingElements` returns void with no throw; "no throw" alone can't distinguish block from silent success | Plan     |
| Throw assertions  | `rejects.toBeDefined()` / `rejects.toThrow()` — no Postgrest error code check | Error codes vary between local and hosted Supabase; the essential contract is "throws, not silently succeeds"      | Plan     |
| Test grouping     | One describe, three nested by resource type                                   | Mirrors the risk definition (dog/element/log) and surfaces coverage gaps at a glance                               | Plan     |

## Scope

**In scope:**

- 9 service-function scenarios across all 6 dog-scoped routes
- Two-account lifecycle: `beforeEach` creates both users; `afterEach` cleans both
- `sort_position` inline seeding for the reorder test
- Documentation: test-plan.md status + §6.5 Phase 4 notes

**Out of scope:**

- Unauthenticated (no-session) 401 path — different failure mode, not Risk #4
- HTTP-layer assertions on API routes — service layer is sufficient
- Anon EXECUTE gap on `soft_delete_dog` / `reorder_training_elements` RPCs — schema hygiene, not Phase 4 scope
- New helpers to `db.ts` — existing four exports are enough

## Architecture / Approach

One test file extends the Phase 3 pattern to two accounts. The admin client seeds Account A's data and verifies DB state (count queries, sort_position reads). `authClientB` (Account B's JWT-scoped client) is the attacker. All service calls go through `authClientB` targeting Account A's resource IDs. The `sort_position` edge case requires the reorder test to do its own inline element inserts (with explicit `sort_position: 1` and `2`) instead of using `seedElement`, because `seedElement` doesn't expose the column and its default of `0` would make "unchanged" impossible to distinguish.

## Phases at a Glance

| Phase                              | What it delivers                                            | Key risk                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Cross-account integration tests | 9 passing tests, two-account lifecycle                      | `sort_position DEFAULT 0` gotcha on the reorder test; `toggleTrainingLog` must receive `userBId` as `accountId` |
| 2. Documentation update            | test-plan.md Phase 4 complete; §6.5 notes; change.md status | None — mechanical update                                                                                        |

**Prerequisites:** Local Supabase running (`npx supabase start`); `.env` with `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- The 9 behavioral predictions in research §5 are derived from reading migrations and service code — not from running the tests against live DB. If RLS policy syntax has a subtle bug not caught by reading, a test could fail unexpectedly. The sanity-falsify manual step (Phase 1 verification step 1.5) is the backstop.
- `toggleTrainingLog` throws `PostgrestError` rather than returning a sentinel — the `rejects` assertion style must be used. If a future refactor changes it to return a sentinel instead, the assertion style needs updating.

## Success Criteria (Summary)

- `npm run test` shows 49 passing (all 9 new tests green)
- Every cross-account scenario for all 6 dog-scoped routes is explicitly asserted — no route left as "covered by inference"
- `test-plan.md §3` Phase 4 status is `complete`
