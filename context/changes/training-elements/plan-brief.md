# Plan Brief: Training Elements

> Two-page summary. Full detail in `plan.md`.

## What & Why

S-03 / FR-004: a handler can add, rename, and remove custom training elements for the selected dog, and reorder them by drag-and-drop. Custom (per-dog) elements are the product's core differentiator — without them there's nothing for S-04's training grid to show rows for.

## Starting Point

- `training_elements` table + RLS already live (`id, dog_id, name, sort_position, created_at`, `UNIQUE(dog_id, name)`); `training_logs.element_id` already cascades on delete
- `/dogs/[id]/dashboard.astro` has a "Training elements — coming soon" placeholder tile to replace
- `src/middleware.ts` already protects `/dogs/<uuid>/*` and resolves `context.locals.selectedDog` — no middleware changes needed
- `src/types.ts` already has `TrainingElement` / `NewTrainingElement` — no type changes needed
- shadcn `dialog`/`input` not yet installed; `@dnd-kit/*` not yet a dependency

## Desired End State

`/dogs/[id]/elements` lets the handler add (dialog), rename (per-row dialog), delete (confirmation dialog warning of permanent history loss), and drag-reorder elements with an explicit "Save order" step. The dashboard tile shows the live element count and links to this page. All changes apply with no page reload.

## Key Decisions Made

| Decision                  | Choice                                                                                                 | Why                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Page location             | New dedicated page `/dogs/[id]/elements`                                                               | Keeps the dashboard tile small; element management is its own task                                                                            |
| Add UX                    | Button → dialog with name field                                                                        | User preference; consistent dialog pattern for add/rename                                                                                     |
| Rename UX                 | Per-row edit icon → dialog pre-filled with current name                                                | Mirrors Add dialog; avoids inline-edit complexity                                                                                             |
| Reordering                | In scope now (drag-and-drop via `@dnd-kit`)                                                            | User chose to do it now rather than defer to a later slice                                                                                    |
| Reorder persistence       | Explicit "Save order" button (not auto-save on drop)                                                   | User preference; avoids surprise writes on accidental drags                                                                                   |
| Duplicate names           | Case-insensitive app-level check (`isElementNameTaken`, mirrors `isDogNameTaken` but also escapes `\`) | Matches existing dog-name pattern; fixes a known escaping gap (impl-review F5)                                                                |
| Delete confirmation       | Dialog explicitly warns training history will be permanently deleted                                   | Per `roadmap-suggestions.md` — the one deliberate exception to "no confirmation dialogs" (grid ticks have none)                               |
| Reorder RPC security      | `SECURITY INVOKER` (default), unlike `soft_delete_dog`'s `SECURITY DEFINER`                            | `sort_position` isn't referenced by any SELECT RLS policy, so the existing UPDATE policy protects it directly — no WITH CHECK OPTION conflict |
| `sort_position` on create | `MAX(sort_position) + 1`, never the column default `0`                                                 | Per roadmap-suggestions risk — avoids non-deterministic ordering                                                                              |

## Scope

**In scope:** add/rename/delete elements (dialogs), drag-and-drop reorder with "Save order", new `/dogs/[id]/elements` page, dashboard tile update, new reorder RPC + migration, 3 new API routes, 1 new service file, 5 new React components, 2 new shadcn components, 1 new dependency group (`@dnd-kit/*`).

**Out of scope:** competition results (v2), soft-delete for elements (hard delete is correct per resolved roadmap unknown), bulk import/export, tick counts/history on this page (S-04), auto-save on drag, inline rename, any new migration for CRUD (existing schema/RLS already supports it).

## Architecture / Approach

Follows existing service-layer + zod API route + React-island conventions. Four phases, each independently shippable:

1. **Data layer (CRUD)** — `src/lib/services/training-elements.ts` (4 functions) + 2 API routes. No UI.
2. **Page structure** — `/dogs/[id]/elements.astro` (static SSR list) + dashboard tile update.
3. **React islands (CRUD)** — shadcn `dialog`/`input` + `TrainingElementsManager` (uses `useMounted` for SSR→interactive swap) + Add/Rename/Delete dialogs + `ElementRow`.
4. **Drag-and-drop reorder** — its own vertical slice: RPC migration + service fn + API route + `@dnd-kit` + drag handle + dirty-tracked "Save order" UI.

Phases 1-3 ship a complete CRUD experience that doesn't depend on Phase 4; Phase 4 is additive and isolated.

## Phases at a Glance

| Phase                    | Delivers                                            | New deps/migrations                                             |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| 1. Data layer (CRUD)     | Service functions + create/rename/delete API routes | —                                                               |
| 2. Page structure        | `/dogs/[id]/elements` static page + dashboard tile  | —                                                               |
| 3. React islands (CRUD)  | Fully interactive add/rename/delete, no reload      | shadcn `dialog`, `input`                                        |
| 4. Drag-and-drop reorder | Drag handle + "Save order", persists new order      | `@dnd-kit/*`, `20260610000001_reorder_training_elements_fn.sql` |

## Open Risks & Assumptions

- **Hard delete is irreversible** — confirmed intentional (resolved roadmap unknown); the delete dialog's explicit warning is the only mitigation
- **dnd-kit + React 19** — no dependency conflicts expected (dnd-kit doesn't pin a React major), but verify after `npm install` in Phase 4
- **Touch drag vs. scroll** — mitigated by isolating drag listeners to a dedicated grip-handle icon + `PointerSensor` activation distance; verify on a real phone in Phase 4's manual testing
- **`sort_position` determinism** — `MAX+1` on create plus `created_at` as a secondary sort key for any historical rows that might share a `sort_position`

## Success Criteria Summary

- `npm run build` and `npm run lint` pass after every phase
- Phase 1: full CRUD verified via direct HTTP calls (create assigns sequential `sort_position`, duplicate-name 409, rename/delete scoped + cascade confirmed)
- Phase 2: `/dogs/[id]/elements` renders a protected, static element list; dashboard tile shows live count + link
- Phase 3: add/rename/delete work with no reload, validation/duplicate/error toasts, mobile round-trip
- Phase 4: drag-reorder + "Save order" persists correctly, dirty-tracking ignores add/delete, keyboard + touch both work, single-element list never shows "Save order"
