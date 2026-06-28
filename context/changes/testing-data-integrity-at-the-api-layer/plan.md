# Testing: Data Integrity at the API Layer — Implementation Plan

## Overview

Adds three integration tests for Risks #3 and #6 from the test-plan Phase 3 rollout. Tests call service functions directly (no Astro dev server), use per-test teardown via a `userCleanup()` function that cascades through the entire ownership chain, and are backed by a shared helper file (`src/lib/tests/helpers/db.ts`) that Phase 4 can import without duplication.

## Current State Analysis

- **37 existing tests** pass via `npm run test`; all are pure-function (no DB, no HTTP)
- **No test Supabase client** exists — `src/lib/supabase.ts` is Astro SSR-specific (`AstroCookies` dependency) and cannot be imported in Vitest
- **Local Supabase is configured**: `supabase/config.toml` present, API on `http://127.0.0.1:54321`, all migrations apply via `npx supabase db reset`
- **`@supabase/supabase-js` is already a direct dependency** — `package.json:27` (`^2.99.1`); no new npm install needed
- **`SUPABASE_KEY`** (anon key) is in `.env`; **`SUPABASE_SERVICE_ROLE_KEY`** is not — must be added
- **`SUPABASE_URL`** is in `.env` pointing at `http://127.0.0.1:54321`
- Idempotency gate: `UNIQUE(element_id, trained_on)` on `training_logs`; service translates Postgres error `23505` → DELETE (untick)
- Cascade scope: `training_logs.element_id REFERENCES training_elements(id) ON DELETE CASCADE` — per element only; sibling elements' logs are not touched

## Desired End State

`npm run test` passes with **40 tests** (37 + 3 new) when local Supabase is running. The three new tests:

1. **Happy-path baseline**: sequential tick → assert 1 log row → untick → assert 0 log rows
2. **Risk #3 guard**: `Promise.all([toggle, toggle])` results in one `"ticked"` + one `"unticked"`; the log row count is never 2
3. **Risk #6 guard**: seed elements A and B with one log each; delete element A; assert A's logs are gone and B's logs survive

After each test, no orphan rows remain in `training_logs`, `training_elements`, `dogs`, or `auth.users`.

### Key Discoveries

- `toggleTrainingLog(supabase, dogId, elementId, accountId, trainedOn)` → `Promise<"ticked" | "unticked">` — `src/lib/services/training-logs.ts:40`
- `deleteTrainingElement(supabase, dogId, elementId)` → `Promise<boolean>` — `src/lib/services/training-elements.ts:123`
- `dogs` table: `{ account_id, name }` are the only required insert fields; `id`, `created_at`, `updated_at` default; `is_deleted` defaults `FALSE` — `supabase/migrations/20260530000001_create_dogs.sql`
- `training_elements` table: `{ dog_id, name, sort_position }` required (no `account_id` column; RLS checks dog ownership via EXISTS) — `supabase/migrations/20260530000002_create_training_elements.sql`
- Admin client (service-role) bypasses RLS — the correct choice for seeding and count-verification queries
- `import type` from `@supabase/supabase-js` is a direct npm package (not a `@/` alias) — safe in Vitest

## What We're NOT Doing

- No HTTP-layer tests against a running Astro/wrangler dev server — service layer is sufficient for the DB-integrity risks
- No CI integration for these tests — deferred; needs a GitHub Actions Supabase setup that is out of scope for Phase 3
- No test for 401 / bad-input rejection at the API route — a separate concern from DB integrity
- No mocking of the Supabase client — the entire point of Phase 3 is to exercise the real DB path
- No `supabase db reset` between tests — per-test teardown keeps Supabase running and avoids resetting dev data

## Implementation Approach

Phase 1 builds the infrastructure (env var + helper module); Phase 2 writes the tests that import from it. Teardown uses a single `userCleanup()` per test: deleting the test user from `auth.users` cascades through `dogs` → `training_elements` → `training_logs` via Postgres FK CASCADE, leaving nothing behind.

## Critical Implementation Details

**Two-client pattern for user creation**: the admin client cannot `signInWithPassword` to get a user-scoped JWT — it operates as service role. `createTestUser` must (1) call `admin.auth.admin.createUser()` with `email_confirm: true` to create the user, then (2) instantiate a *separate* anon client and call `signInWithPassword({ email, password })` on it to get the session. The access token from that session becomes the `Authorization: Bearer <token>` header on the `authClient` used in service calls. Without this second step the service calls will execute without a user identity and RLS will reject them.

**`accountId` in `toggleTrainingLog`**: the API route sources `accountId` from `context.locals.user.id`. In tests, pass `userId` returned by `createTestUser` — it is the test user's UUID from `auth.users`.

**Local Supabase must be running**: tests fail with a network error if not started. Run `npx supabase start` before `npm run test`. (CI integration is deferred — see §What We're NOT Doing.)

---

## Phase 1: Test Harness

### Overview

Adds the service-role env var and the shared `src/lib/tests/helpers/db.ts` module. No test assertions in this phase — only infrastructure. After this phase, `npm run test` still reports 37 passing (the helper file is not a test file — no `.test.` in the name).

### Changes Required

#### 1. Service role key in env files

**File**: `.env`

**Intent**: Provide the service-role key that `createAdminClient()` needs to call `auth.admin.*` APIs and bypass RLS for seeding.

**Contract**: Add the line `SUPABASE_SERVICE_ROLE_KEY=<value from npx supabase status>`. The key appears in `npx supabase status` output under "service_role key". Do not commit the actual key to version control.

---

**File**: `.env.example`

**Intent**: Document the required env var for future contributors and CI setup.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY=<from npx supabase status>` as a placeholder line, adjacent to the existing `SUPABASE_URL` and `SUPABASE_KEY` entries.

---

#### 2. Shared DB helper module

**File**: `src/lib/tests/helpers/db.ts` (new file)

**Intent**: Four exported functions that every integration test uses to create and clean up test data. Extracting them now means Phase 4 can import from the same file instead of duplicating setup logic.

**Contract**: All imports are from `"@supabase/supabase-js"` (direct npm package — no `@/` alias). All functions throw on any Supabase error. Env vars are read from `process.env` directly (not from `astro:env/server`).

```ts
// Signature contract — the implementer writes the bodies

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_KEY ?? "";

/** Service-role client: bypasses RLS. Use for seeding and count-verification. */
export function createAdminClient(): SupabaseClient { ... }

/**
 * Creates a test user via the admin API, signs them in via a fresh anon client
 * to get a real user JWT, and returns an authClient authenticated as that user.
 * cleanup() deletes the user from auth.users (cascades dogs → elements → logs).
 */
export async function createTestUser(admin: SupabaseClient): Promise<{
  userId: string;
  authClient: SupabaseClient;
  cleanup: () => Promise<void>;
}> { ... }

/** Inserts a dog row (service-role, bypasses RLS). */
export async function seedDog(
  admin: SupabaseClient,
  accountId: string,
  name?: string,          // default: "Test Dog"
): Promise<{ dogId: string }> { ... }

/** Inserts a training element row (service-role, bypasses RLS). */
export async function seedElement(
  admin: SupabaseClient,
  dogId: string,
  name: string,
): Promise<{ elementId: string }> { ... }
```

The `createClient` calls inside the function bodies should pass `{ auth: { autoRefreshToken: false, persistSession: false } }` to prevent background token management in the test process. The `authClient` additionally sets `global: { headers: { Authorization: \`Bearer ${session.access_token}\` } }` so every subsequent Supabase call carries the user's JWT.

### Success Criteria

#### Automated Verification

- `npm run test` still reports **37 passing** — the helper file is not picked up as a test file
- `npx tsc --noEmit` passes with no type errors on the new helper file

#### Manual Verification

- `npx supabase status` output includes a "service_role key" value; that value is present in `.env`
- `SUPABASE_SERVICE_ROLE_KEY` entry exists in `.env.example` with a non-empty placeholder

**Implementation Note**: After Phase 1 automated verification passes, confirm the manual check before proceeding to Phase 2.

---

## Phase 2: Integration Tests

### Overview

Three test cases in `src/lib/tests/data-integrity.test.ts`. A shared outer `beforeEach` / `afterEach` block creates the admin client, test user, and a single dog — then each test seeds its own elements and logs. All test data is wiped by `userCleanup()` in `afterEach`.

### Changes Required

#### 1. data-integrity.test.ts

**File**: `src/lib/tests/data-integrity.test.ts` (new file)

**Intent**: Three integration tests that call service functions against a real local Supabase DB and assert the final persisted state. Tests bypass the UI debounce and Astro routing intentionally — the DB and service layer are the correctness gates under test.

**Contract**: All imports are relative. Top-level `beforeEach`/`afterEach` handles shared setup and teardown. Elements are seeded within each individual test, not in the shared `beforeEach`, so each test's data is explicit.

Structure:

```ts
// import pattern (implementer writes full bodies)
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toggleTrainingLog } from "../services/training-logs";
import { deleteTrainingElement } from "../services/training-elements";
import { createAdminClient, createTestUser, seedDog, seedElement } from "./helpers/db";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("data integrity", () => {
  let admin: SupabaseClient;
  let authClient: SupabaseClient;
  let userId: string;
  let dogId: string;
  let userCleanup: () => Promise<void>;

  beforeEach(async () => {
    admin = createAdminClient();
    ({ userId, authClient, cleanup: userCleanup } = await createTestUser(admin));
    ({ dogId } = await seedDog(admin, userId));
  });

  afterEach(async () => {
    await userCleanup(); // cascades dogs → elements → logs
  });

  describe("tick-toggle idempotency", () => {
    it("happy-path: sequential tick then untick persists and removes the log row")
    it("Risk #3: concurrent duplicate toggles never produce two log rows for the same cell")
  });

  describe("element-deletion cascade (Risk #6)", () => {
    it("deleting element A removes only its logs, not element B's logs on the same dog")
  });
});
```

**Test 1 — happy-path sequential**:
- `toggleTrainingLog(authClient, dogId, elementId, userId, "2026-01-15")` → assert returns `"ticked"`
- admin count query: `training_logs` where `element_id = elementId` AND `trained_on = "2026-01-15"` with `{ count: "exact", head: true }` → assert count is `1`
- `toggleTrainingLog(authClient, dogId, elementId, userId, "2026-01-15")` → assert returns `"unticked"`
- admin count query again → assert count is `0`

**Test 2 — Risk #3 concurrent duplicate**:
- `const results = await Promise.all([toggleTrainingLog(...), toggleTrainingLog(...)])` — identical arguments, same cell
- Assert `results.sort()` equals `["ticked", "unticked"]` — one INSERT won the race, the other hit 23505 and DELETEd it
- admin count query → assert count is **not** `2` (the dangerous corruption case; will be `0`)

**Test 3 — Risk #6 cascade**:
- `seedElement(admin, dogId, "Sit")` → `elementIdA`; `seedElement(admin, dogId, "Down")` → `elementIdB`
- `toggleTrainingLog(authClient, dogId, elementIdA, userId, "2026-01-10")` — seed a log for A
- `toggleTrainingLog(authClient, dogId, elementIdB, userId, "2026-01-10")` — seed a log for B
- `deleteTrainingElement(authClient, dogId, elementIdA)` → assert returns `true`
- admin count for `element_id = elementIdA` → assert `0` (cascade removed it)
- admin count for `element_id = elementIdB` → assert `1` (sibling logs untouched)

Count query pattern (non-standard Supabase syntax, needed by all three tests):
```ts
const { count, error } = await admin
  .from("training_logs")
  .select("*", { count: "exact", head: true })
  .eq("element_id", someElementId);
if (error) throw error;
// count is number | null; it will be a number if no error
```

### Success Criteria

#### Automated Verification

- `npm run test` reports **40 passing** tests (37 existing + 3 new)
- `npx tsc --noEmit` passes

#### Manual Verification

- All three tests pass when local Supabase is running (`npx supabase start` first)
- Confirm via `npx supabase studio` (or `psql`) that no orphan rows remain in `training_logs`, `training_elements`, `dogs`, or `auth.users` after a test run

**Implementation Note**: After Phase 2 automated verification passes, run the tests a second time without restarting Supabase to confirm per-test teardown is idempotent (the shared dog/user are recreated fresh each run).

---

## Testing Strategy

### Unit Tests

Unchanged — 37 existing tests in `highlight.test.ts`, `dates.test.ts`, `training-grid.test.ts` continue to run as pure-function tests with no DB.

### Integration Tests (new)

| Test | Risk covered | What it proves |
|------|-------------|----------------|
| Happy-path sequential toggle | Baseline | Harness works; service function + DB round-trip is correct |
| Concurrent duplicate toggle (`Promise.all`) | #3 | `UNIQUE(element_id, trained_on)` prevents duplicate rows under a real race |
| Element deletion cascade isolation | #6 | `ON DELETE CASCADE` is scoped to `element_id`, not `dog_id` or sort position |

### Manual Testing

1. Run `npx supabase start` if not already running
2. Run `npm run test` — all 40 tests should pass
3. Run `npm run test` a second time — all 40 pass again (confirms teardown)
4. Check `npx supabase studio` → `training_logs`, `training_elements`, `dogs` tables — no test rows remain

## Performance Considerations

Each integration test makes ~4–8 Supabase HTTP calls (create user, seed, toggle, count, delete). Expected total test suite runtime: < 10 seconds. No caching or connection pooling needed at this scale.

## References

- Research: `context/changes/testing-data-integrity-at-the-api-layer/research.md`
- Service functions: `src/lib/services/training-logs.ts:40–75`, `src/lib/services/training-elements.ts:123–139`
- DB schema: `supabase/migrations/20260530000003_create_training_logs.sql`
- Dogs schema: `supabase/migrations/20260530000001_create_dogs.sql`, `supabase/migrations/20260531000001_dogs_soft_delete.sql`
- Phase 2 test pattern: `src/lib/tests/highlight.test.ts`
- Test-plan Phase 3: `context/foundation/test-plan.md` §3 (row 3)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Test Harness

#### Automated

- [x] 1.1 `npm run test` still reports 37 passing after helper file is added — 31f1459
- [x] 1.2 `npx tsc --noEmit` passes with no errors on the new helper file — 31f1459

#### Manual

- [x] 1.3 `npx supabase status` output matches the key added to `.env` — 31f1459
- [x] 1.4 `SUPABASE_SERVICE_ROLE_KEY` placeholder exists in `.env.example` — 31f1459

### Phase 2: Integration Tests

#### Automated

- [x] 2.1 `npm run test` reports 40 passing tests (37 + 3 new) — db0d3c0
- [x] 2.2 `npx tsc --noEmit` passes — db0d3c0

#### Manual

- [x] 2.3 All three integration tests pass with local Supabase running (`npx supabase start`) — db0d3c0
- [x] 2.4 No orphan rows remain after the test run (verified via supabase studio or psql) — db0d3c0
- [x] 2.5 Second consecutive test run passes (confirms teardown idempotency) — db0d3c0
