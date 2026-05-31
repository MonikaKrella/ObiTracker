# Dog Management Implementation Plan

## Overview

Implement S-02: authenticated users can add dogs, list their dogs on a home dashboard, navigate between dogs via URL (`/dogs/[id]/dashboard`), and soft-delete a dog with a confirmation modal. The selected dog is always encoded in the URL — no cookie state. Middleware validates ownership on every `/dogs/[id]/*` request and attaches the dog to `context.locals.selectedDog`. A new `AuthLayout.astro` wraps all authenticated screens with a shared header (dog switcher + user/sign-out bar).

## Current State Analysis

- `dogs` table is live in Supabase with RLS and `set_updated_at` trigger; no `is_deleted` or `deleted_at` columns yet (`supabase/migrations/20260530000001_create_dogs.sql`)
- `src/types.ts` — `Dog` interface matches the schema; `NewDog = Pick<Dog, "name">` intentionally omits `account_id` (will be injected at the service layer; no TypeScript guard yet)
- `src/middleware.ts` — resolves `context.locals.user`; only `/dashboard` in `PROTECTED_ROUTES`
- `src/layouts/Layout.astro` — base layout (Banner + `<slot />`); no authenticated chrome
- `src/components/Topbar.astro` — exists with user email + sign-out; **not used anywhere**
- `src/pages/dashboard.astro` — bare placeholder importing `Layout.astro`
- No dog service, no dog API routes, no dog-related React components
- shadcn/ui: only `src/components/ui/button.tsx` installed; DropdownMenu and AlertDialog absent

### Key Discoveries

- `src/middleware.ts:4` — `PROTECTED_ROUTES` uses `pathname === route || pathname.startsWith(route + "/")` matching; Astro middleware has no access to parsed route params, so the dog ID in `/dogs/[id]/*` must be extracted with a regex on `context.url.pathname`
- `supabase/migrations/20260530000001_create_dogs.sql:18-20` — the existing `dogs_select_authenticated` SELECT policy must be **dropped and replaced** (not patched) in the new migration to add the `is_deleted = FALSE` filter
- `src/components/Topbar.astro:1-37` — ready to compose into `AuthLayout.astro` as-is; reads `Astro.locals.user` directly
- `src/env.d.ts:1-5` — `App.Locals` must be extended with `selectedDog` before TypeScript accepts `context.locals.selectedDog` anywhere
- `src/pages/api/auth/signin.ts` — canonical pattern for form-POST API routes: zod parse → error redirect → Supabase call → success redirect; all dog API routes follow this
- `roadmap-suggestions.md` (S-04 note, applies here): INSERT handler must always source `account_id` from the session — never from user input or the DTO type

## Desired End State

An authenticated user lands on `/dashboard`, sees their dogs listed as cards, and can add a new dog at `/dogs/new`. Clicking a dog card navigates to `/dogs/[id]/dashboard`; the header dropdown lets them switch between dogs from any authenticated screen. Deleting a dog from the `/dashboard` card opens a shadcn AlertDialog; confirming soft-deletes the dog (sets `is_deleted = TRUE`, `deleted_at = NOW()`), and the user is redirected to `/dashboard`. Soft-deleted dogs are invisible to all queries — enforced at the RLS level. Accessing a soft-deleted or foreign dog's URL redirects to `/dashboard`.

## What We're NOT Doing

- Dog rename — out of scope for this slice (no FR requirement in S-02)
- Hard delete — soft delete only; training elements and logs remain in the DB (invisible through the app since their dog no longer appears)
- Restoring soft-deleted dogs — no undelete
- Dog avatars, breed, or any field beyond `name` — FR-002 specifies name only
- Competition results — explicitly v2 per PRD Non-Goals

## Implementation Approach

Three phases in strict dependency order so each phase is independently verifiable before the next begins:

1. **Data layer** — migration, types, service functions, and API routes. No UI changes. Can be smoke-tested against the Supabase API directly.
2. **Routing skeleton** — middleware extension, `AuthLayout.astro`, all page files. Pages render with server-side data but the dog switcher is a static placeholder.
3. **React islands** — shadcn components, `DogSwitcher`, `DeleteDogModal`, wired into layout and dashboard. Completes the interactive end-to-end flow.

## Critical Implementation Details

**Middleware cannot access Astro route params.** The middleware must extract the dog ID from `context.url.pathname` with a UUID regex to avoid matching `/dogs/new` as an ID: `/^\/dogs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i`. Dog IDs are `gen_random_uuid()` UUIDs; this pattern matches only valid IDs and skips named segments like `new`.

**Soft delete uses two columns with distinct roles.** `is_deleted boolean NOT NULL DEFAULT FALSE` is the query predicate (used in RLS, service queries, and middleware validation). `deleted_at timestamptz NULL` is the audit timestamp (set alongside `is_deleted = TRUE`, never used as a filter). Both are set atomically on soft delete.

---

## Phase 1: Data layer — migration, types, service, API routes

### Overview

Add soft-delete columns to `dogs`, update the RLS SELECT policy, extend the TypeScript types and `App.Locals`, create the dog service with all four query functions, and wire up the two API routes (create, soft-delete). No UI changes; everything in this phase can be verified via direct API calls and the Supabase dashboard.

### Changes Required

#### 1. Soft-delete migration

**File**: `supabase/migrations/20260531000001_dogs_soft_delete.sql`

**Intent**: Add `is_deleted` and `deleted_at` to the `dogs` table and replace the SELECT RLS policy so soft-deleted dogs are invisible at the database level. A new migration file is required because the original is already applied.

**Contract**:
- `ALTER TABLE dogs ADD COLUMN is_deleted boolean NOT NULL DEFAULT FALSE`
- `ALTER TABLE dogs ADD COLUMN deleted_at timestamptz NULL`
- `DROP POLICY dogs_select_authenticated ON dogs` then `CREATE POLICY dogs_select_authenticated ON dogs FOR SELECT TO authenticated USING ((select auth.uid()) = account_id AND is_deleted = FALSE)`
- Follow `lessons.md`: use `(select auth.uid())` not `auth.uid()` in the policy expression
- Include rollback comments in the same style as the existing dog migration (DROP POLICY, ALTER TABLE DROP COLUMN)

#### 2. Dog type update

**File**: `src/types.ts`

**Intent**: Extend `Dog` with the two new columns and add a JSDoc block to `NewDog` explaining why `account_id` is absent from the insert DTO.

**Contract**: Add `is_deleted: boolean` and `deleted_at: string | null` to the `Dog` interface (after `updated_at`, matching schema column order). Add a JSDoc comment to `NewDog` stating: `account_id` is injected from the authenticated session in the service layer; it must never come from user input; `is_deleted` and `deleted_at` are database-defaulted and omitted from inserts.

#### 3. App.Locals extension

**File**: `src/env.d.ts`

**Intent**: Add `selectedDog` to the Astro locals type so every SSR page and layout can read the active dog type-safely.

**Contract**: Add `selectedDog: import("./types").Dog | null` to the `App.Locals` interface alongside `user`.

#### 4. Dog service

**File**: `src/lib/services/dogs.ts`

**Intent**: Centralise all dog-related Supabase queries. API routes and pages call these functions; no inline query construction elsewhere.

**Contract** — four exported async functions:
- `getDogsList(supabase)` → `Promise<Dog[]>` — selects all non-deleted dogs for the authenticated user (`is_deleted = FALSE`), ordered `created_at ASC`; RLS scopes to the session account
- `getDogById(supabase, dogId: string)` → `Promise<Dog | null>` — fetches one dog by ID for the authenticated user where `is_deleted = FALSE`; returns `null` if not found, wrong owner, or soft-deleted
- `isDogNameTaken(supabase, name: string)` → `Promise<boolean>` — case-insensitive check for a live dog with the same name for the authenticated user (`is_deleted = FALSE`); use `.ilike('name', escapedName)` where `escapedName = name.replace(/%/g, '\\%').replace(/_/g, '\\_')` so that `%` and `_` characters in the dog name are not interpreted as SQL wildcard patterns
- `createDog(supabase, accountId: string, name: string)` → `Promise<Dog>` — inserts `{ name, account_id: accountId }`; `is_deleted` defaults to `FALSE` at the DB level; RLS enforces that `account_id` matches the session
- `softDeleteDog(supabase, dogId: string)` → `Promise<boolean>` — updates `is_deleted = TRUE, deleted_at = NOW()` for the given ID using `{ count: 'exact' }`; RLS enforces ownership; returns `true` if a row was updated, `false` if 0 rows were matched (dog not found or not owned by the caller)

#### 5. Create dog API route

**File**: `src/pages/api/dog/index.ts`

**Intent**: Accept a form POST with `name`, validate it, check for duplicates, create the dog, and redirect. Follows the pattern established in `src/pages/api/auth/signin.ts`.

**Contract**:
- `export const prerender = false`
- `POST` handler: returns `Response.json({ error: "Unauthorized" }, { status: 401 })` if `context.locals.user` is null (the `AddDogForm` island navigates to `/auth/signin` on 401 — no server-side redirect); parses `name` from `formData`; validates with zod (non-empty string, trimmed, max 100 chars); on validation failure returns `Response.json({ error: "<message>" }, { status: 400 })`; calls `isDogNameTaken` — if true returns `Response.json({ error: "A dog with that name already exists" }, { status: 409 })`; calls `createDog` with `context.locals.user.id` as `accountId`; on Supabase error returns `Response.json({ error: "<message>" }, { status: 500 })`; on success returns `Response.json({ success: true })` (the island navigates to `/dashboard`)

#### 6. Soft-delete API route

**File**: `src/pages/api/dog/[id]/index.ts`

**Intent**: Accept a `DELETE` fetch from the `DeleteDogModal` React island and soft-delete the dog. Returns JSON (not a redirect) so the island can handle success and error states client-side.

**Contract**:
- `export const prerender = false`
- `DELETE` handler: returns `Response.json({ error: "Unauthorized" }, { status: 401 })` if `context.locals.user` is null; reads `context.params.id`; calls `softDeleteDog` — if it returns `false`, returns `Response.json({ error: "Not found" }, { status: 404 })`; returns `Response.json({ success: true })` on success; returns `Response.json({ error: "..." }, { status: 500 })` on Supabase error

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`
- Migration file exists at the correct path: `supabase/migrations/20260531000001_dogs_soft_delete.sql`

#### Manual Verification

- Migration applies cleanly (`supabase db push` or SQL editor); `dogs` table gains `is_deleted` (default `false`) and `deleted_at` (default `null`) columns
- Existing rows (if any) show `is_deleted = false, deleted_at = null` after migration
- POST to `/api/dog` with `name=Rex` creates a row with `is_deleted = false`
- POST to `/api/dog` with `name=Rex` a second time returns an error redirect (duplicate check)
- DELETE to `/api/dog/<id>` sets `is_deleted = true` and a non-null `deleted_at` on the target row
- A direct Supabase SELECT for the authenticated user does not return the soft-deleted dog (RLS policy enforces `is_deleted = FALSE`)

---

## Phase 2: Routing skeleton — middleware, layout, pages

### Overview

Wire the data layer into the application: extend the middleware for dog route protection and `selectedDog` injection, create `AuthLayout.astro` with a static placeholder for the switcher, update `/dashboard` to list dogs, add `/dogs/new`, and add `/dogs/[id]/dashboard` as a placeholder. By the end of this phase all pages load and redirect correctly; the switcher dropdown is not yet interactive.

### Changes Required

#### 1. Middleware update

**File**: `src/middleware.ts`

**Intent**: Protect all `/dogs/*` routes and, for URL segments that contain a UUID dog ID, validate ownership and attach the dog to `context.locals.selectedDog` so every downstream page and layout has type-safe access.

**Contract**:
- Add `"/dogs"` to `PROTECTED_ROUTES` (the existing `startsWith` check covers `/dogs/new`, `/dogs/[id]/dashboard`, etc.). Note: API routes under `/api/dog/*` live at a different prefix and are **not** covered by this entry — each API route is responsible for its own auth guard (check `context.locals.user`, redirect or return 401 if null; do not assume PROTECTED_ROUTES handles it).
- After the existing user auth check, test `context.url.pathname` against the UUID regex (see Critical Implementation Details); if matched, call `getDogById(supabase, dogId)` — if it returns `null` redirect to `/dashboard`; otherwise set `context.locals.selectedDog = dog`
- For non-ID paths (e.g. `/dogs/new`, `/dashboard`) set `context.locals.selectedDog = null`
- Reuse the `supabase` client already constructed at the top of the middleware

#### 2. AuthLayout

**File**: `src/layouts/AuthLayout.astro`

**Intent**: The layout for all authenticated screens. Composes `Layout.astro`, renders `Topbar.astro` and a dog-switcher slot. In Phase 2 the switcher slot is a static `<div>` placeholder; Phase 3 replaces it with the `DogSwitcher` React island.

**Contract**:
- Props: `{ title?: string; dogs: Dog[] }` — pages fetch the dog list themselves and pass it in; `selectedDog` is read from `Astro.locals.selectedDog` directly (no prop needed)
- Renders `<Layout title={title}>` wrapping a header block (Topbar + switcher placeholder) above `<slot />`
- The switcher placeholder `<div data-dog-switcher />` is the insertion point Phase 3 targets

#### 3. Dashboard page update

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the bare placeholder with the dog-list home page. Fetches the dog list, renders one card per dog (linking to the dog's dashboard URL), and shows an "Add dog" CTA. No delete button here — deletion lives on the individual dog's dashboard page.

**Contract**:
- Switches import from `Layout` to `AuthLayout`; passes the fetched `dogs` array as the `dogs` prop
- Calls `getDogsList(supabase)` server-side
- Each dog card links to `/dogs/{dog.id}/dashboard`; no delete button on this page — delete lives on the dog's own dashboard page
- "Add dog" CTA always visible, links to `/dogs/new`
- Shows an empty-state message ("No dogs yet") and only the "Add dog" CTA when `dogs.length === 0`

#### 4. Add dog page

**File**: `src/pages/dogs/new.astro`

**Intent**: Server-rendered page shell for the dog creation form. Renders a placeholder `<div>` that `AddDogForm` replaces in Phase 3. No HTML form, no `?error=` query-param handling — all form interaction is client-side and deferred to Phase 3 (importing `AddDogForm` before it exists would break the Phase 2 TypeScript build).

**Contract**:
- Uses `AuthLayout`; fetches dog list for the switcher
- Renders a static `<div data-add-dog-form />` placeholder where `AddDogForm` will be mounted in Phase 3; no form markup or error-query-param handling in this phase

#### 5. Dog dashboard page

**File**: `src/pages/dogs/[id]/dashboard.astro`

**Intent**: The per-dog authenticated screen. A verified placeholder for this slice; S-03 and S-04 will add content.

**Contract**:
- Uses `AuthLayout`; reads `Astro.locals.selectedDog` for the dog name; fetches dog list for the switcher
- Renders the dog name as an `<h1>`
- Renders a card/tile with the title "Training elements — coming soon" (placeholder for S-03 content)
- Renders a `<div data-delete-dog />` placeholder below the tile where `DeleteDogModal` will be mounted in Phase 3

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Unauthenticated GET `/dogs/new` redirects to `/auth/signin`
- Unauthenticated GET `/dogs/<valid-uuid>/dashboard` redirects to `/auth/signin`
- Authenticated GET `/dashboard` renders dog cards (or empty state + "Add dog") using `AuthLayout`
- GET `/dogs/<id>/dashboard` for a valid, owned, live dog renders the placeholder dashboard with the dog's name
- GET `/dogs/<id>/dashboard` for a soft-deleted dog redirects to `/dashboard`
- GET `/dogs/<id>/dashboard` for another user's dog redirects to `/dashboard`
- GET `/dogs/new` does **not** trigger the selectedDog lookup (UUID regex does not match "new")

---

## Phase 3: React islands & full integration

### Overview

Add the two interactive React islands (`DogSwitcher` and `DeleteDogModal`), install the required shadcn components, and wire everything into `AuthLayout.astro` and `dashboard.astro`. After this phase the full end-to-end flow is functional.

### Changes Required

#### 1. Install shadcn DropdownMenu

**File**: `src/components/ui/dropdown-menu.tsx` (generated)

**Intent**: Add the shadcn DropdownMenu component required by `DogSwitcher`.

**Contract**: Run `npx shadcn@latest add dropdown-menu`; commit the generated file alongside the rest of this phase.

#### 2. Install shadcn AlertDialog

**File**: `src/components/ui/alert-dialog.tsx` (generated)

**Intent**: Add the shadcn AlertDialog component required by `DeleteDogModal`.

**Contract**: Run `npx shadcn@latest add alert-dialog`

#### 3. DogSwitcher React island

**File**: `src/components/dogs/DogSwitcher.tsx`

**Intent**: A React island rendering the dog-switcher dropdown in the authenticated header. Each dog entry is a navigation link; no client-side state mutation occurs — switching dogs is a full-page navigation.

**Contract**:
- Props: `dogs: Dog[]`, `selectedDogId?: string`
- Renders a shadcn `DropdownMenu`; trigger label is the selected dog's name or `"Select dog"` when `selectedDogId` is undefined or unmatched
- Each dog renders as a `DropdownMenuItem` containing `<a href={"/dogs/" + dog.id + "/dashboard"}>`; the active dog is visually indicated (e.g. checkmark or bold)
- An `"Add dog"` item at the bottom of the list links to `/dogs/new`
- No `fetch` or state mutations — all interaction is anchor navigation

#### 4. DeleteDogModal React island

**File**: `src/components/dogs/DeleteDogModal.tsx`

**Intent**: A React island per dog card on `/dashboard` that opens a shadcn AlertDialog for delete confirmation and calls the soft-delete API route on confirm.

**Contract**:
- Props: `dogId: string`, `dogName: string`
- Trigger: a destructive-variant `Button` labelled "Delete dog" (red/destructive styling)
- Dialog body: confirmation prompt naming the dog, e.g. "Are you sure you want to delete [dog name]?" — do not promise permanent data removal (soft delete leaves training data in the DB; only future cleanup tooling can fully erase it)
- On confirm: calls `fetch("/api/dog/" + dogId, { method: "DELETE" })`; disables the confirm button during the fetch (loading state)
- On confirm success (`{ success: true }`): `sessionStorage.setItem('flash', JSON.stringify({ type: 'success', message: 'Dog deleted successfully' }))` then `window.location.href = '/dashboard'`
- On confirm error: close the dialog; call `toast.error(data.error || "Failed to delete dog")` via Sonner — user stays on the dog's dashboard page without navigating

#### 5. Wire DogSwitcher into AuthLayout

**File**: `src/layouts/AuthLayout.astro`

**Intent**: Replace the Phase 2 `data-dog-switcher` placeholder with the live `DogSwitcher` React island.

**Contract**: Import `DogSwitcher`; replace the placeholder `<div>` with `<DogSwitcher dogs={dogs} selectedDogId={Astro.locals.selectedDog?.id} client:load />`

#### 6. Wire DeleteDogModal into dogs/[id]/dashboard

**File**: `src/pages/dogs/[id]/dashboard.astro`

**Intent**: Replace the Phase 2 `<div data-delete-dog />` placeholder with the live `DeleteDogModal` React island. The red "Delete dog" trigger appears below the training elements tile.

**Contract**: Import `DeleteDogModal`; replace the placeholder `<div>` with `<DeleteDogModal dogId={Astro.locals.selectedDog!.id} dogName={Astro.locals.selectedDog!.name} client:load />`.

#### 7. Install shadcn Sonner (toast)

**File**: `src/components/ui/sonner.tsx` (generated)

**Intent**: Add the shadcn Sonner component so React islands can fire toasts without a custom notification system.

**Contract**: Run `npx shadcn@latest add sonner`; commit the generated file alongside the rest of this phase.

#### 8. Add Sonner provider to AuthLayout

**File**: `src/layouts/AuthLayout.astro`

**Intent**: Mount the global `<Toaster />` so toasts fired from any island within an authenticated screen are visible.

**Contract**: Import the Sonner `Toaster` component; render `<Toaster client:load />` at the bottom of `AuthLayout.astro`'s body, outside the content slot, so it is present on every authenticated page.

#### 9. AddDogForm React island

**File**: `src/components/dogs/AddDogForm.tsx`

**Intent**: A React island for `/dogs/new` that submits via `fetch`, shows Sonner toasts on error, and navigates client-side on success or 401. Replaces the Phase 2 placeholder `<div>`.

**Contract**:
- Props: none
- Renders a controlled text input for `name` and a submit button
- On submit: calls `fetch("/api/dog", { method: "POST", body: new FormData(formRef.current) })`; disables the submit button during the fetch (loading state)
- On response status 401: `window.location.href = "/auth/signin"`
- On response status 400 or 409: parse JSON body, show `toast.error(data.error)` via Sonner; page does not navigate
- On response status 500 or network error: show `toast.error("Something went wrong — please try again")`; page does not navigate
- On `{ success: true }` response: `window.location.href = "/dashboard"`

#### 10. Wire AddDogForm into /dogs/new

**File**: `src/pages/dogs/new.astro`

**Intent**: Replace the Phase 2 `<div data-add-dog-form />` placeholder with the live `AddDogForm` React island.

**Contract**: Import `AddDogForm`; replace the placeholder `<div>` with `<AddDogForm client:load />`.

#### 11. FlashToast React island

**File**: `src/components/FlashToast.tsx`

**Intent**: A zero-UI island that reads a flash message written to `sessionStorage` before a cross-page navigation, fires the appropriate Sonner toast on mount, then clears the entry. Used by any page that needs to surface a toast after a redirect.

**Contract**:
- Props: none
- Renders nothing (`return null`)
- On mount: reads `sessionStorage.getItem('flash')`; if present, parses `{ type: 'success' | 'error', message: string }`, calls `toast[type](message)` via Sonner, then calls `sessionStorage.removeItem('flash')`

#### 12. Wire FlashToast into dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Mount `FlashToast` on the dashboard page so the success toast set by `DeleteDogModal` appears after the cross-page navigation from the dog's dashboard.

**Contract**: Import `FlashToast`; render `<FlashToast client:load />` anywhere in the page body (renders nothing visually).

### Success Criteria

#### Automated Verification

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Dog switcher dropdown appears in the header on `/dashboard`, `/dogs/new`, and `/dogs/[id]/dashboard`
- Dropdown lists all non-deleted dogs; the active dog is visually indicated when on its `/dogs/[id]/dashboard`
- Clicking a dog in the dropdown navigates to `/dogs/[id]/dashboard`
- "Add dog" item in the dropdown navigates to `/dogs/new`
- "Delete dog" button appears at the bottom of `/dogs/[id]/dashboard`, below the training elements tile; clicking it opens the AlertDialog naming the dog
- Cancelling the dialog closes it; user stays on the dog's dashboard page with no changes
- Confirming calls the API, soft-deletes the dog, navigates to `/dashboard`, and shows a Sonner success toast ("Dog deleted successfully"); the deleted dog is absent from the list and the switcher
- Confirm button shows a loading state during the fetch
- An API error closes the dialog and shows a Sonner error toast; user stays on the dog's dashboard page
- Full mobile round-trip (phone viewport): add dog → switch dogs via dropdown → delete dog → confirm in modal
- Submitting `/dogs/new` with a valid name creates a dog and navigates to `/dashboard`; the new dog card appears
- Submitting `/dogs/new` with a duplicate name shows a Sonner toast with "already exists" message; page does not navigate
- Submitting `/dogs/new` with an empty or invalid name shows a Sonner toast with validation message; page does not navigate
- Submitting `/dogs/new` while the session has expired navigates to `/auth/signin`
- `AddDogForm` submit button shows loading state during the fetch

---

## Testing Strategy

### Manual Testing Steps

1. Sign in as a new user with no dogs → `/dashboard` shows empty state + "Add dog" CTA; switcher shows "Select dog"
2. Navigate to `/dogs/new`, submit "Rex" → page navigates to `/dashboard`; "Rex" card visible; switcher lists "Rex"
3. Try to add "Rex" again → Sonner toast shown: "A dog with that name already exists"; page stays on `/dogs/new`; no duplicate created
4. Add a second dog "Luna" → `/dashboard` shows two cards
5. Click "Rex" card link → `/dogs/<rex-id>/dashboard` loads; switcher trigger reads "Rex"
6. Open switcher → "Luna" and "Rex" listed; click "Luna" → URL becomes `/dogs/<luna-id>/dashboard`; trigger reads "Luna"
7. Click "Add dog" in the switcher → `/dogs/new` loads
8. Click "Rex" card link → navigate to `/dogs/<rex-id>/dashboard`; "Training elements — coming soon" tile visible; "Delete dog" red button visible below it
9. Click "Delete dog" → AlertDialog opens naming "Rex"; click Cancel → dialog closes; user stays on Rex's dashboard
10. Click "Delete dog" → Confirm → browser navigates to `/dashboard`; Sonner success toast "Dog deleted successfully" shown; only "Luna" visible; switcher lists only "Luna"
11. Navigate directly to the old Rex URL → redirected to `/dashboard`
12. Sign in as a different user; attempt to load Rex's URL → redirected to `/dashboard` (RLS + middleware)

## Migration Notes

`20260531000001_dogs_soft_delete.sql` adds two columns with safe defaults (`DEFAULT FALSE` / `NULL`) and replaces one RLS policy. Safe to apply to an empty table (dev) or pre-populated table (production). Existing rows will have `is_deleted = false, deleted_at = null` after migration with no manual data fixup required.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02, including implementation notes)
- Roadmap suggestions: `context/foundation/roadmap-suggestions.md`
- PRD: `context/foundation/prd.md` (FR-002, FR-003)
- Lessons: `context/foundation/lessons.md` (RLS patterns)
- Auth route pattern: `src/pages/api/auth/signin.ts`
- Existing Topbar: `src/components/Topbar.astro`
- Dogs migration (to understand what the new migration replaces): `supabase/migrations/20260530000001_create_dogs.sql`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer — migration, types, service, API routes

#### Automated

- [x] 1.1 TypeScript compiles without errors: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Migration file exists: `supabase/migrations/20260531000001_dogs_soft_delete.sql`

#### Manual

- [x] 1.4 Migration applies cleanly; `dogs` table gains `is_deleted` (default `false`) and `deleted_at` (default `null`) columns
- [x] 1.5 Existing rows show `is_deleted = false, deleted_at = null` after migration
- [x] 1.6 POST to `/api/dog` with a valid name creates a row with `is_deleted = false`
- [x] 1.7 POST to `/api/dog` with a duplicate name returns an error redirect
- [x] 1.8 DELETE to `/api/dog/<id>` sets `is_deleted = true` and a non-null `deleted_at`
- [x] 1.9 Soft-deleted dog is not returned by a direct Supabase SELECT (RLS enforces `is_deleted = FALSE`)

### Phase 2: Routing skeleton — middleware, layout, pages

#### Automated

- [ ] 2.1 TypeScript compiles: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 Unauthenticated GET `/dogs/new` redirects to `/auth/signin`
- [ ] 2.4 Unauthenticated GET `/dogs/<uuid>/dashboard` redirects to `/auth/signin`
- [ ] 2.5 Authenticated GET `/dashboard` renders dog cards (or empty state + "Add dog") using `AuthLayout`
- [ ] 2.6 GET `/dogs/<id>/dashboard` renders dog name, "Training elements — coming soon" tile, and delete placeholder
- [ ] 2.7 GET `/dogs/<id>/dashboard` for a soft-deleted dog redirects to `/dashboard`
- [ ] 2.8 GET `/dogs/<id>/dashboard` for another user's dog redirects to `/dashboard`
- [ ] 2.9 GET `/dogs/new` does not trigger the selectedDog UUID lookup

### Phase 3: React islands & full integration

#### Automated

- [ ] 3.1 TypeScript compiles: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Dog switcher dropdown appears in the header on all authenticated screens
- [ ] 3.4 Active dog is visually indicated in the dropdown when on `/dogs/[id]/dashboard`
- [ ] 3.5 Clicking a dog in the dropdown navigates to `/dogs/[id]/dashboard`
- [ ] 3.6 "Add dog" in the dropdown navigates to `/dogs/new`
- [ ] 3.7 "Delete dog" button appears at the bottom of `/dogs/[id]/dashboard`, below the training elements tile; clicking opens the AlertDialog naming the dog
- [ ] 3.8 Cancelling the dialog closes it; user stays on the dog's dashboard page
- [ ] 3.9 Confirming soft-deletes the dog; browser navigates to `/dashboard`; Sonner success toast shown; dog absent from list and switcher
- [ ] 3.10 Confirm button shows loading state during the fetch
- [ ] 3.11 API error on delete: dialog closes; Sonner error toast shown; user stays on dog's dashboard page
- [ ] 3.12 Full mobile round-trip: add → switch → delete works without layout issues
- [ ] 3.13 Submitting `/dogs/new` with a valid name creates a dog and navigates to `/dashboard`; new dog card appears
- [ ] 3.14 Submitting `/dogs/new` with a duplicate name shows a Sonner toast; page does not navigate
- [ ] 3.15 Submitting `/dogs/new` with empty/invalid name shows a Sonner validation toast; page does not navigate
- [ ] 3.16 Submitting `/dogs/new` while session expired navigates to `/auth/signin`
- [ ] 3.17 `AddDogForm` submit button shows loading state during fetch
- [ ] 3.18 Sonner success toast appears on `/dashboard` after dog deletion (FlashToast reads sessionStorage)
