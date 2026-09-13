# Dog Rename Implementation Plan

## Overview

Handlers can currently rename a training element but not a dog — a mis-typed or outdated dog name has no fix path. This closes that asymmetry (PRD-v2 FR-003) by adding a `PATCH` endpoint and a rename dialog on the per-dog dashboard, mirroring the existing training-element rename feature almost exactly.

## Current State Analysis

The `dogs` table (`supabase/migrations/20260530000001_create_dogs.sql`) already has a `name text NOT NULL` column, full RLS (one policy per operation for `authenticated`), and `service_role` grants (`20260719000001_service_role_table_grants.sql:17`) — no migration is needed.

Dog CRUD today: `POST /api/dog` (create, `src/pages/api/dog/index.ts`), `DELETE /api/dog/[id]` (soft-delete, `src/pages/api/dog/[id]/index.ts`), `PATCH /api/dog/[id]/default-class` (`src/pages/api/dog/[id]/default-class.ts`). There is no `PATCH` for the dog's name yet — `src/pages/api/dog/[id]/index.ts` exports `DELETE` only.

The training-element rename feature (`src/pages/api/dog/[id]/elements/[elementId]/index.ts` `PATCH` handler, `src/lib/services/training-elements.ts`'s `renameTrainingElement`, and `src/components/training-elements/RenameElementDialog.tsx`) is the pattern to mirror for API shape, service-function shape, and dialog UI. The one deliberate deviation: elements check name uniqueness before renaming (`isElementNameTaken`); dogs must **not** — FR-003's Socrates round explicitly rejected a uniqueness guard for dogs since they're keyed by ID everywhere.

Every place a dog's name renders (`src/pages/dogs/[id]/dashboard.astro` h1, `AuthLayout.astro`'s SSR placeholder and `DogSwitcher` island, page `<title>`s, breadcrumb links, `DeleteDogModal`) is populated via a fresh server-side fetch per request (`Astro.locals.selectedDog` from `src/middleware.ts`, or `getDogsList`) — there is no client-side cache or shared store anywhere in the app (confirmed: no SWR/react-query/context). A full page reload after a successful rename is therefore sufficient to refresh every surface; no per-island state synchronization is needed.

### Key Discoveries:

- `src/lib/services/dogs.ts:83-97` (`setDefaultClassNumber`) is the exact service-function shape to copy for `renameDog`: `update({...}).eq("id", dogId).select().maybeSingle()`, returning `null` when RLS makes a cross-account row invisible.
- `src/pages/api/dog/index.ts:8-10` already defines the exact validation the new endpoint needs: `z.object({ name: z.string().trim().min(1, "Dog name is required").max(100, "Dog name must be 100 characters or fewer") })`. The codebase's existing convention duplicates this schema per file rather than sharing it (see `elementNameSchema` duplicated in both `elements/index.ts` and `elements/[elementId]/index.ts`) — follow that convention rather than extracting a shared schema.
- `src/pages/dogs/[id]/dashboard.astro:73-82` already has the placeholder/island pattern to copy for the new dialog: a disabled placeholder button shown until the React island mounts via `useLayoutEffect`, avoiding a hydration flash. `DeleteDogModal` is the existing example.
- `tests/unit/cross-account-authorization.test.ts:79-93` (`describe("dogs", ...)`) is where the new `renameDog` cross-account test belongs, alongside the existing `getDogById`/`softDeleteDog`/`setDefaultClassNumber` cases.

## Desired End State

A handler viewing their dog's dashboard page (`/dogs/[id]/dashboard`) sees a "Rename" icon button next to the dog's name. Clicking it opens a dialog pre-filled with the current name; submitting a new name (1–100 chars, trimmed) persists it and reloads the page so the new name appears in the h1, the page title, the dog switcher, and every other dog-scoped page the handler subsequently visits.

Verification: after renaming a dog, the new name appears in `AuthLayout`'s dog switcher dropdown and in the browser tab title without any further action; a `PATCH /api/dog/[id]` request from a different account's session returns 404 and leaves the dog's name unchanged.

## What We're NOT Doing

- No uniqueness check on dog names (FR-003 explicitly rejects this — dogs are keyed by ID everywhere; duplicate names are cosmetic).
- No rename entry point on the `DogSwitcher` dropdown, the `/dashboard` "My Dogs" list page, the grid page, the elements page, or the competition-results page — the per-dog dashboard (`/dogs/[id]/dashboard`) is the single entry point.
- No in-place client-side state update across islands — a full page reload is the refresh mechanism, matching how dog-switching already works via plain `<a>` navigation.
- No E2E test for this flow — matches the current project baseline (no rename flow, element or dog, has E2E coverage today).
- No schema or migration changes — the `name` column and its constraints already exist.

## Implementation Approach

Mirror the training-element rename feature's three layers (service function → API route → dialog component) as closely as possible, with the single intentional deviation of omitting the uniqueness check. Ship backend first (with its own unit test) so the API can be verified independently via `curl`/Vitest before wiring the UI.

## Phase 1: Backend — rename endpoint

### Overview

Adds the service function and `PATCH` handler that let an authenticated handler rename their own dog, plus the cross-account authorization test proving a handler can't rename another account's dog.

### Changes Required:

#### 1. Service function

**File**: `src/lib/services/dogs.ts`

**Intent**: Add a `renameDog` function that updates a dog's `name`, scoped to the dog's ID, returning the updated row or `null` when the row isn't visible (not found, or not owned — RLS handles the ownership scoping, same as every other function in this file).

**Contract**: `renameDog(supabase: SupabaseClient, dogId: string, name: string): Promise<Dog | null>` — same shape as `setDefaultClassNumber` (`update({ name }).eq("id", dogId).select().maybeSingle()`), placed alongside it. Add a doc comment matching the file's existing style, noting no uniqueness check is performed (unlike elements).

#### 2. API route

**File**: `src/pages/api/dog/[id]/index.ts`

**Intent**: Add a `PATCH` export handling dog rename, alongside the existing `DELETE` export in the same file.

**Contract**: `PATCH /api/dog/:id` — auth check → `z.uuid()` validation of `id` (404 on failure) → JSON body validated against a `dogNameSchema` (identical shape to `createDogSchema` in `src/pages/api/dog/index.ts:8-10`, duplicated here per the codebase's existing per-file schema convention) → call `renameDog(supabase, dogId, name)` → 404 if `null`, else `Response.json({ success: true, dog })`. No uniqueness check — this is the one deliberate deviation from the element-rename handler it otherwise mirrors line-for-line (same auth/validation/try-catch structure as the sibling `DELETE` handler in this file and the `PATCH` handler in `elements/[elementId]/index.ts`).

#### 3. Cross-account authorization test

**File**: `tests/unit/cross-account-authorization.test.ts`

**Intent**: Prove `renameDog` returns `null` when the target dog belongs to a different account, matching the existing pattern for `softDeleteDog`/`setDefaultClassNumber` in the same `describe("dogs", ...)` block.

**Contract**: Add `it("renameDog returns null for another account's dog", ...)` inside `describe("dogs", ...)` (`:79-94`), calling `renameDog(authClientB, dogAId, "Renamed")` and asserting the result is `null`. Import `renameDog` alongside the existing `dogs.ts` imports at the top of the file.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npm run build` (Astro build includes type-checking) or the project's `astro check` equivalent per `README.md`
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl -X PATCH http://localhost:4321/api/dog/<own-dog-id> -H "Content-Type: application/json" -d '{"name":"New Name"}'` (with a valid session cookie) returns `{ "success": true, "dog": { ..., "name": "New Name" } }`
- The same request against another account's dog ID returns 404 and the dog's name is unchanged in the database

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Frontend — rename dialog

### Overview

Adds the `RenameDogDialog` component and wires it into the per-dog dashboard page next to the dog's name, using the same placeholder/island hydration pattern as the existing `DeleteDogModal`.

### Changes Required:

#### 1. Dialog component

**File**: `src/components/dogs/RenameDogDialog.tsx`

**Intent**: A dialog that lets the handler edit the dog's name and submit it via the new `PATCH` endpoint, mirroring `src/components/training-elements/RenameElementDialog.tsx` structurally (same `Dialog`/`Input`/`sonner` toast pattern, same open/name/loading state shape, same re-sync-on-reopen behavior).

**Contract**: `RenameDogDialog({ dogId, dogName }: { dogId: string; dogName: string })`. On submit, `fetch(`/api/dog/${dogId}`, { method: "PATCH", headers: {...}, body: JSON.stringify({ name }) })`; on `res.status === 401` redirect to `/auth/signin` (matching `RenameElementDialog`'s handling); on success call `window.location.reload()` instead of an `onRenamed` callback (there is no parent list state to update in place, unlike the element list) — this is the one behavioral difference from `RenameElementDialog`. On failure, show the returned error via `toast.error`.

#### 2. Wiring into the dashboard page

**File**: `src/pages/dogs/[id]/dashboard.astro`

**Intent**: Render the rename dialog next to the dog's name heading, using the same placeholder-until-mounted pattern already used for `DeleteDogModal` (`:68-82`) so there's no hydration flash.

**Contract**: Add a placeholder icon button (disabled, `id="rename-dog-placeholder"`) next to the `<h1>{selectedDog.name}</h1>` (`:23-25`), and a hidden `<span id="rename-dog-island" hidden><RenameDogDialog dogId={selectedDog.id} dogName={selectedDog.name} client:only="react" /></span>`, following the exact swap mechanics `DeleteDogModal`'s `useLayoutEffect` uses (adapt the two `getElementById` calls to the new element IDs inside `RenameDogDialog`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- On `/dogs/[id]/dashboard`, clicking the rename icon opens a dialog pre-filled with the current name
- Submitting a new name closes the dialog, reloads the page, and the new name appears in the h1, the browser tab title, and the `AuthLayout` dog switcher dropdown
- Cancelling the dialog and reopening it shows the original name again (no stale edit lingers)
- Submitting an empty or whitespace-only name is rejected client-side (native `required` on the input) and, if bypassed, server-side (400 with "Dog name is required")
- Renaming works correctly on both a phone-width viewport and a laptop-width viewport

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `renameDog` cross-account authorization (Phase 1) — the only new automated test, matching this codebase's existing risk-based coverage (service-layer authorization, not UI).

### Integration Tests:

- None planned — no existing integration-test layer beyond the Vitest unit suite for services and the Playwright E2E suite (which this change deliberately doesn't extend, per "What We're NOT Doing").

### Manual Testing Steps:

1. Rename a dog via the dashboard dialog; confirm the new name propagates to the switcher and page title after reload.
2. Attempt to rename a dog you don't own via direct API call (`curl`); confirm 404 and no change.
3. Rename a dog to the same name it already has; confirm this succeeds (no uniqueness check, so this is a legitimate no-op save).
4. Rename a dog to a name identical to a different dog's name (same account); confirm this succeeds — duplicate names across a handler's own dogs are explicitly allowed.

## Performance Considerations

None — a single-row update on a table with no significant volume (`target_scale: users: small`).

## Migration Notes

None — no schema change.

## References

- Pattern mirrored: `src/components/training-elements/RenameElementDialog.tsx`, `src/pages/api/dog/[id]/elements/[elementId]/index.ts`, `src/lib/services/training-elements.ts`
- PRD: `context/foundation/prd-v2.md` FR-003
- Roadmap: `context/foundation/roadmap.md` S-06

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — rename endpoint

#### Automated

- [x] 1.1 Unit tests pass: `npm run test`
- [x] 1.2 Type checking passes: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 `curl PATCH` on own dog returns success with updated name
- [x] 1.5 `curl PATCH` on another account's dog returns 404, no change persisted

### Phase 2: Frontend — rename dialog

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Unit tests still pass: `npm run test`

#### Manual

- [ ] 2.4 Rename dialog opens pre-filled and reloads with new name visible everywhere
- [ ] 2.5 Cancel-then-reopen shows original name, no stale edit
- [ ] 2.6 Empty/whitespace name rejected client- and server-side
- [ ] 2.7 Verified on phone-width and laptop-width viewports
