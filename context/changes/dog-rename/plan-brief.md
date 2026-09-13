# Dog Rename — Plan Brief

> Full plan: `context/changes/dog-rename/plan.md`

## What & Why

Handlers can rename training elements but not dogs — a mis-typed or outdated dog name has no fix path. This adds dog rename to close that CRUD asymmetry, per PRD-v2 FR-003.

## Starting Point

The `dogs` table, RLS, and grants already exist and need no migration. Dog CRUD today covers create, soft-delete, and set-default-class, but no rename `PATCH` endpoint exists. The training-element rename feature (API route, service function, dialog component) is a working, shippable pattern already in the codebase — this change mirrors it almost exactly.

## Desired End State

On a dog's dashboard page, the handler clicks a rename icon next to the dog's name, edits it in a dialog, and saves. The page reloads and the new name appears everywhere the dog is referenced — dashboard heading, browser tab title, and the dog switcher dropdown.

## Key Decisions Made

| Decision            | Choice                                        | Why (1 sentence)                                                                                                                                         | Source               |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Rename entry point  | Per-dog dashboard header only                 | Mirrors the element-rename pattern exactly and sits next to the existing Delete-dog control on the same page                                             | Plan                 |
| Post-rename refresh | Full page reload                              | No client-side cache exists anywhere in the app, so a reload is the simplest way to refresh every surface (title, switcher, heading) that holds the name | Plan                 |
| Name validation     | Same as training elements (trim, 1–100 chars) | Consistency with the existing `createDogSchema` already used for dog creation                                                                            | Plan                 |
| Uniqueness check    | None                                          | FR-003's Socrates round explicitly rejects it — dogs are keyed by ID everywhere, duplicate names are cosmetic                                            | Plan (PRD-v2 FR-003) |
| Test coverage       | Unit test only (cross-account authorization)  | Matches the project's current baseline — no rename flow, element or dog, has E2E coverage today                                                          | Plan                 |

## Scope

**In scope:**

- `PATCH /api/dog/[id]` endpoint + `renameDog` service function
- `RenameDogDialog` component wired into the per-dog dashboard page
- Cross-account authorization unit test

**Out of scope:**

- Rename entry points on the dog switcher, "My Dogs" list, grid, elements, or competition-results pages
- In-place client-state updates across islands (relies on full reload instead)
- E2E test coverage
- Any schema/migration change or uniqueness constraint

## Architecture / Approach

Three-layer mirror of the existing element-rename feature: service function (`src/lib/services/dogs.ts`) → API route (`src/pages/api/dog/[id]/index.ts`, new `PATCH` alongside existing `DELETE`) → dialog component (`src/components/dogs/RenameDogDialog.tsx`) wired into `src/pages/dogs/[id]/dashboard.astro` using the same placeholder/island hydration pattern as `DeleteDogModal`. The single deliberate deviation from the mirrored pattern: no uniqueness check on the name.

## Phases at a Glance

| Phase       | What it delivers                                                     | Key risk                                                                                                   |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1. Backend  | `renameDog` service function + `PATCH` endpoint + cross-account test | Low — near-identical to `setDefaultClassNumber`/`renameTrainingElement` already in the codebase            |
| 2. Frontend | `RenameDogDialog` wired into the per-dog dashboard                   | Low — mirrors `DeleteDogModal`'s placeholder/island pattern and `RenameElementDialog`'s form/state pattern |

**Prerequisites:** None — no dependency on any other roadmap slice.
**Estimated effort:** ~1 session, well under a day.

## Open Risks & Assumptions

- Assumes a full page reload after rename is an acceptable UX tradeoff versus an instant in-place update (confirmed with the user — no client cache exists to make an in-place update fully consistent anyway, since page titles and SSR placeholders can't be updated without a reload regardless).

## Success Criteria (Summary)

- A handler can rename a dog from its dashboard page and see the new name everywhere afterward.
- A handler cannot rename another account's dog (verified by unit test + manual `curl` check).
- No regression to existing dog create/delete/default-class flows.
