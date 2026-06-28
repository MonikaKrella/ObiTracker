# Testing: Data Integrity at the API Layer — Plan Brief

> Full plan: `context/changes/testing-data-integrity-at-the-api-layer/plan.md`
> Research: `context/changes/testing-data-integrity-at-the-api-layer/research.md`

## What & Why

Phase 3 of the test-plan rollout adds integration tests for two risks that the existing 37 pure-function tests cannot cover: tick idempotency (Risk #3 — rapid duplicate taps producing a lost write or a duplicate row) and element-deletion cascade scope (Risk #6 — deleting one element leaking into a sibling's tick history). Both risks require asserting against actual persisted DB state, not just API response shapes.

## Starting Point

Vitest infrastructure exists (`npm run test`, `environment: "node"`, 37 passing tests), local Supabase is configured and running on port 54321, and `@supabase/supabase-js` is already in `dependencies`. What does not exist: any test that touches the DB. The existing Supabase client (`src/lib/supabase.ts`) is Astro SSR-specific and cannot be imported in Vitest — Phase 3 must build its own test client.

## Desired End State

`npm run test` passes with 40 tests. Three new integration tests exercise the real local DB: a happy-path tick/untick baseline, a concurrent-duplicate toggle that proves the `UNIQUE(element_id, trained_on)` constraint prevents duplicate rows, and an element-deletion test that proves the FK `ON DELETE CASCADE` is scoped to `element_id` only (not `dog_id`). After each test, a single `userCleanup()` call cascades through `auth.users → dogs → training_elements → training_logs`, leaving no orphan rows.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test layer | Service functions directly (no Astro HTTP server) | Faster, no server fixture, and the DB-integrity risks are fully exercised at the service layer | Research / Plan |
| Test isolation | Per-test teardown (`afterEach` → `userCleanup()`) | Keeps local Supabase running between runs; deleting the test user cascades everything | Plan |
| Concurrency shape | `Promise.all([toggle, toggle])` — truly concurrent | Sequential calls don't contend the DB constraint; the race is the point | Plan |
| Test helper scope | Shared file `src/lib/tests/helpers/db.ts` | Phase 4 needs the same admin client + user creation + seeding setup; extract now to avoid duplication later | Plan |
| Test count | 3 tests (happy-path + Risk #3 + Risk #6) | Happy-path isolates harness failures from risk-scenario failures; the two risk tests are exactly what the test plan calls for | Plan |
| CI integration | Deferred | Needs a GitHub Actions Supabase setup that is out of scope for Phase 3 | Plan |

## Scope

**In scope:**
- `SUPABASE_SERVICE_ROLE_KEY` added to `.env` and `.env.example`
- `src/lib/tests/helpers/db.ts` — `createAdminClient`, `createTestUser`, `seedDog`, `seedElement`
- `src/lib/tests/data-integrity.test.ts` — 3 integration tests

**Out of scope:**
- HTTP-layer tests (no `wrangler dev` server fixture)
- CI pipeline changes
- 401 / input-validation tests (different risk)
- Any mocking of the Supabase client

## Architecture / Approach

Each test uses two Supabase clients: an **admin client** (service-role key, bypasses RLS) for seeding and count-verification, and an **authClient** (anon key + real user JWT in `Authorization` header) for calling `toggleTrainingLog` and `deleteTrainingElement` as an authenticated user. Test users are created via `admin.auth.admin.createUser()`, then signed in via a separate anon client to get the JWT — the admin client's own auth context is service-role and cannot produce user-scoped tokens.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Test harness | Env var for service-role key + `src/lib/tests/helpers/db.ts` with four building-block helpers | Helper signatures are wrong and tests can't compile — verify with `npx tsc --noEmit` |
| 2. Integration tests | `data-integrity.test.ts` with 3 test cases; `npm run test` passes with 40 | Tests fail due to Supabase not running locally, or teardown leaves orphan rows |

**Prerequisites:** Local Supabase must be running (`npx supabase start`). Service-role key must be in `.env` (from `npx supabase status`).  
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The `Promise.all` concurrent toggle test is non-deterministic in *which* call wins, but deterministic in *what the final DB state is* (count ≤ 1). The assertion is structured around DB state, not return-value order.
- Deleting a `auth.users` row cascades to `dogs` (via `account_id FK CASCADE`) and then to `training_elements` and `training_logs`. If a migration ever breaks that cascade chain, `afterEach` cleanup will leave orphan rows — the manual verification step catches this.
- CI integration is deferred; until it lands, integration tests only run locally with `npx supabase start`.

## Success Criteria (Summary)

- `npm run test` → 40 passing (was 37), with local Supabase running
- No orphan rows in any table after a test run (verified manually via supabase studio)
- Second consecutive test run also passes (confirms teardown is idempotent)
