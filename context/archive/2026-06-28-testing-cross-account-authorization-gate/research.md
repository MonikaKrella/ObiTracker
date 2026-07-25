---
date: 2026-06-28T00:00:00+00:00
researcher: claude-sonnet-4-6
git_commit: c7e76616d7a923613be96e5f2558247b3ee2c239
branch: tests
repository: ObiTracker
topic: "Cross-account authorization gate: which routes accept path-scoped resource IDs, where ownership is enforced, and how the system behaves when a valid session targets another account's resources"
tags: [research, authorization, rls, api-routes, integration-tests, idor, phase-4]
status: complete
last_updated: 2026-06-28
last_updated_by: claude-sonnet-4-6
---

# Research: Cross-account Authorization Gate

**Date**: 2026-06-28  
**Researcher**: claude-sonnet-4-6  
**Git Commit**: c7e76616d7a923613be96e5f2558247b3ee2c239  
**Branch**: tests  
**Repository**: ObiTracker

## Research Question

Which routes accept a path-scoped resource ID? Where is ownership actually checked — RLS, service-layer filter, both, or neither? What is the exact observed behavior when Account B (valid authenticated session, wrong ownership) targets Account A's resources at the service layer?

## Summary

**The system uses an RLS-first ownership model.** No API handler or service function adds an explicit `WHERE account_id = user.id` filter for SELECT/UPDATE/DELETE operations. All cross-account protection for those operations is delegated to Supabase Row Level Security via the authenticated SSR client, which is JWT-scoped to the calling user.

**RLS is comprehensive, correctly written, and covers all three tables.** Policies use `(select auth.uid())` (the optimal subquery form), include all four operations where relevant, and correctly revoke `SELECT` from `anon`. All RLS policies were verified against six migration files.

**6 of 10 API routes** accept path-scoped resource IDs. All 6 check `context.locals.user` for session existence (→ 401 if null), then delegate ownership enforcement entirely to the service layer + RLS. No handler performs an explicit cross-account ownership comparison.

**The integration test surface is clear**: two seeded accounts, service-function calling pattern (matching Phase 3), assert zero data leakage and zero mutation success for all 6 cross-account scenarios.

---

## Detailed Findings

### 1. Dog-Scoped Routes — Complete Inventory

**Non-resource routes (no path parameters) — 4 routes:**

| Route                    | Method | Auth check    |
| ------------------------ | ------ | ------------- |
| `POST /api/auth/signout` | POST   | none (public) |
| `GET /api/auth/confirm`  | GET    | none (public) |
| `POST /api/auth/signin`  | POST   | none (public) |
| `POST /api/auth/signup`  | POST   | none (public) |

**Dog-scoped routes (path parameters present) — 6 routes:**

| Route                                     | Method | Path params          | Auth check                  | Pre-flight service call                                                                                       |
| ----------------------------------------- | ------ | -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/dog`                           | POST   | none                 | `context.locals.user` → 401 | none (creates new)                                                                                            |
| `DELETE /api/dog/:id`                     | DELETE | `dogId`              | `context.locals.user` → 401 | none                                                                                                          |
| `POST /api/dog/:id/elements`              | POST   | `dogId`              | `context.locals.user` → 401 | `getDogById(supabase, dogId)` → 404 if null                                                                   |
| `PATCH /api/dog/:id/elements/:elementId`  | PATCH  | `dogId`, `elementId` | `context.locals.user` → 401 | `getDogById(supabase, dogId)` → 404 if null                                                                   |
| `DELETE /api/dog/:id/elements/:elementId` | DELETE | `dogId`, `elementId` | `context.locals.user` → 401 | `getDogById(supabase, dogId)` → 404 if null                                                                   |
| `PATCH /api/dog/:id/elements/reorder`     | PATCH  | `dogId`              | `context.locals.user` → 401 | `getDogById(supabase, dogId)` → 404 if null                                                                   |
| `POST /api/dog/:id/logs`                  | POST   | `dogId`              | `context.locals.user` → 401 | `getDogById(supabase, dogId)` → 404 if null; `elementBelongsToDog(supabase, dogId, elementId)` → 404 if false |

The `POST /api/dog` route is listed for completeness; it has no path parameter and is not a cross-account risk (it creates a new dog for the calling user).

**File locations:**

- `src/pages/api/dog/index.ts` — `POST /api/dog`
- `src/pages/api/dog/[id]/index.ts` — `DELETE /api/dog/:id`
- `src/pages/api/dog/[id]/elements/index.ts` — `POST /api/dog/:id/elements`
- `src/pages/api/dog/[id]/elements/[elementId]/index.ts` — `PATCH` and `DELETE /api/dog/:id/elements/:elementId`
- `src/pages/api/dog/[id]/elements/reorder.ts` — `PATCH /api/dog/:id/elements/reorder`
- `src/pages/api/dog/[id]/logs/index.ts` — `POST /api/dog/:id/logs`

---

### 2. RLS Policy Architecture

Six migration files, verified in chronological order. All three resource tables have full RLS coverage.

#### `dogs` table (`supabase/migrations/20260530000001_create_dogs.sql`)

Ownership column: `account_id` (uuid FK → `auth.users(id) ON DELETE CASCADE`).

| Policy                      | Op     | Predicate                                                                          |
| --------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `dogs_select_authenticated` | SELECT | `(select auth.uid()) = account_id AND is_deleted = FALSE` (updated by migration 4) |
| `dogs_insert_authenticated` | INSERT | WITH CHECK `(select auth.uid()) = account_id`                                      |
| `dogs_update_authenticated` | UPDATE | USING + WITH CHECK `(select auth.uid()) = account_id`                              |
| `dogs_delete_authenticated` | DELETE | `(select auth.uid()) = account_id`                                                 |

`REVOKE SELECT ON TABLE dogs FROM anon;` ✓

**Key**: the SELECT policy was tightened in `20260531000001_dogs_soft_delete.sql` to add `AND is_deleted = FALSE`, so soft-deleted dogs are also invisible to their owner at the RLS level.

#### `training_elements` table (`supabase/migrations/20260530000002_create_training_elements.sql`)

No `account_id` column. Ownership is **transitive through `dogs`** via EXISTS subquery.

| Policy                                   | Op     | Predicate                                                                                      |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `training_elements_select_authenticated` | SELECT | `EXISTS (SELECT 1 FROM dogs WHERE dogs.id = dog_id AND dogs.account_id = (select auth.uid()))` |
| `training_elements_insert_authenticated` | INSERT | WITH CHECK: same EXISTS                                                                        |
| `training_elements_update_authenticated` | UPDATE | USING + WITH CHECK: same EXISTS                                                                |
| `training_elements_delete_authenticated` | DELETE | same EXISTS                                                                                    |

`REVOKE SELECT ON TABLE training_elements FROM anon;` ✓

**Important**: any query to `training_elements` for a `dog_id` belonging to another account returns 0 rows — the JOIN to `dogs` via EXISTS fails silently.

#### `training_logs` table (`supabase/migrations/20260530000003_create_training_logs.sql`)

Denormalized `account_id` column (FK → `auth.users(id) ON DELETE CASCADE`). Both `element_id` and `dog_id` FKs use `ON DELETE CASCADE`.

| Policy                               | Op     | Predicate                                                                                                                                  |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `training_logs_select_authenticated` | SELECT | `(select auth.uid()) = account_id`                                                                                                         |
| `training_logs_insert_authenticated` | INSERT | WITH CHECK: `(select auth.uid()) = account_id` **AND** `EXISTS (dogs ownership)` **AND** `EXISTS (element.dog_id = dog_id)` — triple guard |
| `training_logs_delete_authenticated` | DELETE | `(select auth.uid()) = account_id`                                                                                                         |
| _(no UPDATE policy)_                 | UPDATE | — by design (presence-only model)                                                                                                          |

`REVOKE SELECT ON TABLE training_logs FROM anon;` ✓

**Key**: the INSERT policy is the most defensive in the schema — it verifies account, dog ownership chain, AND element-to-dog consistency in a single atomic check.

#### RPC Functions

| Function                                             | Security                                                                            | Ownership enforcement                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `soft_delete_dog(p_dog_id)`                          | SECURITY DEFINER (intentional — bypasses the tightened SELECT RLS post-soft-delete) | Explicit `AND account_id = (SELECT auth.uid())` in the WHERE clause inside the function body |
| `reorder_training_elements(p_dog_id, p_element_ids)` | SECURITY INVOKER                                                                    | RLS UPDATE policy fires normally; function also has `WHERE te.dog_id = p_dog_id` in the SQL  |

Both RPCs: `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.

⚠️ **Known gap (lessons.md pattern)**: neither RPC has an explicit `REVOKE EXECUTE ON FUNCTION ... FROM anon;`. Postgres default privileges separately grant `EXECUTE` to `anon` on every new function; `REVOKE FROM PUBLIC` does not cover it. This matches the known project lesson ("Explicitly revoke EXECUTE from `anon` on RPC functions meant for `authenticated` only"). The practical risk is low (RLS on the underlying tables would make an anon call a safe no-op), but it's a schema hygiene issue to track. **Not in scope for Phase 4 tests** — that lesson applies at implementation time.

---

### 3. Service Layer — Ownership Enforcement per Function

**All service functions receive a pre-built `SupabaseClient` as their first argument. No service creates its own client.** The client is always the cookie-based SSR client (anon/public key + user JWT), created in `src/lib/supabase.ts:9`. Ownership is therefore enforced by Postgres RLS on every query.

**Ownership field terminology**: the codebase uses `account_id` (not `user_id`) everywhere. There are zero matches for `user_id` in `src/`.

| Function                   | File                                    | userId/accountId param?                 | Explicit account filter in query?                                           | RLS fires?                           | Model                                                                                              |
| -------------------------- | --------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `getDogsList`              | `src/lib/services/dogs.ts`              | no                                      | no                                                                          | yes                                  | **RLS only**                                                                                       |
| `getDogById`               | `src/lib/services/dogs.ts`              | no                                      | no (only `id` + `is_deleted`)                                               | yes                                  | **RLS only** — comment at line 22: "RLS enforces ownership automatically"                          |
| `isDogNameTaken`           | `src/lib/services/dogs.ts`              | no                                      | no                                                                          | yes                                  | **RLS only**                                                                                       |
| `createDog`                | `src/lib/services/dogs.ts`              | `accountId` (from session)              | yes — inserted as `account_id`                                              | yes (WITH CHECK)                     | **both**                                                                                           |
| `softDeleteDog`            | `src/lib/services/dogs.ts`              | no                                      | no (RLS bypassed by SECURITY DEFINER)                                       | SECURITY DEFINER — bypassed          | **explicit check in RPC** (`AND account_id = (SELECT auth.uid())` in function WHERE)               |
| `getTrainingElements`      | `src/lib/services/training-elements.ts` | no                                      | no (`dog_id` only, for correctness)                                         | yes                                  | **RLS only**                                                                                       |
| `isElementNameTaken`       | `src/lib/services/training-elements.ts` | no                                      | no                                                                          | yes                                  | **RLS only**                                                                                       |
| `createTrainingElement`    | `src/lib/services/training-elements.ts` | no                                      | no                                                                          | yes (INSERT WITH CHECK)              | **RLS only**                                                                                       |
| `renameTrainingElement`    | `src/lib/services/training-elements.ts` | no                                      | `.eq("dog_id", dogId)` — cross-entity consistency guard, not account filter | yes                                  | **both** (RLS owns account check; `.eq("dog_id")` prevents cross-element rename within an account) |
| `deleteTrainingElement`    | `src/lib/services/training-elements.ts` | no                                      | `.eq("dog_id", dogId)` — same cross-entity guard                            | yes                                  | **both**                                                                                           |
| `elementBelongsToDog`      | `src/lib/services/training-elements.ts` | no                                      | `.eq("dog_id", dogId)` — explicit membership guard                          | yes                                  | **both**                                                                                           |
| `reorderTrainingElements`  | `src/lib/services/training-elements.ts` | no                                      | `te.dog_id = p_dog_id` inside RPC SQL                                       | yes (SECURITY INVOKER UPDATE policy) | **both**                                                                                           |
| `getTrainingLogs`          | `src/lib/services/training-logs.ts`     | no                                      | no (`dog_id` for index use only)                                            | yes                                  | **RLS only**                                                                                       |
| `toggleTrainingLog` INSERT | `src/lib/services/training-logs.ts`     | `accountId` (from session)              | yes — inserted as `account_id`                                              | yes (triple WITH CHECK)              | **both**                                                                                           |
| `toggleTrainingLog` DELETE | `src/lib/services/training-logs.ts`     | `accountId` present but unused in query | no (`element_id + dog_id + trained_on`)                                     | yes                                  | **RLS only**                                                                                       |

**No function applies `WHERE account_id = user.id` to a SELECT, UPDATE, or DELETE query** — that is universally delegated to RLS. The `account_id` appears in app code only on INSERTs to populate the column.

---

### 4. Middleware Behavior

`src/middleware.ts`:

- **`PROTECTED_ROUTES`**: `["/dashboard", "/dogs"]` — covers page routes only. API routes under `/api/dog/*` are **not** covered by middleware and must self-guard.
- **User resolution**: `supabase.auth.getUser()` (validates JWT server-side, not `getSession()`). Attaches raw Supabase `User` object (or null) to `context.locals.user`.
- **`DOG_ID_REGEX` block** (lines 44–55): For page routes matching `/dogs/<uuid>`, middleware calls `getDogById(supabase, dogId)`. If null (dog not found, soft-deleted, or wrong owner per RLS), redirects to `/dashboard?flash=dog_not_found`. This is an implicit ownership gate for page routes — but the mechanism is RLS, not an explicit `account_id === user.id` comparison.
- **API routes**: Do not go through the `DOG_ID_REGEX` block. Each handler is responsible for its own `context.locals.user` null check.

`src/lib/supabase.ts`:

- Exports one factory: `createClient(requestHeaders, cookies)` — always the SSR/anon-key client with cookie-based JWT.
- No service-role / admin client path in production code. The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) appears only in `src/lib/tests/helpers/db.ts` (test infrastructure).

---

### 5. Cross-Account Behavior Analysis (Service Layer)

What actually happens when Account B's authenticated client targets Account A's resources:

| Operation           | Service call                                                      | Cross-account result          | Why                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read dog            | `getDogById(supabase_b, dogA.id)`                                 | `null`                        | RLS SELECT: `auth.uid()=B` ≠ `account_id=A` → 0 rows                                                                                                 |
| Read elements       | `getTrainingElements(supabase_b, dogA.id)`                        | `[]`                          | RLS SELECT: EXISTS check through `dogs` fails for B                                                                                                  |
| Read logs           | `getTrainingLogs(supabase_b, dogA.id, ...)`                       | `[]`                          | RLS SELECT: `auth.uid()=B` ≠ `account_id=A` → 0 rows                                                                                                 |
| Delete dog          | `softDeleteDog(supabase_b, dogA.id)`                              | `false` (0 rows affected)     | SECURITY DEFINER RPC: `WHERE id=dogA.id AND account_id=(SELECT auth.uid())` → B's uid ≠ A's uid → 0 rows                                             |
| Create element      | `createTrainingElement(supabase_b, dogA.id, "x")`                 | throws PostgrestError         | RLS INSERT WITH CHECK: EXISTS(dogs WHERE dog_id=dogA.id AND account_id=B) → false                                                                    |
| Rename element      | `renameTrainingElement(supabase_b, dogA.id, elementA.id, "x")`    | `null` (0 rows)               | RLS UPDATE: EXISTS check fails for B; additionally `.eq("dog_id", dogId)` is an app guard                                                            |
| Delete element      | `deleteTrainingElement(supabase_b, dogA.id, elementA.id)`         | `false` (0 rows)              | RLS DELETE: EXISTS check fails for B; `.eq("dog_id", dogId)` is an app guard                                                                         |
| Reorder elements    | `reorderTrainingElements(supabase_b, dogA.id, [...])`             | silent no-op (0 rows updated) | RLS UPDATE: EXISTS fails; RPC's own `te.dog_id = p_dog_id` also filters                                                                              |
| Toggle log (tick)   | `toggleTrainingLog(supabase_b, dogA.id, elementA.id, B.id, date)` | throws PostgrestError         | DELETE path: 0 rows (RLS blocks) → INSERT path: `account_id=B.id`, but EXISTS(dogs WHERE id=dogA.id AND account_id=B) → false → RLS WITH CHECK fails |
| Toggle log (untick) | same call, existing log present                                   | same — throws                 | DELETE: 0 rows (RLS blocks, log.account_id=A ≠ B) → INSERT: same failure                                                                             |

**Key behavioral pattern**: the system has two failure modes for cross-account access:

1. **Returns null/empty/false** (reads, delete-dog, rename, delete-element, reorder) — RLS silently returns 0 rows; the service returns the "not found" sentinel
2. **Throws PostgrestError** (create-element, toggle-log) — the RLS WITH CHECK fails on INSERT, which Supabase surfaces as an error

Tests must handle both behaviors.

---

### 6. What the Handler Layer Returns for Cross-Account Requests

Since the service functions return null/false/throw for cross-account, and all element/log handlers call `getDogById` as a pre-flight:

- `DELETE /api/dog/:id` → handler returns **404** (softDeleteDog returns false → "Dog not found" branch)
- `POST /api/dog/:id/elements` → handler returns **404** (getDogById returns null)
- `PATCH /api/dog/:id/elements/:elementId` → handler returns **404** (getDogById returns null)
- `DELETE /api/dog/:id/elements/:elementId` → handler returns **404** (getDogById returns null)
- `PATCH /api/dog/:id/elements/reorder` → handler returns **404** (getDogById returns null)
- `POST /api/dog/:id/logs` → handler returns **404** (getDogById returns null — before the error path in toggleTrainingLog is even reached)

This means: at the HTTP layer, every cross-account attempt on a dog-scoped route returns **404**, not 401. The session check (401 path) is a separate and earlier gate — it fires only when there is no session at all.

---

## Architecture Insights

### RLS-first, no app-level cross-account filter

The design is intentional: every service function uses an authenticated Supabase client whose JWT is scoped to the calling user. The database enforces ownership row-by-row. The application code does not need to add a redundant `account_id = user.id` filter because the DB will never return rows that don't belong to the caller.

This is a valid and secure architecture **provided the authenticated client is always used for resource queries**. The one exception (`softDeleteDog` RPC) is SECURITY DEFINER precisely because it needs to bypass RLS to handle soft-delete — but it compensates with an explicit ownership WHERE clause in the function body.

### The pre-flight `getDogById` calls are defense in depth, not the primary guard

Routes that act on elements or logs call `getDogById(supabase, dogId)` before proceeding. This serves two purposes: (1) user-facing 404 response before trying to mutate something, and (2) defense in depth for the RLS. But the primary ownership enforcement is RLS — if `getDogById` were removed, the subsequent service calls would still fail for cross-account access (they'd return null/empty/throw).

### `account_id` vs `user_id` — terminology note

The codebase uniformly uses `account_id` for the ownership column, not `user_id`. Test helpers and integration tests must use `.eq("account_id", ...)` not `.eq("user_id", ...)`.

### Service-function test layer is sufficient for Phase 4

Following the Phase 3 pattern (Phase 3 notes: "Service layer, not HTTP layer — tests call service functions directly; the Astro routing layer is not involved"), Phase 4 tests can call service functions with two distinct Supabase clients without starting the Astro dev server. The HTTP handler behavior is predictable from the service behavior (404 in all cases, as shown in §6), and the DB-level enforcement is what the test plan requires to validate.

---

## Code References

- `src/pages/api/dog/index.ts` — POST /api/dog, user ID passed to createDog
- `src/pages/api/dog/[id]/index.ts` — DELETE /api/dog/:id, softDeleteDog delegate
- `src/pages/api/dog/[id]/elements/index.ts` — POST /api/dog/:id/elements, getDogById pre-flight
- `src/pages/api/dog/[id]/elements/[elementId]/index.ts` — PATCH + DELETE, getDogById pre-flight
- `src/pages/api/dog/[id]/elements/reorder.ts` — PATCH /reorder, getDogById pre-flight
- `src/pages/api/dog/[id]/logs/index.ts` — POST /api/dog/:id/logs, getDogById + elementBelongsToDog pre-flight
- `src/lib/supabase.ts:9` — SSR client factory (anon key + cookie JWT)
- `src/lib/services/dogs.ts:22` — `getDogById` comment: "RLS enforces ownership automatically"
- `src/lib/services/dogs.ts:66-70` — `softDeleteDog` comment explaining SECURITY DEFINER + ownership WHERE
- `src/lib/services/training-elements.ts:142-147` — `elementBelongsToDog` comment: "defense in depth alongside RLS WITH CHECK"
- `src/lib/services/training-logs.ts:37-38` — `toggleTrainingLog` comment: "accountId is always sourced from the session by the caller, never from request input"
- `src/middleware.ts:5` — PROTECTED_ROUTES: `["/dashboard", "/dogs"]` (page routes only)
- `src/middleware.ts:44-55` — DOG_ID_REGEX block: getDogById pre-flight for page routes
- `src/types.ts:11` — `Dog.account_id` (not user_id)
- `src/types.ts:31` — `TrainingLog.account_id` (denormalized)
- `supabase/migrations/20260530000001_create_dogs.sql:18-33` — four dogs RLS policies
- `supabase/migrations/20260530000002_create_training_elements.sql:20-55` — four training_elements RLS policies (EXISTS chain)
- `supabase/migrations/20260530000003_create_training_logs.sql:25-51` — three training_logs RLS policies (triple INSERT guard)
- `supabase/migrations/20260531000001_dogs_soft_delete.sql:13-15` — updated SELECT policy with is_deleted filter
- `supabase/migrations/20260531000002_soft_delete_dog_fn.sql:27-29` — RPC ownership WHERE clause
- `supabase/migrations/20260610000001_reorder_training_elements_fn.sql:18-21` — reorder RPC SQL
- `src/lib/tests/helpers/db.ts` — `createAdminClient`, `createTestUser`, `seedDog`, `seedElement` — reuse for Phase 4

## Historical Context

- `context/changes/db-schema/plan.md` — documents the intentional denormalization of `account_id` on `training_logs` for RLS performance; `training_elements` has no `account_id` by design, ownership via EXISTS through `dogs`
- `context/changes/dog-management/plan.md:164` — explicit note that `/api/dog/*` routes self-guard (not covered by PROTECTED_ROUTES middleware)
- `context/changes/testing-data-integrity-at-the-api-layer/` — Phase 3 pattern: service-function tests with `createTestUser` + `createAdminClient`; per-test teardown via `userCleanup()` cascades through dogs → elements → logs

## Related Research

- `context/changes/testing-data-integrity-at-the-api-layer/` — Phase 3 integration test pattern to follow
- `context/foundation/test-plan.md §2 Risk #4` — risk definition and test success criteria
- `context/foundation/lessons.md` — "Revoke anon SELECT on every new public table" (verified: done); "Explicitly revoke EXECUTE from `anon` on RPC functions" (gap: not done for soft_delete_dog or reorder_training_elements — not in Phase 4 scope)

## Open Questions

1. **RPC anon EXECUTE gap**: `soft_delete_dog` and `reorder_training_elements` migrations do `REVOKE FROM PUBLIC` but not `REVOKE FROM anon` explicitly. Per lessons.md, Postgres default privileges re-grant `anon` after `FROM PUBLIC`. The risk is defense-depth only (RLS on tables makes an anon RPC call a safe no-op), but it's a schema hygiene issue. Not in Phase 4 scope; should be addressed in a dedicated migration if/when the RPCs are next touched.

2. **`toggleTrainingLog` error propagation**: the cross-account INSERT path throws a `PostgrestError`. The handler at `src/pages/api/dog/[id]/logs/index.ts` would need to propagate this as a 500 (or catch it as something more specific). However, since the handler calls `getDogById` first and returns 404 before ever reaching `toggleTrainingLog`, this error path is never reached in practice via HTTP. It **is** reachable when testing the service function directly without the handler pre-flights. Phase 4 service-function tests should expect a thrown error (wrapped in try/catch or via `expect(...).rejects`), not a null/false return.

3. **`reorderTrainingElements` cross-account is a silent no-op, not an error**: the RPC updates 0 rows and returns void without throwing. Phase 4 tests for this route must verify Account A's element `sort_position` values are unchanged in the DB — not just that the service call didn't throw.
