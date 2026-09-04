# Competition Reference Data (F-01) — Plan Brief

> Full plan: `context/changes/competition-reference-data/plan.md`

## What & Why

Seed the three fixed competition classes (Class 1/2/3) — each with its exercises,
per-exercise point multiplier, and short "Shortcut" display name — as non-user-editable
Postgres reference data (FR-005, FR-006). This is a pure foundation slice: it exists so
S-01 (competition-results core) and S-02 (element-exercise linking) have real,
correctly-seeded data and a service layer to build on.

## Starting Point

No competition/class/exercise concept exists anywhere in the codebase today. `dogs` and
`training_elements` are the only precedent for a new-table migration, and both are
account/dog-scoped; this is the app's first _global_, non-account-scoped table.

## Desired End State

Two new Postgres tables exist, RLS-enabled and seeded with all 29 exercises across the 3
classes. `src/types.ts` gains `CompetitionClass`/`Exercise` types. A new
`src/lib/services/competition.ts` exposes `getCompetitionClasses()` and
`getExercisesForClass()`. An integration test locks in the exact seeded counts, values,
and the RLS read boundary.

## Key Decisions Made

| Decision                                          | Choice                                                             | Why (1 sentence)                                                                                                                               | Source |
| ------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Ambiguous "Distance control" multiplier (Class 1) | Resolved to `4`                                                    | Matches Class 2 and Class 3's "Distance control" multiplier; the source note's "4 40" was a stray artifact.                                    | Plan   |
| "Shortcut" values (FR-006, none existed)          | User supplied the full 29-row list                                 | Seeded once correctly — this data isn't admin-editable in-app, so a placeholder would need a manual out-of-band fix later anyway.              | Plan   |
| API surface for this slice                        | Service-layer functions only, no `GET` route                       | Matches how existing SSR pages call services directly (`getDogById`, `getTrainingElements`); no consumer exists yet to justify a route.        | Plan   |
| Schema shape                                      | Two normalized tables (`competition_classes`, `exercises` with FK) | Matches the repo's existing normalized style and lets S-02 join `exercises` cleanly for element-linking.                                       | Plan   |
| Grants                                            | `SELECT` only, to `authenticated` + `service_role`                 | Nothing in the app ever writes these rows (FR-005 forbids in-app editing) — full CRUD grants would be wrong here, unlike every existing table. | Plan   |
| Testing approach                                  | Real-Supabase integration test (no mocks)                          | The only pattern this repo uses for verifying persisted data (`data-integrity.test.ts`).                                                       | Plan   |

## Scope

**In scope:**

- `competition_classes` + `exercises` tables, RLS, grants, full seed data
- `CompetitionClass`/`Exercise` types
- `getCompetitionClasses()` / `getExercisesForClass()` service functions
- Integration test (counts, spot-checked values, RLS boundary)

**Out of scope:**

- Any API route or UI (S-01/S-02's job)
- Admin editing of classes/exercises (FR-005 Non-Goal — out-of-band migration only)
- `element_exercise_link` table (S-02) and per-dog default-class (S-03)
- Competition/score tables (S-01)

## Architecture / Approach

One migration creates both tables (normalized, `exercises.class_id → competition_classes.id`)
with RLS + grants + the literal seed `INSERT`s, since only a migration guarantees this
data exists in every environment including production. Types + a thin read-only service
layer follow immediately, in the same shape as the existing `training-elements.ts`
pattern. No API route or UI — those belong to the slices that actually consume this data.

## Phases at a Glance

| Phase                    | What it delivers                                            | Key risk                                                                                                                            |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Migration             | Schema, RLS, grants, full 3-class/29-exercise seed data     | A transcription error in the seed data silently skews every downstream average — not self-correcting since it's not admin-editable. |
| 2. Types + service layer | `CompetitionClass`/`Exercise` types, two read-only getters  | Low — thin, well-precedented pattern.                                                                                               |
| 3. Tests                 | Integration test: counts, spot-checked values, RLS boundary | Low — established test pattern, just new assertions.                                                                                |

**Prerequisites:** None — this is a foundation slice with no dependencies.
**Estimated effort:** ~1 session, single PR.

## Open Risks & Assumptions

- The seed data in `context/foundation/post-mvp-features.md:11-44` is treated as final;
  any further rulebook corrections require a new migration (this data isn't
  admin-editable).
- `service_role`'s table-level `SELECT`-only grant (no write grants) is a deliberate
  deviation from the existing full-CRUD grant pattern on `dogs`/`training_elements` — an
  implementer copying that pattern verbatim would over-grant.

## Success Criteria (Summary)

- `competition_classes` has exactly 3 rows and `exercises` has exactly 29 rows, correctly
  linked and multiplied, verified by an automated test.
- Any authenticated user can read all classes/exercises; `anon` cannot.
- S-01 and S-02 can be planned and built against `getCompetitionClasses()` /
  `getExercisesForClass()` without touching the schema again.
