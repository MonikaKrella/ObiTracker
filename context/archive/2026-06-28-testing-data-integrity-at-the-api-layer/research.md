---
date: 2026-06-28T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 8d376a3d2519644d34955f48d2e7b9f2b6c945c7
branch: tests
repository: obitracker
topic: "Data integrity at the API layer — Phase 3 test groundwork"
tags: [research, testing, training-logs, training-elements, supabase, integration-tests, idempotency, cascade]
status: complete
last_updated: 2026-06-28
last_updated_by: Claude Sonnet 4.6
---

# Research: Data Integrity at the API Layer (Phase 3)

**Date**: 2026-06-28  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: `8d376a3d2519644d34955f48d2e7b9f2b6c945c7`  
**Branch**: `tests`  
**Repository**: obitracker

## Research Question

Ground the implementation of Phase 3 integration tests (Risks #3 and #6 from the test plan):
- **Risk #3** — Rapid/duplicate taps produce a lost write or duplicated row instead of a clean toggle
- **Risk #6** — Deleting one training element cascades to sibling elements' or another dog's `training_logs`

Specifically: where do idempotency and cascade constraints live, how is the tick toggle implemented end-to-end, what is the FK cascade scope for deletion, and what infrastructure is needed to run real-DB integration tests in Vitest?

---

## Summary

The codebase has strong protections against both risks — but neither is currently tested by automated assertions:

- **Risk #3 (tick idempotency)**: A 300ms debounce at the UI layer, optimistic updates with auto-revert, and a DB-level `UNIQUE (element_id, trained_on)` constraint that turns duplicate INSERTs into `23505` errors. The service layer translates `23505` → DELETE (untick). The idempotency guarantee lives primarily in the DB constraint; the debounce is a UX optimisation, not a correctness gate.
- **Risk #6 (cascade scope)**: The FK is `training_logs.element_id REFERENCES training_elements(id) ON DELETE CASCADE`. The service call is double-scoped to `element_id` AND `dog_id`. The cascade is correctly per-element — sibling element logs are structurally safe. No test currently verifies this in an automated way.
- **Test infrastructure**: Local Supabase is already running (port 54321, `supabase/config.toml` present). The existing Vitest setup is pure-function / `environment: "node"` with no DB connectivity. Phase 3 must add a **separate Supabase test client** (direct `@supabase/supabase-js`, not `@supabase/ssr`) and a mechanism for seeded test users with real JWT tokens. The API routes (Astro) cannot be called in-process from Vitest — tests must either call the service layer functions directly with a test client, or run the dev server and HTTP-fetch it.

---

## Detailed Findings

### Finding 1 — Tick Toggle API Route

**File**: `src/pages/api/dog/[id]/logs/index.ts`

- HTTP method: `POST`
- URL path: `/api/dog/{dogId}/logs`
- Request body (Zod-validated):
  ```ts
  {
    elementId: z.string().uuid(),
    trainedOn: z.string().date()    // YYYY-MM-DD, rejects future dates via isFutureUtcDate()
  }
  ```
- Response: `{ success: true, state: "ticked" | "unticked" }`
- Auth check: returns 401 if `context.locals.user` is null (lines 20–22)
- Ownership check: calls `getDogById()` + `elementBelongsToDog()` before delegating to service (lines 44, 49)

The API route is a thin wrapper; all toggle logic lives in the service.

---

### Finding 2 — Toggle Service: INSERT-or-DELETE Idempotency

**File**: `src/lib/services/training-logs.ts`, function `toggleTrainingLog()` (lines 40–75)

```ts
// Step 1: try INSERT
const insertResult = await supabase.from("training_logs").insert({ ... });

// Step 2: if INSERT succeeded → ticked
if (!insertResult.error) return "ticked";

// Step 3: if INSERT hit UNIQUE constraint (23505) → untick
if (insertResult.error.code === "23505") {
  await supabase.from("training_logs")
    .delete()
    .eq("element_id", elementId)
    .eq("dog_id", dogId)
    .eq("trained_on", trainedOn);
  return "unticked";
}

// Step 4: any other error → rethrow
throw insertResult.error;
```

**Key**: Idempotency is enforced at the **DB level** (unique constraint → error 23505), not by a pre-read query. Two concurrent ticks race to INSERT; one wins, the other hits 23505 and triggers a DELETE (toggle back). This means two simultaneous identical requests will leave the log in the original un-ticked state — both "correct" from a data-integrity standpoint (toggle goes tick→untick), though perhaps not what the user intended. This is the scenario the integration test for Risk #3 must exercise.

---

### Finding 3 — DB-Level Unique Constraint (Idempotency Gate)

**File**: `supabase/migrations/20260530000003_create_training_logs.sql` (lines 11–18)

```sql
CREATE TABLE training_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id uuid NOT NULL REFERENCES training_elements(id) ON DELETE CASCADE,
  dog_id     uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trained_on date NOT NULL,
  CONSTRAINT training_logs_element_id_trained_on_unique UNIQUE (element_id, trained_on)
);
```

The `UNIQUE (element_id, trained_on)` constraint is the single source of truth for "one tick per element per day". It prevents duplicate rows from reaching the DB even if both the debounce and the service logic were bypassed. The integration test for Risk #3 should exercise this path: two simultaneous POST requests → assert exactly one log row exists afterwards (not zero, not two).

---

### Finding 4 — Client-Side Debounce (UX Layer, Not Correctness Gate)

**File**: `src/components/hooks/useTrainingGrid.ts`

- **300ms debounce** per `elementId:date` key (line 3)
- Coalesces rapid taps: if final state equals the baseline (even number of taps), no request is sent (lines 59–62)
- **Important for testing**: the debounce is a client-side UX guard. The integration tests for Risk #3 bypass it entirely (they call the API/service directly) — which is intentional: we want to assert the DB/service correctness in the absence of the UI guard.

**File**: `src/components/training-grid/TickCell.tsx`

- Uses `useOptimistic()` for instant visual feedback; reverts on error
- `AbortController` ref prevents stale-tap error toasts from superseded requests (lines 49, 53–54, 67–68)
- No hard guard preventing two in-flight requests for the same cell — that protection lives at the DB constraint level

---

### Finding 5 — Training Element Deletion Endpoint

**File**: `src/pages/api/dog/[id]/elements/[elementId]/index.ts` (lines 67–106)

- HTTP method: `DELETE`
- URL path: `/api/dog/{dogId}/elements/{elementId}`
- Both `dogId` and `elementId` validated as UUIDs before any DB call
- Delegates to `deleteTrainingElement(supabase, dogId, elementId)` in the service
- Returns 404 if the element was not found (service returns false), 200 `{ success: true }` otherwise

---

### Finding 6 — Delete Service: Double-Scoped Hard DELETE

**File**: `src/lib/services/training-elements.ts`, function `deleteTrainingElement()` (lines 123–139)

```ts
const result = await supabase
  .from("training_elements")
  .delete({ count: "exact" })
  .eq("id", elementId)
  .eq("dog_id", dogId);
```

- Scoped to **both** `element_id` AND `dog_id` — defense-in-depth even if RLS were absent
- Hard DELETE (no soft-delete flag)
- Training logs are cleaned up by the FK CASCADE; there is no explicit `training_logs` DELETE call here
- Returns `(count ?? 0) > 0` — service comment documents the cascade: `"training_logs_element_id_fkey ON DELETE CASCADE removes that element's tick history automatically"`

---

### Finding 7 — FK CASCADE Scope (The Critical Assertion for Risk #6)

**File**: `supabase/migrations/20260530000003_create_training_logs.sql` (line 13)

```sql
element_id uuid NOT NULL REFERENCES training_elements(id) ON DELETE CASCADE,
```

**The cascade is keyed exclusively on `element_id`**, not on `dog_id` or `sort_position`. This means:
- Deleting element A → deletes `training_logs` where `element_id = A` only
- Element B on the same dog keeps all its logs
- A dog's logs for a different element are untouched

The test for Risk #6 must prove this empirically: create two elements (A, B) with logs for the same dog, delete element A, assert B's logs survive.

**Note on RLS and CASCADE**: The `training_logs` DELETE RLS policy (`USING (select auth.uid()) = account_id`) does **not** apply to FK CASCADE deletions. CASCADE is executed at the SQL engine level and bypasses row-level security. This is correct and expected behaviour for a hard delete; it means the cascade will always clean up logs when an element is deleted, regardless of RLS state.

---

### Finding 8 — Test Infrastructure: What Exists

**Vitest** (`vitest.config.ts`): `environment: "node"`, no JSDOM, no path-alias resolution for value imports. `npm run test` → `vitest run`.

**No DB connectivity today**: All 37 existing tests are pure-function. No test imports `src/lib/supabase.ts` or any Supabase client.

**Local Supabase is configured and ready**:
- `supabase/config.toml` is present with Postgres 17 on port 54322, API on `http://127.0.0.1:54321`
- `.env` already points to the local instance: `SUPABASE_URL=http://127.0.0.1:54321`
- All migrations (`supabase/migrations/`) apply via `npx supabase db reset`

**The SSR Supabase client (`src/lib/supabase.ts`) cannot be used in tests**:
- It requires `AstroCookies` and `Headers` from the Astro request lifecycle
- Returns `null` when env vars are missing (all callers must handle null)
- Not suitable as a test harness client

---

### Finding 9 — What Phase 3 Tests Need to Add

To write integration tests that hit the real DB:

1. **A test-only Supabase client** — using `@supabase/supabase-js` directly (not `@supabase/ssr`), pointed at the local Supabase API (`http://127.0.0.1:54321`). A `service_role` key is needed for seeding test data outside RLS.

2. **Test user creation and JWT tokens** — Supabase local exposes an `auth.admin` API that can create users and issue tokens. Tests need to authenticate as real users to exercise RLS and ownership checks.

3. **Test isolation strategy** — The two viable approaches:
   - **`supabase db reset` before the suite** (fast, simple, wipes all data, requires local Supabase running)
   - **Per-test teardown** (delete the seeded rows after each test, keep the DB running between tests)
   `supabase db reset` is simpler for a first pass; per-test teardown is faster for large suites. Given 2–3 integration tests, per-test teardown is probably the right default.

4. **Deciding what to test at which layer** — two options:
   - **Service layer directly** — import `toggleTrainingLog` and `deleteTrainingElement` into Vitest, pass a real test Supabase client. Fast, no HTTP overhead, exercises the core logic. Cannot test 401/auth checks.
   - **HTTP layer (against running dev server)** — `fetch()` against the Astro server. Tests the full stack including auth, routing, and input validation. Requires `wrangler dev` running as a pre-test server.

   **Recommendation from the test plan** (§Risk #3 response): "integration (service/API layer, two rapid requests, assert final DB state)". Both layers are in scope; service-layer tests are faster and sufficient for the DB-integrity assertion.

---

## Code References

| Path | Lines | What's there |
|------|-------|--------------|
| `src/pages/api/dog/[id]/logs/index.ts` | 11–22, 44, 49, 54–55 | POST tick-toggle route: auth check, Zod schema, ownership check, service call |
| `src/lib/services/training-logs.ts` | 40–75 | `toggleTrainingLog()` — INSERT-or-DELETE with 23505 handling |
| `src/components/hooks/useTrainingGrid.ts` | ~29–94 | 300ms debounce, baseline coalescing, 401 redirect |
| `src/components/training-grid/TickCell.tsx` | 43–105 | `useOptimistic()`, stale-tap AbortController guard |
| `src/pages/api/dog/[id]/elements/[elementId]/index.ts` | 67–106 | DELETE element route |
| `src/lib/services/training-elements.ts` | 123–139 | `deleteTrainingElement()` — double-scoped hard DELETE |
| `supabase/migrations/20260530000003_create_training_logs.sql` | 11–18 | `training_logs` table: UNIQUE(element_id, trained_on), FK CASCADE on element_id |
| `supabase/migrations/20260530000002_create_training_elements.sql` | 1–12 | `training_elements` table: UNIQUE(dog_id, name), dog FK CASCADE |
| `supabase/config.toml` | 1–389 | Local Supabase config: API port 54321, DB port 54322, migrations from `supabase/migrations/` |
| `.env` | 1–2 | `SUPABASE_URL=http://127.0.0.1:54321` — local instance in dev |
| `vitest.config.ts` | 3–6 | `environment: "node"`, no path-alias resolution |

---

## Architecture Insights

### Idempotency is layered, with DB as the authoritative gate

```
UI (300ms debounce) → coalesces rapid taps for UX
  ↓ (still possible to send two requests)
Service (INSERT → 23505 → DELETE) → translates DB error to semantic "untick"
  ↓
DB UNIQUE (element_id, trained_on) → the single source of truth; prevents corruption
```

The DB constraint is the only layer that survives a bypassed UI (e.g., two concurrent API calls from different browser tabs, or a test sending two simultaneous requests).

### CASCADE chain is per-element, never cross-element

```
auth.users (cascade-if-user-deleted)
  └── dogs (account_id FK CASCADE)
        └── training_elements (dog_id FK CASCADE)
              └── training_logs (element_id FK CASCADE)   ← deletes only THIS element's logs
        └── training_logs (dog_id FK CASCADE)              ← deletes when DOG is deleted
```

Two separate FK references on `training_logs`: one from `element_id` (per-element scope), one from `dog_id` (whole-dog scope). Risk #6's scenario — deleting an element leaking into sibling element logs — is structurally prevented by this design. The test is still valuable as a regression guard.

### `src/lib/supabase.ts` is SSR-only — Phase 3 needs its own client

The existing Supabase client factory is tightly coupled to Astro's request lifecycle (`AstroCookies`). Integration tests will need `createClient` from `@supabase/supabase-js` directly, with a `service_role` key for seeding and a test user's `access_token` for authenticated calls.

---

## Historical Context (from prior changes)

- `context/changes/testing-highlight-correctness-recalculation-wiring/` — Phase 2 research and plan. Established the `environment: "node"` constraint; explicitly deferred "tick-toggle-triggers-recalculation wiring" as a concern for Phase 3, noting the wiring is in `useTrainingGrid.ts` (`research.md:23`). Also confirmed that `@/` value imports fail in vitest.
- `context/changes/db-schema/plan.md` — DB schema design decisions; `npx supabase db reset` applies all migrations cleanly; confirms `training_logs` FK/CASCADE scoping.
- `context/changes/bootstrap-verification/` — Initial project setup; confirms local Supabase CLI is the primary dev DB.

---

## Open Questions

The following must be resolved during planning:

1. **Test layer choice: service or HTTP?**
   - Service-layer tests (import `toggleTrainingLog` + real client) are faster and simpler to set up, but cannot test 401 / bad-input rejection at the API layer.
   - HTTP-layer tests (fetch against `wrangler dev`) cover the full stack but require a running server as a test fixture.
   - **Recommendation**: service-layer for the DB-integrity assertions (Risks #3 and #6); separate concerns from auth/input validation which are more cleanly tested at the API layer or via type guarantees.

2. **How to generate test JWT tokens for authenticated Supabase calls?**
   - Local Supabase Admin API (`http://127.0.0.1:54321/auth/v1/admin/users`) can create users; `supabase.auth.admin.createUser()` with `autoConfirm: true` returns a session.
   - Service role key is needed to call admin APIs — must be added to the test environment (likely `SUPABASE_SERVICE_ROLE_KEY` in `.env`).

3. **Test isolation: `supabase db reset` vs per-test teardown?**
   - For a 2–3 test suite, per-test teardown (delete seeded rows in `afterEach`) is simpler and doesn't require stopping/restarting the Supabase server between runs.
   - If the suite grows, consider a `beforeAll` / `afterAll` that wipes the test-specific tables.

4. **Does the plan need to cover the "two rapid requests" Race scenario, or just the sequential double-tap?**
   - The test plan says "two rapid requests, assert final DB state" — this likely means truly concurrent (two `Promise.all([fetch, fetch])`) not sequential. The DB constraint handles concurrency; the sequential case is easier to test but may not surface a race.
   - **Recommendation**: use `Promise.all` for the two-request scenario to match the stated risk.

5. **What does the `service_role` anon key look like for the local instance?**
   - Local Supabase auto-generates service-role and anon keys. The anon key is in `.env`. Service-role key is available in `supabase/config.toml` or via `npx supabase status`.

---

## Related Research

- `context/changes/testing-highlight-correctness-recalculation-wiring/research.md` — Phase 2 research; vitest setup and constraint on `@/` value imports
- `context/changes/db-schema/plan.md` — full DB schema design with FK/RLS details
