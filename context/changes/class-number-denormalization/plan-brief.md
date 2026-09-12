# Class Number Denormalization — Plan Brief

> Full plan: `context/changes/class-number-denormalization/plan.md`
> Research: `context/changes/class-number-denormalization/research.md`

## What & Why

Replace `class_id` (uuid FK to a `competition_classes` lookup table) with `class_number` (smallint, `CHECK`-validated) on `exercises` and `competitions`, and remove `competition_classes` entirely. `competition_classes` is fixed 3-row rulebook data with no app-writable path — a lookup table is overhead for data that never changes in-app, and `class_number` (unlike a `gen_random_uuid()`-derived `class_id`) is identical across every environment, making `?classNumber=1`-style URLs portable.

## Starting Point

`competition-results-core` is fully implemented and impl-reviewed (0 critical findings) but unmerged, on the same branch (`competition-results`) as this change. `competition_classes.class_number` already exists (added by an earlier precursor migration) but today it's only used to resolve a `class_id`, not as the direct linkage.

## Desired End State

`class_id`/`competition_classes` no longer exist anywhere in the schema or code. `class_number` is the direct, `CHECK`-validated linkage on both `exercises` and `competitions`. Class display metadata lives in a new `src/const.ts` module. All existing competition-results functionality — class switching, adding competitions, scoring, RLS enforcement, green/red highlighting — behaves identically, just keyed by `class_number`.

## Key Decisions Made

| Decision               | Choice                                                                                                                                      | Why (1 sentence)                                                                                                                                      | Source   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Ship sequencing        | Bundle with `competition-results-core` in one unmerged PR                                                                                   | Avoids a prod window where `class_id`/`competition_classes` exist without `class_number` already in place — no live-data backfill scenario.           | Research |
| Migration strategy     | Edit the 4 existing migrations in place; delete the vestigial class_number-backfill migration                                               | Nothing has ever been applied outside ephemeral local/CI instances, so a clean final migration set beats appending a transient create-then-drop pass. | Plan     |
| Const module location  | `src/const.ts` (flat top-level file)                                                                                                        | User's explicit choice over a `src/lib/domain/` or component-scoped alternative.                                                                      | Plan     |
| Service function shape | Collapse `getCompetitionClasses`/`getExercisesForClass`/`getExercisesForClassNumber` into one `getExercisesForClass(supabase, classNumber)` | `class_number` is now directly filterable — the old resolve-then-fetch round trip is gone.                                                            | Plan     |
| API validation         | `z.union` of literals derived from `COMPETITION_CLASSES`                                                                                    | Mirrors the DB's `CHECK (class_number IN (1,2,3))` exactly and self-updates if a class is ever added.                                                 | Plan     |
| Component data flow    | `CompetitionResultsGrid.tsx` imports `COMPETITION_CLASSES` directly, no `classes` prop                                                      | User's explicit choice — one fewer prop threaded through the Astro→React boundary.                                                                    | Plan     |
| URL param              | Clean rename `?classId=` → `?classNumber=`, no back-compat shim                                                                             | Ships before any prod exposure — zero real-world URLs to break; matches the no-unnecessary-shims convention.                                          | Plan     |

## Scope

**In scope:** Schema (4 migrations), `src/types.ts`, new `src/const.ts`, 3 service files, 1 API route, 2 UI components + 1 Astro page, the test seeding helper, and all 5 affected test files.

**Out of scope:** Any change to `exercises.id` or `competition_scores.exercise_id`; any admin UI for editing classes; a `?classId=` back-compat shim; archiving `competition-results-core` on its own; any new feature or UX beyond the mechanical rename.

## Architecture / Approach

Two phases split along the only independently-verifiable boundary: schema migrations (verifiable via a local `supabase db reset` alone) versus everything else. Every application-layer file changes together as one phase, since TypeScript's project-wide compilation and vitest's integration tests only go green once every consumer of the renamed field is updated in lockstep — there's no meaningful "half-renamed" state to gate on.

## Phases at a Glance

| Phase                       | What it delivers                                                                                                                                  | Key risk                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1. Schema                   | 4 migrations rewritten in place; `class_number` is the direct, `CHECK`-validated column on `exercises`/`competitions`; `competition_classes` gone | A stale local/CI Supabase instance needs `supabase db reset` to pick up the rewritten migrations |
| 2. Application code & tests | Types, `src/const.ts`, service collapse, API validation, both UI components, the Astro page, and all 5 test files updated together                | Radix `Select` string/number coercion for `class_number` is easy to get subtly wrong             |

**Prerequisites:** None beyond `competition-results-core`'s current (unmerged) state on this branch — no separate merge or archive step needed first.
**Estimated effort:** ~1-2 sessions across the 2 phases; Phase 2 is the larger of the two (14 files) but is a mechanical, well-scoped rename.

## Open Risks & Assumptions

- Assumes no other branch or environment has independently applied the old (pre-rewrite) migrations in a way that would conflict with the in-place edit — true today per research, since nothing has been deployed with these tables.
- The `getExercisesForClassNumber` → `getExercisesForClass` collapse changes one test's expected behavior (an unrecognized class number now returns `[]` instead of `null`) — called out explicitly in Phase 2's test changes so it isn't missed as "just a rename."

## Success Criteria (Summary)

- A repo-wide grep for `class_id`, `classId`, `competition_classes`, and `CompetitionClass` returns zero hits in `src/`/`tests/`.
- `npx astro check`, `npm run lint`, and `npm run test` all pass.
- Manually switching between all 3 classes, adding competitions, and scoring exercises works identically to today, just keyed by `class_number`.
