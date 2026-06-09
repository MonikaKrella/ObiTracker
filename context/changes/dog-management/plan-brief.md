# Dog Management — Plan Brief

> Full plan: `context/changes/dog-management/plan.md`

## What & Why

Users need to add dogs, switch between them, and (optionally) delete them before any training data can be logged. This slice delivers the dog management layer (FR-002, FR-003) — the prerequisite that unblocks S-03 (training elements) and S-04 (training grid). Without it, every downstream slice has no dog context to work against.

## Starting Point

The `dogs` table is live in Supabase with RLS but no soft-delete columns. There are no dog API routes, no dog service, no React components for dogs, and no authenticated layout — `src/pages/dashboard.astro` is a bare placeholder and `src/components/Topbar.astro` exists but is unused.

## Desired End State

An authenticated user lands on `/dashboard` and sees their dogs listed as cards. They can add a dog at `/dogs/new`, navigate to any dog's dashboard at `/dogs/[id]/dashboard`, and switch dogs from a header dropdown on every authenticated screen. Deleting a dog opens a confirmation modal; confirming soft-deletes it and returns the user to `/dashboard`. Soft-deleted dogs are invisible to all queries (enforced at the RLS level).

## Key Decisions Made

| Decision                  | Choice                                                           | Why                                                                       |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Selected dog persistence  | URL routing (`/dogs/[id]/...`)                                   | Stateless, no stale-state risk; dog ID always in the URL                  |
| Middleware dog validation | Validate + attach `context.locals.selectedDog`                   | Centralises ownership check; every page gets the dog for free             |
| Authenticated layout      | New `AuthLayout.astro`                                           | Clean separation from public screens; no conditional logic in base layout |
| `/dashboard` role         | Dog-list home page                                               | Inline landing with all dogs visible; no extra selector screen            |
| Add dog                   | Dedicated `/dogs/new` page                                       | Consistent with auth page pattern; simple form                            |
| Scope                     | Add + list + switch + soft delete                                | Delete needed to avoid accumulating test dogs; hard delete deferred       |
| `NewDog` type             | Keep `Pick<Dog, "name">`; inject `account_id` at service layer   | `account_id` structurally cannot come from user input                     |
| Dog name uniqueness       | App-level check (one extra query)                                | Prevents ambiguous switcher labels; no DB migration needed                |
| Delete confirmation       | shadcn `AlertDialog` React island                                | Modal pattern matches shadcn conventions; action is irreversible          |
| Post-delete redirect      | Always `/dashboard`                                              | Single predictable target regardless of remaining dog count               |
| Dog switcher              | shadcn `DropdownMenu` React island                               | Polished, accessible, extensible; navigation links only (no client state) |
| Soft delete shape         | `is_deleted boolean` (filter) + `deleted_at timestamptz` (audit) | Boolean is fast to index/query; timestamp preserves audit trail           |

## Scope

**In scope:**

- New migration: `is_deleted` + `deleted_at` columns, updated SELECT RLS policy
- Dog service: list, get, uniqueness check, create, soft-delete
- POST `/api/dogs` (create) and DELETE `/api/dogs/[id]` (soft-delete)
- `AuthLayout.astro` with Topbar + DogSwitcher
- Pages: `/dashboard` (dog list), `/dogs/new` (add form), `/dogs/[id]/dashboard` (placeholder)
- `DogSwitcher` React island (shadcn DropdownMenu)
- `DeleteDogModal` React island (shadcn AlertDialog)
- Middleware: dog route protection + `selectedDog` injection

**Out of scope:**

- Dog rename
- Hard delete / cascade cleanup of elements and logs
- Restoring soft-deleted dogs
- Any field beyond dog `name`
- Competition results (v2)

## Architecture / Approach

Dog identity lives entirely in the URL (`/dogs/[id]/...`). The middleware extracts the UUID from the pathname, validates ownership against Supabase (filtered by `is_deleted = FALSE`), and attaches the result to `context.locals.selectedDog`. All authenticated pages use `AuthLayout.astro`, which composes the base layout with `Topbar.astro` and the `DogSwitcher` island (props: `dogs[]`, `selectedDogId`). Mutations (create, soft-delete) go through dedicated API routes following the existing form-POST pattern. The `DeleteDogModal` island calls the DELETE route via `fetch` and handles success/error client-side without a page reload until success.

## Phases at a Glance

| Phase               | What it delivers                                              | Key risk                                                                  |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Data layer       | Migration, types, dog service, create + delete API routes     | RLS SELECT policy must drop-and-replace (not patch) the existing policy   |
| 2. Routing skeleton | Middleware, AuthLayout, all page files (with static switcher) | UUID regex in middleware must not match `/dogs/new`                       |
| 3. React islands    | DogSwitcher + DeleteDogModal wired into layout and dashboard  | shadcn components not yet installed; must be added before islands compile |

**Prerequisites:** F-01 (`db-schema`) and S-01 (`auth-flow`) both marked `ready` in the roadmap.  
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Training elements and logs for a soft-deleted dog remain in the DB (orphaned). They are invisible through the app but not cleaned up. Future GDPR or cleanup tooling will need to handle them.
- No DB-level unique constraint on `dogs.name` per account — uniqueness is enforced only at the app layer. A concurrent duplicate insert (two browser tabs) could slip through; acceptable for MVP scale.
- `ON DELETE CASCADE` on child tables (`training_elements`, `training_logs`) remains in place — a future hard-delete admin tool would cascade correctly.

## Success Criteria (Summary)

- Authenticated user can add a dog, see it on `/dashboard`, navigate to `/dogs/[id]/dashboard`, switch dogs from the header dropdown, and soft-delete a dog from the dashboard modal
- Soft-deleted dogs are invisible in the app and to direct Supabase queries (RLS enforced)
- Accessing a soft-deleted or foreign dog's URL redirects to `/dashboard`
