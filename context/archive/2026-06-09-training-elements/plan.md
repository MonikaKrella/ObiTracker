# Training Elements Implementation Plan

## Overview

Implement S-03 (FR-004): an authenticated handler can add, rename, remove, and drag-to-reorder custom training elements for the selected dog, on a new dedicated page `/dogs/[id]/elements`. The dog's dashboard tile is updated from a "coming soon" placeholder to a live element count with a link to the new page. Element CRUD lands first (Phases 1-3); drag-and-drop reordering with an explicit "Save order" step lands as its own end-to-end vertical slice (Phase 4).

## Current State Analysis

- `training_elements` table is live with RLS (`id`, `dog_id`, `name`, `sort_position`, `created_at`; `UNIQUE (dog_id, name)`; `supabase/migrations/20260530000002_create_training_elements.sql`)
- `training_logs.element_id` has `ON DELETE CASCADE` (`supabase/migrations/20260530000003_create_training_logs.sql:13`) — deleting an element automatically removes its tick history at the DB level; no service-layer cascade needed
- `src/middleware.ts` already protects `/dogs/<uuid>/*` (via `PROTECTED_ROUTES` + `DOG_ID_REGEX`) and populates `context.locals.selectedDog` — a new page under `/dogs/[id]/...` needs **no middleware changes**
- `src/pages/dogs/[id]/dashboard.astro:25-29` has a placeholder tile titled "Training elements — coming soon" — the integration point for the dashboard summary
- No training-element service, no API routes for elements, no React components for elements
- shadcn `dialog` and `input` are not installed (`src/components/ui/` has only `alert-dialog`, `button`, `dropdown-menu`, `sonner`); no drag-and-drop library is a dependency
- `src/types.ts` already has `TrainingElement` and `NewTrainingElement = Pick<TrainingElement, "dog_id" | "name" | "sort_position">` — no type changes needed

### Key Discoveries:

- `src/lib/services/dogs.ts` (`isDogNameTaken`) — case-insensitive duplicate-name pattern to mirror for elements, escaping `%` and `_` in the `ilike` pattern (this plan also escapes `\`, fixing the gap noted in the dog-management impl-review F5)
- `src/pages/api/dog/index.ts` and `src/pages/api/dog/[id]/index.ts` — canonical API route shape: `prerender = false`, 401 on no user, zod validation, try/catch with a shared error-message extraction, `Response.json(...)`
- `supabase/migrations/20260531000002_soft_delete_dog_fn.sql` — RPC pattern for atomic, ownership-checked operations; that function needs `SECURITY DEFINER` only because the updated column (`is_deleted`) is also the SELECT policy's filter column (PostgREST WITH CHECK OPTION). `sort_position` is **not** referenced by any SELECT policy, so the reorder RPC in this plan does **not** need `SECURITY DEFINER` — the existing `training_elements_update_authenticated` policy protects it directly
- `src/components/hooks/useMounted.ts` — the canonical SSR-hydration guard for swapping a static SSR view for an interactive one (`if (!mounted) return <Static/>; return <Interactive/>`) — the right fit for `TrainingElementsManager`, vs. the `DeleteDogModal`/`DogSwitcher` DOM-swap pattern (small, single-control islands)
- `roadmap-suggestions.md` (S-03): every new element must get an explicit `sort_position` (`MAX(sort_position) + 1`), never the column default of `0`, or `ORDER BY sort_position` becomes non-deterministic
- `package.json` has no drag-and-drop library; `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` is the standard React 19-compatible choice and pairs with `lucide-react` (already a dependency) for the grip-handle icon

## Desired End State

A signed-in handler on `/dogs/[id]/dashboard` sees a "Training elements" tile showing how many elements are configured, with a "Manage elements" link to `/dogs/[id]/elements`. On that page they can:

- See all of the dog's training elements in their saved order
- Add a new element via a dialog (name only, max 100 chars, must be unique for the dog regardless of case)
- Rename any element via a per-row edit dialog (same validation)
- Delete any element via a confirmation dialog that explicitly warns its training history will be permanently deleted
- Drag rows (via a grip handle, mouse/touch/keyboard) to reorder, then click "Save order" to persist the new order

All changes are visible immediately (no page reload for add/rename/delete/reorder) and persist across reloads. Verification: `npm run build` and `npm run lint` pass; the manual flows in each phase's Success Criteria work end-to-end, including on a phone viewport.

## What We're NOT Doing

- Competition results — explicitly v2 per PRD Non-Goals
- Soft delete for elements — hard delete is intentional (resolved roadmap unknown: deleting an element permanently removes its tick history)
- Bulk import/export of elements, categories, or tags
- Showing tick counts or training history on the elements page — that's S-04 (training grid)
- Auto-saving drag reorders — an explicit "Save order" step was chosen over immediate persistence
- Inline (click-to-edit) renaming — add and rename both use a dialog
- A new migration for CRUD — the `training_elements` table, columns, and RLS policies already support add/rename/delete as-is; only reordering needs a new migration (the RPC in Phase 4)

## Implementation Approach

Four phases, each independently verifiable:

1. **Data layer (CRUD)** — service functions + create/rename/delete API routes. No UI. Verifiable via direct HTTP calls.
2. **Page structure** — new `/dogs/[id]/elements` page rendering a static (server-rendered) element list, plus the dashboard tile update. No React islands yet.
3. **React islands (CRUD)** — shadcn `dialog`/`input`, `TrainingElementsManager` + Add/Rename/Delete dialogs, replacing the static list with a fully interactive (but not yet reorderable) one.
4. **Drag-and-drop reorder** — its own vertical slice: reorder RPC migration, service function, API route, `@dnd-kit` integration, and the "Save order" UI with dirty-tracking.

Phases 1-3 ship a complete CRUD experience without touching `sort_position` after creation; Phase 4 is additive and isolated, so a regression there doesn't put the CRUD flow at risk.

## Critical Implementation Details

**Drag handle isolation for touch (Phase 4).** Attach `@dnd-kit/sortable`'s `attributes`/`listeners` only to a small `GripVertical` icon inside each row — never to the row container. If the whole row is draggable, touch users can no longer scroll the page past that row (drag gestures intercept scroll gestures). Use `PointerSensor` with `activationConstraint: { distance: 8 }` (mouse/touch) and `KeyboardSensor` with `sortableKeyboardCoordinates` (keyboard a11y, matching `eslint-plugin-jsx-a11y` expectations elsewhere in the project).

**"Save order" dirty-tracking must survive add/rename/delete (Phase 4).** Track `originalOrder` (a ref of element IDs in last-persisted order) separately from `elements` (current displayed state). `isDirty = elements.map(e => e.id) !== originalOrder.current`. A drag changes `elements` but not `originalOrder` → dirty → "Save order" appears. Add (appends to end of both arrays) and delete (removes from both arrays) must update `originalOrder.current` too — otherwise adding or deleting an element while the list is otherwise untouched would incorrectly show "Save order". Rename never changes order, so it never affects either array.

**Reorder RPC is `SECURITY INVOKER` (the default), unlike `soft_delete_dog` (Phase 4).** `soft_delete_dog` needs `SECURITY DEFINER` because `is_deleted` is the SELECT policy's filter column — PostgREST's WITH CHECK OPTION rejects an UPDATE that makes a row fail its own SELECT filter. `sort_position` is not referenced by any `training_elements` policy, so a plain (invoker-rights) function works: the existing `training_elements_update_authenticated` USING/WITH CHECK clauses (ownership via `dogs` EXISTS) scope the loop's UPDATEs correctly, and a `dog_id` the caller doesn't own simply matches zero rows. Do not copy the `SECURITY DEFINER` + `REVOKE`/`GRANT EXECUTE` pattern wholesale without checking whether it's actually needed — here the `REVOKE`/`GRANT EXECUTE` (restricting the RPC to `authenticated`) is still appropriate, but `SECURITY DEFINER` is not.

---

## Phase 1: Data layer (CRUD)

### Overview

Add the training-elements service (list, duplicate-check, create, rename, delete) and the two API routes for create and rename/delete. No UI changes; everything in this phase is verifiable via direct HTTP calls.

### Changes Required:

#### 1. Training elements service

**File**: `src/lib/services/training-elements.ts`

**Intent**: Centralize all training-element Supabase queries. API routes call these functions; no inline query construction elsewhere. This phase adds the four CRUD functions; Phase 4 adds a fifth (`reorderTrainingElements`).

**Contract** — four exported async functions:

- `getTrainingElements(supabase, dogId: string)` → `Promise<TrainingElement[]>` — selects all elements where `dog_id = dogId`, ordered `sort_position ASC, created_at ASC` (the `created_at` tiebreaker guards against any duplicate `sort_position` values, e.g. from concurrent creates); RLS scopes to the session account via the `dogs` ownership EXISTS check
- `isElementNameTaken(supabase, dogId: string, name: string, excludeElementId?: string)` → `Promise<boolean>` — case-insensitive check for a live element with the same name for `dogId`; escape `\`, `%`, `_` (backslash first) in the `ilike` pattern; if `excludeElementId` is given, add `.neq("id", excludeElementId)` so renaming an element to its own current name (or a same-name-different-case of itself) doesn't false-positive
- `createTrainingElement(supabase, dogId: string, name: string)` → `Promise<TrainingElement>` — computes `nextPosition`: query `sort_position` for `dog_id = dogId` ordered `sort_position DESC` limit 1; `nextPosition = (row?.sort_position ?? -1) + 1`; insert `{ dog_id: dogId, name, sort_position: nextPosition }`, `.select().single()`
- `renameTrainingElement(supabase, dogId: string, elementId: string, name: string)` → `Promise<TrainingElement | null>` — `update({ name }).eq("id", elementId).eq("dog_id", dogId).select().maybeSingle()`; returns `null` if no row matched (not found, wrong dog, or not owned)
- `deleteTrainingElement(supabase, dogId: string, elementId: string)` → `Promise<boolean>` — `delete({ count: "exact" }).eq("id", elementId).eq("dog_id", dogId)`; returns `true` if a row was deleted, `false` if 0 rows matched. The `training_logs_element_id_fkey ON DELETE CASCADE` removes that element's tick history automatically.

#### 2. Create element API route

**File**: `src/pages/api/dog/[id]/elements/index.ts`

**Intent**: Accept a JSON POST to create a new element for the dog identified by the `id` route param, following the validation/error-shape pattern of `src/pages/api/dog/index.ts`.

**Contract**:

- `export const prerender = false`
- `POST` handler: returns `Response.json({ error: "Unauthorized" }, { status: 401 })` if `context.locals.user` is null; validates `context.params.id` with `z.uuid()` — `Response.json({ error: "Not found" }, { status: 404 })` on failure; calls `getDogById(supabase, dogId)` (from `@/lib/services/dogs`) — 404 if `null` (not found, foreign, or soft-deleted); parses the JSON body `{ name }` with zod (`z.string().trim().min(1, "Element name is required").max(100, "Element name must be 100 characters or fewer")`) — 400 with the zod message on failure; calls `isElementNameTaken(supabase, dogId, name)` — 409 `{ error: "An element with that name already exists" }` if `true`; calls `createTrainingElement(supabase, dogId, name)` and returns `Response.json({ success: true, element })`; 500 with the extracted error message on Supabase error (reuse the error-message extraction helper inline, matching `src/pages/api/dog/index.ts`)

#### 3. Rename + delete element API route

**File**: `src/pages/api/dog/[id]/elements/[elementId]/index.ts`

**Intent**: Accept JSON `PATCH` (rename) and `DELETE` (remove) for one element, scoped to the dog identified by `id`.

**Contract**:

- `export const prerender = false`
- Both handlers: 401 if `context.locals.user` is null; validate `context.params.id` (dogId) and `context.params.elementId` with `z.uuid()` each — 404 `{ error: "Not found" }` if either fails; call `getDogById(supabase, dogId)` — 404 if `null`
- `PATCH`: parse JSON body `{ name }` with the same zod schema as create — 400 on failure; call `isElementNameTaken(supabase, dogId, name, elementId)` — 409 if `true`; call `renameTrainingElement(supabase, dogId, elementId, name)` — 404 if `null`; else `Response.json({ success: true, element })`; 500 on Supabase error
- `DELETE`: call `deleteTrainingElement(supabase, dogId, elementId)` — 404 if `false`; else `Response.json({ success: true })`; 500 on Supabase error

### Success Criteria:

#### Automated Verification:

- TypeScript compiles without errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- POST `/api/dog/<dogId>/elements` with `{"name":"Heelwork"}` creates a row with `sort_position = 0` for that dog's first element
- A second POST with a different name creates a row with `sort_position = 1`
- POST with a duplicate name (any case, e.g. `heelwork`) returns 409 with "An element with that name already exists"
- POST with an empty or >100-char name returns 400 with a validation message
- POST with a `dogId` that doesn't exist or belongs to another user returns 404
- PATCH `/api/dog/<dogId>/elements/<elementId>` with `{"name":"New name"}` updates the row and returns the updated element
- PATCH renaming an element to its own current name (same or different case) succeeds — no false 409
- PATCH renaming to a name already used by a _different_ element of the same dog returns 409
- DELETE `/api/dog/<dogId>/elements/<elementId>` removes the row; a direct query confirms its `training_logs` rows are also gone (FK cascade)
- DELETE for a non-existent or foreign `elementId`/`dogId` returns 404

---

## Phase 2: Page structure

### Overview

Add the `/dogs/[id]/elements` page, server-rendering the dog's elements as a static list with a back link to the dog's dashboard. Update the dog dashboard tile to show the live element count and link to the new page. No middleware changes — `/dogs/<uuid>/elements` is already covered by `PROTECTED_ROUTES` (`/dogs` prefix) and `DOG_ID_REGEX` populates `context.locals.selectedDog`.

### Changes Required:

#### 1. Training elements page

**File**: `src/pages/dogs/[id]/elements.astro`

**Intent**: Server-rendered shell for element management. Guards on `Astro.locals.selectedDog` (same null-check pattern as `dashboard.astro`), fetches the dog list (for the switcher) and the dog's elements, and renders them as a static, read-only `<ul>` plus a back link. Phase 3 replaces the `<ul>` with the interactive island — until then this page is a complete, working (read-only) view.

**Contract**:

- Uses `AuthLayout`, passing `dogs` (via `getDogsList`) and a `title` derived from `selectedDog.name`
- Calls `getTrainingElements(supabase, selectedDog.id)` and renders one `<li>` per element (name only), in the order returned (already `sort_position ASC, created_at ASC`)
- Renders an empty-state message ("No training elements yet.") when the list is empty
- Renders a back link to `/dogs/${selectedDog.id}/dashboard`

#### 2. Dashboard tile update

**File**: `src/pages/dogs/[id]/dashboard.astro`

**Intent**: Replace the "Training elements — coming soon" placeholder tile (lines 25-29) with a live summary.

**Contract**:

- Calls `getTrainingElements(supabase, selectedDog.id)` and uses `elements.length` for the count
- Tile body: `"{count} training element(s) configured"` when `count > 0`, or `"No training elements yet."` when `count === 0`
- Tile includes a link/button "Manage elements" → `/dogs/${selectedDog.id}/elements`

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Unauthenticated GET `/dogs/<uuid>/elements` redirects to `/auth/signin`
- GET `/dogs/<id>/elements` for a soft-deleted or another user's dog redirects to `/dashboard` (existing middleware behavior, unchanged)
- GET `/dogs/<id>/elements` for an owned dog renders the dog switcher, a back link to `/dogs/<id>/dashboard`, and a list of the dog's element names in saved order
- GET `/dogs/<id>/elements` for a dog with zero elements shows "No training elements yet."
- `/dogs/<id>/dashboard` tile shows the correct element count and a "Manage elements" link to `/dogs/<id>/elements`
- `/dogs/<id>/dashboard` tile shows "No training elements yet." when the dog has zero elements

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: React islands (CRUD)

### Overview

Install shadcn `dialog` and `input`. Build `TrainingElementsManager` (the main island, using `useMounted` to swap from Phase 2's static list to an interactive one), `AddElementDialog`, `RenameElementDialog`, `DeleteElementDialog`, and `ElementRow`. Wire the manager into `elements.astro`, replacing the static `<ul>`. After this phase, add/rename/delete are fully functional with no page reloads (order is still fixed — Phase 4 adds reordering).

### Changes Required:

#### 1. Install shadcn Dialog

**File**: `src/components/ui/dialog.tsx` (generated)

**Intent**: Add the shadcn Dialog component used by Add and Rename forms.

**Contract**: Run `npx shadcn@latest add dialog`; commit the generated file.

#### 2. Install shadcn Input

**File**: `src/components/ui/input.tsx` (generated)

**Intent**: Add the shadcn Input component for the Add/Rename name fields.

**Contract**: Run `npx shadcn@latest add input`; commit the generated file.

#### 3. AddElementDialog

**File**: `src/components/training-elements/AddElementDialog.tsx`

**Intent**: A shadcn Dialog with a name input; on submit, POSTs to the create API and reports the new element back to the parent for local state insertion.

**Contract**:

- Props: `dogId: string`, `onAdded: (element: TrainingElement) => void`
- Trigger: `Button` labelled "Add element"
- Dialog body: shadcn `Input` bound to `name`, Save/Cancel buttons
- On submit: `fetch(`/api/dog/${dogId}/elements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })`; disable Save during the fetch
- 401 → `window.location.href = "/auth/signin"`
- 400/409 → `toast.error(data.error)`, dialog stays open, input retains its value
- 500/network error → `toast.error("Something went wrong — please try again")`, dialog stays open
- success (`{ success: true, element }`) → call `onAdded(element)`, clear the input, close the dialog

#### 4. RenameElementDialog

**File**: `src/components/training-elements/RenameElementDialog.tsx`

**Intent**: A shadcn Dialog pre-filled with the element's current name; on submit, PATCHes the rename API and reports the updated element back.

**Contract**:

- Props: `dogId: string`, `element: TrainingElement`, `onRenamed: (element: TrainingElement) => void`
- Trigger: icon `Button` (lucide `Pencil`), `aria-label="Rename {element.name}"`
- Dialog body: shadcn `Input` initialized to `element.name`, Save/Cancel
- On submit: `fetch(`/api/dog/${dogId}/elements/${element.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })`; disable Save during the fetch
- Same 401/400/409/500 handling as `AddElementDialog`
- success → call `onRenamed(element)`, close the dialog

#### 5. DeleteElementDialog

**File**: `src/components/training-elements/DeleteElementDialog.tsx`

**Intent**: A shadcn AlertDialog confirming permanent deletion, explicitly warning that the element's training history will be lost — the deliberate exception to the grid's no-confirmation rule, per `roadmap-suggestions.md`.

**Contract**:

- Props: `dogId: string`, `element: TrainingElement`, `onDeleted: (elementId: string) => void`
- Trigger: destructive icon `Button` (lucide `Trash2`), `aria-label="Delete {element.name}"`
- Dialog body: `Delete "{element.name}"? All training history logged for this element will be permanently deleted. This cannot be undone.`
- On confirm: `fetch(`/api/dog/${dogId}/elements/${element.id}`, { method: "DELETE" })`; disable the confirm button during the fetch
- 401 → `window.location.href = "/auth/signin"`
- success (`{ success: true }`) → call `onDeleted(element.id)`, close the dialog
- error → close the dialog, `toast.error(data.error ?? "Failed to delete element")`

#### 6. ElementRow

**File**: `src/components/training-elements/ElementRow.tsx`

**Intent**: Renders one element's name plus its Rename and Delete controls in a row. Phase 4 adds a drag handle to this component.

**Contract**: Props `dogId: string`, `element: TrainingElement`, `onRenamed: (element: TrainingElement) => void`, `onDeleted: (elementId: string) => void`. Renders `element.name`, `<RenameElementDialog>`, and `<DeleteElementDialog>` in a flex row.

#### 7. TrainingElementsManager

**File**: `src/components/training-elements/TrainingElementsManager.tsx`

**Intent**: The main island. Holds the elements list in local state; before hydration (and during SSR) renders the same static list as Phase 2 so there is no layout shift, then swaps to the interactive list once mounted. Reorder UI is added in Phase 4.

**Contract**:

- Props: `dogId: string`, `initialElements: TrainingElement[]`
- `const [elements, setElements] = useState(initialElements)`; `const mounted = useMounted();`
- if `!mounted`: render a static `<ul>` of `elements.map(e => e.name)` — visually matching Phase 2's markup (no controls), avoiding hydration mismatch
- if `mounted`: render `elements.length === 0 ? <EmptyState/> : elements.map(e => <ElementRow key={e.id} dogId={dogId} element={e} onRenamed={...} onDeleted={...} />)`, plus `<AddElementDialog dogId={dogId} onAdded={...} />`
- `onAdded`: append the new element to `elements`
- `onRenamed`: replace the matching element (by `id`) in `elements` with the updated one
- `onDeleted`: remove the matching element (by `id`) from `elements`

#### 8. Wire into elements page

**File**: `src/pages/dogs/[id]/elements.astro`

**Intent**: Replace Phase 2's static `<ul>` with the live island.

**Contract**: Import `TrainingElementsManager`; replace the static list block with `<TrainingElementsManager dogId={selectedDog.id} initialElements={elements} client:load />`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `/dogs/<id>/elements` shows the element list immediately on load (matching Phase 2's static markup), then becomes interactive (Add button + per-row edit/delete icons appear) after hydration with no visible layout shift
- "Add element" opens a dialog; submitting a valid name adds the element to the list with no page reload
- Submitting a duplicate name (any case) shows a toast error and the dialog stays open
- Submitting an empty or >100-char name shows a toast validation error
- Clicking the rename icon on a row opens a dialog pre-filled with the current name; saving updates that row in place with no page reload
- Renaming to a name already used by another element of the same dog shows a toast error
- Clicking the delete icon opens a confirmation dialog that names the element and warns training history will be permanently deleted; cancelling makes no change
- Confirming delete removes the row from the list with no page reload
- An API error during add/rename/delete shows a toast error and leaves the list in its prior state
- A 401 (expired session) on any action navigates to `/auth/signin`
- Full mobile round-trip (phone viewport): add, rename, and delete an element

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Drag-and-drop reorder

### Overview

Add the `reorder_training_elements` RPC migration, the corresponding service function and API route, install `@dnd-kit`, give `ElementRow` a drag handle, and add "Save order" with dirty-tracking to `TrainingElementsManager`. This is its own end-to-end vertical slice (data, API, and UI together) so a regression here is isolated from the CRUD flow shipped in Phases 1-3.

### Changes Required:

#### 1. Reorder RPC migration

**File**: `supabase/migrations/20260610000001_reorder_training_elements_fn.sql`

**Intent**: Persist a full reordering of a dog's elements in a single atomic round trip. See "Critical Implementation Details" for why this function is `SECURITY INVOKER` (the default), unlike `soft_delete_dog`.

**Contract**:

- `CREATE OR REPLACE FUNCTION reorder_training_elements(p_dog_id uuid, p_element_ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$ ... $$` (no `SECURITY DEFINER`)
- Body iterates `p_element_ids` with ordinality and sets `sort_position` to the zero-based position:
  ```sql
  UPDATE training_elements AS te
  SET sort_position = ord.idx - 1
  FROM unnest(p_element_ids) WITH ORDINALITY AS ord(id, idx)
  WHERE te.id = ord.id AND te.dog_id = p_dog_id;
  ```
- `REVOKE EXECUTE ON FUNCTION reorder_training_elements(uuid, uuid[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION reorder_training_elements(uuid, uuid[]) TO authenticated;`
- Rollback comment: `REVOKE EXECUTE ON FUNCTION reorder_training_elements(uuid, uuid[]) FROM authenticated; DROP FUNCTION IF EXISTS reorder_training_elements(uuid, uuid[]);`

#### 2. Reorder service function

**File**: `src/lib/services/training-elements.ts`

**Intent**: Add the fifth CRUD function, calling the new RPC.

**Contract**: `reorderTrainingElements(supabase, dogId: string, orderedIds: string[]) → Promise<void>` — `supabase.rpc("reorder_training_elements", { p_dog_id: dogId, p_element_ids: orderedIds })`; throw on `error`.

#### 3. Reorder API route

**File**: `src/pages/api/dog/[id]/elements/reorder.ts`

**Intent**: Accept the new element order from the island and persist it.

**Contract**:

- `export const prerender = false`
- `PATCH`: 401 if `context.locals.user` is null; validate `context.params.id` (dogId) with `z.uuid()` — 404 on failure; call `getDogById(supabase, dogId)` — 404 if `null`; parse JSON body `{ elementIds: string[] }` with `z.object({ elementIds: z.array(z.uuid()).min(1) })` — 400 on failure; call `reorderTrainingElements(supabase, dogId, elementIds)` and return `Response.json({ success: true })`; 500 on Supabase error

#### 4. Install @dnd-kit

**File**: `package.json`

**Intent**: Add the drag-and-drop dependencies.

**Contract**: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

#### 5. Drag handle on ElementRow

**File**: `src/components/training-elements/ElementRow.tsx`

**Intent**: Make each row draggable via a dedicated grip handle, without making the whole row a drag target (see "Critical Implementation Details" — touch scroll must keep working).

**Contract**: Use `useSortable({ id: element.id })` from `@dnd-kit/sortable`; apply `transform`/`transition` (via `CSS.Transform.toString` from `@dnd-kit/utilities`) to the row's wrapping element via `style`; attach the hook's `attributes` and `listeners` only to a `GripVertical` (lucide-react) icon at the start of the row — not the row container or its other controls.

#### 6. Reorder + Save UI in TrainingElementsManager

**File**: `src/components/training-elements/TrainingElementsManager.tsx`

**Intent**: Wrap the element list in dnd-kit's drag context, track whether the order has changed since the last save, and show a "Save order" button when it has.

**Contract**:

- Wrap the mounted/interactive list in `<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>` and `<SortableContext items={elements.map(e => e.id)} strategy={verticalListSortingStrategy}>`
- `sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`
- `handleDragEnd`: if `over && active.id !== over.id`, `setElements(items => arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id)))`
- `originalOrder` ref initialized from `initialElements.map(e => e.id)`; `onAdded`/`onDeleted` (from Phase 3) also push/splice `originalOrder.current` so add/delete never trigger a false-dirty state (see "Critical Implementation Details")
- `isDirty = elements.map(e => e.id).join(",") !== originalOrder.current.join(",")`
- "Save order" button renders only when `isDirty`; on click, `fetch(`/api/dog/${dogId}/elements/reorder`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ elementIds: elements.map(e => e.id) }) })`; disable the button during the fetch
- 401 → `window.location.href = "/auth/signin"`
- success → `originalOrder.current = elements.map(e => e.id)`, `toast.success("Order saved")`
- error → `toast.error(data.error ?? "Failed to save order")`; local order is left as-is so the user can retry "Save order"

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
- Migration file exists at `supabase/migrations/20260610000001_reorder_training_elements_fn.sql`

#### Manual Verification:

- Migration applies cleanly; `reorder_training_elements(uuid, uuid[])` is callable via `supabase.rpc(...)` for an authenticated user and a no-op (0 rows touched) for a `dog_id` the caller doesn't own
- Dragging a row by its grip handle reorders the list locally; "Save order" appears
- Adding or deleting an element while the order is otherwise unchanged does **not** show "Save order"
- Reordering, then adding a new element, still shows "Save order" (for the original reorder); the new element is appended at the end and doesn't itself trigger dirtiness
- Clicking "Save order" persists the order; reloading `/dogs/<id>/elements` shows elements in the saved order, and the dashboard tile/grid (when built) would read the same order
- "Save order" shows a loading state during the fetch
- An API error on save shows a toast error; the local order is unchanged and "Save order" remains available to retry
- Keyboard reordering works: Tab to a grip handle, Space to pick up, Arrow keys to move, Space to drop
- Full mobile round-trip (phone viewport): drag-reorder via touch on the grip handle; the page still scrolls normally when touching elsewhere in a row
- A single-element list never shows "Save order" (no possible reorder)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Manual Testing Steps:

1. Sign in, navigate to a dog's `/dogs/<id>/dashboard` with zero elements → tile shows "No training elements yet." and "Manage elements" link
2. Click "Manage elements" → `/dogs/<id>/elements` shows "No training elements yet." and an "Add element" button
3. Add "Heelwork" → appears in the list immediately, no reload
4. Add "heelwork" (different case) → toast error "An element with that name already exists"; list unchanged
5. Add "Recall" and "Stay" → list now shows 3 elements in creation order
6. Rename "Stay" to "Heelwork" (matches an existing element's name) → toast error; "Stay" unchanged
7. Rename "Stay" to "Wait" → row updates in place
8. Click delete on "Recall" → dialog warns about permanent history loss; cancel → no change
9. Confirm delete on "Recall" → row disappears, no reload
10. Drag "Wait" above "Heelwork" via the grip handle → list reorders locally; "Save order" appears
11. Reload the page without clicking "Save order" → order reverts to the last-saved order (drag was not persisted)
12. Drag again, click "Save order" → toast confirms; reload the page → new order persists
13. Return to `/dogs/<id>/dashboard` → tile now shows "2 training element(s) configured"
14. Repeat steps 3-12 on a phone viewport, confirming touch drag works and the page still scrolls

## Migration Notes

`20260610000001_reorder_training_elements_fn.sql` adds one new RPC function only — no schema or RLS changes, no data migration. Safe to apply to any environment (dev or production) independently of the other phases' code, though the function is unused until Phase 4's UI calls it.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- Roadmap suggestions: `context/foundation/roadmap-suggestions.md` (S-03 section — sort_position and confirmation-step requirements)
- PRD: `context/foundation/prd.md` (FR-004)
- Lessons: `context/foundation/lessons.md` (`(select auth.uid())` in RLS, `useMounted` for hydration guards, revoke anon SELECT)
- Dog service pattern: `src/lib/services/dogs.ts`
- Dog API route pattern: `src/pages/api/dog/index.ts`, `src/pages/api/dog/[id]/index.ts`
- RPC + ownership pattern (contrast for SECURITY DEFINER vs INVOKER): `supabase/migrations/20260531000002_soft_delete_dog_fn.sql`
- Delete confirmation pattern: `src/components/dogs/DeleteDogModal.tsx`
- Hydration guard hook: `src/components/hooks/useMounted.ts`
- Dashboard placeholder being replaced: `src/pages/dogs/[id]/dashboard.astro:25-29`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer (CRUD)

#### Automated

- [x] 1.1 TypeScript compiles without errors: `npm run build` — fdb7b94
- [x] 1.2 Lint passes: `npm run lint` — fdb7b94

#### Manual

- [x] 1.3 POST `/api/dog/<dogId>/elements` with a valid name creates an element with `sort_position = 0` for the dog's first element — fdb7b94
- [x] 1.4 A second POST creates an element with `sort_position = 1` — fdb7b94
- [x] 1.5 POST with a duplicate name (any case) returns 409 "An element with that name already exists" — fdb7b94
- [x] 1.6 POST with an empty or >100-char name returns 400 with a validation message — fdb7b94
- [x] 1.7 POST with a non-existent or foreign `dogId` returns 404 — fdb7b94
- [x] 1.8 PATCH renames an element and returns the updated element — fdb7b94
- [x] 1.9 PATCH renaming an element to its own current name (any case) succeeds — no false 409 — fdb7b94
- [x] 1.10 PATCH renaming to a name used by a different element of the same dog returns 409 — fdb7b94
- [x] 1.11 DELETE removes the element and cascades its `training_logs` rows — fdb7b94
- [x] 1.12 DELETE for a non-existent or foreign `elementId`/`dogId` returns 404 — fdb7b94

### Phase 2: Page structure

#### Automated

- [x] 2.1 TypeScript compiles: `npm run build` — b0cb6ef
- [x] 2.2 Lint passes: `npm run lint` — b0cb6ef

#### Manual

- [x] 2.3 Unauthenticated GET `/dogs/<uuid>/elements` redirects to `/auth/signin` — b0cb6ef
- [x] 2.4 GET `/dogs/<id>/elements` for a soft-deleted or foreign dog redirects to `/dashboard` — b0cb6ef
- [x] 2.5 GET `/dogs/<id>/elements` for an owned dog renders the switcher, back link, and element list in saved order — b0cb6ef
- [x] 2.6 GET `/dogs/<id>/elements` for a dog with zero elements shows "No training elements yet." — b0cb6ef
- [x] 2.7 `/dogs/<id>/dashboard` tile shows the correct element count and "Manage elements" link — b0cb6ef
- [x] 2.8 `/dogs/<id>/dashboard` tile shows "No training elements yet." when the dog has zero elements — b0cb6ef

### Phase 3: React islands (CRUD)

#### Automated

- [x] 3.1 TypeScript compiles: `npm run build` — d15aef9
- [x] 3.2 Lint passes: `npm run lint` — d15aef9

#### Manual

- [x] 3.3 `/dogs/<id>/elements` shows the static list immediately, then becomes interactive after hydration with no layout shift — d15aef9
- [x] 3.4 "Add element" dialog adds a valid element with no page reload — d15aef9
- [x] 3.5 Adding a duplicate name (any case) shows a toast error; dialog stays open — d15aef9
- [x] 3.6 Adding an empty or >100-char name shows a toast validation error — d15aef9
- [x] 3.7 Rename dialog pre-fills the current name and updates the row in place with no reload — d15aef9
- [x] 3.8 Renaming to a name used by another element shows a toast error — d15aef9
- [x] 3.9 Delete dialog names the element and warns about permanent history loss; cancel makes no change — d15aef9
- [x] 3.10 Confirming delete removes the row with no page reload — d15aef9
- [x] 3.11 An API error during add/rename/delete shows a toast error and leaves the list unchanged — d15aef9
- [x] 3.12 A 401 on any action navigates to `/auth/signin` — d15aef9
- [x] 3.13 Full mobile round-trip: add, rename, delete — d15aef9
- [x] 3.14 `npm run dev` renders `/dogs/<id>/elements` with no console errors (verify after clearing `node_modules/.vite` — the `radix-ui` 1.4.3→1.5.0 bump from `shadcn add dialog`/`add input` left a stale SSR dep-optimize cache causing "Invalid hook call" / `useState` on `null`) — d15aef9

### Phase 4: Drag-and-drop reorder

#### Automated

- [x] 4.1 TypeScript compiles: `npm run build` — 686e1e2
- [x] 4.2 Lint passes: `npm run lint` — 686e1e2
- [x] 4.3 Migration file exists: `supabase/migrations/20260610000001_reorder_training_elements_fn.sql` — 686e1e2

#### Manual

- [x] 4.4 Migration applies cleanly; `reorder_training_elements` is callable and a no-op for a `dog_id` the caller doesn't own — 686e1e2
- [x] 4.5 Dragging a row by its grip handle reorders the list locally and shows "Save order" — 686e1e2
- [x] 4.6 Adding or deleting an element without reordering does not show "Save order" — 686e1e2
- [x] 4.7 Reordering then adding an element still shows "Save order" for the reorder; the new element doesn't add extra dirtiness — 686e1e2
- [x] 4.8 "Save order" persists the order; reload shows the new order — 686e1e2
- [x] 4.9 "Save order" shows a loading state during the fetch — 686e1e2
- [x] 4.10 An API error on save shows a toast error; local order unchanged, retry available — 686e1e2
- [x] 4.11 Keyboard reordering works (Tab, Space, Arrow keys, Space) — 686e1e2
- [x] 4.12 Full mobile round-trip: touch drag-reorder; page still scrolls normally elsewhere — 686e1e2
- [x] 4.13 A single-element list never shows "Save order" — 686e1e2
