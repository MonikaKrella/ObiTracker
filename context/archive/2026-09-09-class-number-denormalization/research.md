---
date: 2026-09-10T00:00:00Z
researcher: Claude Sonnet 5
git_commit: 15f63e6bec31c348568ce925bb8d3092db888d17
branch: competition-results
repository: MonikaKrella/ObiTracker
topic: "class-number-denormalization: is anything left unresolved in change.md?"
tags: [research, codebase, class-number-denormalization, competition-classes, competition-results-core]
status: complete
last_updated: 2026-09-10
last_updated_by: Claude Sonnet 5
---

# Research: class-number-denormalization — unresolved items in change.md

**Date**: 2026-09-10
**Researcher**: Claude Sonnet 5
**Git Commit**: 15f63e6bec31c348568ce925bb8d3092db888d17
**Branch**: competition-results
**Repository**: MonikaKrella/ObiTracker

## Research Question

`context/changes/class-number-denormalization/change.md` was written 2026-09-09, before this change has been planned or implemented. Check whether anything written in it is still unresolved: is the grepped file list still accurate, is the stated dependency (`competition-results-core`) actually closed out, and are the three "Open questions to resolve during planning" still genuinely open.

## Summary

Two things are resolved, one is not, and one nuance was missed by the original doc:

1. **File list — still fully accurate.** Every one of the 8 `src/` files and 5 `tests/` files named in change.md still references `class_id`/`classId`/`competition_classes`, with the same function names and signatures. Nothing was added or removed since 2026-09-09.
2. **Dependency ("competition-results-core must be... closed out first") — superseded by a new decision: ship both changes in one PR.** All 8 plan phases of `competition-results-core` are implemented, impl-reviewed (0 critical findings, 3 warnings all fixed), and tests are green, but that work lives on the current branch (`competition-results`), unmerged to `master`. **Decision (2026-09-10, user)**: rather than merging `competition-results-core` first and denormalizing in a follow-up PR, both changes ship together in one PR/branch — this avoids a prod deploy window where `class_id`/`competition_classes` land and then require a separate live-data backfill migration. `competition-results-core` should **not** be archived on its own; it closes out together with `class-number-denormalization` when the combined PR merges. This also resolves Open Question 1 below.
3. **Open question 1 (backfill safety with deployed prod data) — resolved.** User decision (2026-09-10): ship `competition-results-core` and `class-number-denormalization` together in one PR, so the tables never exist in prod without `class_number` already in place — no live-data backfill scenario.
4. **Open question 2 (`?classId=` → `?classNumber=` breaking change) — still unresolved**, no new evidence changes the "none expected pre-launch" assessment in change.md.
5. **Open question 3 (const module shape/location) — still unresolved**, a planning-time decision as stated.
6. **Missed nuance**: `competition_classes.class_number` **already exists in the schema** (added by a precursor migration merged 2026-09-04, before change.md was written). This doesn't change the plan's direction but means the plan should describe this as "add `class_number` to `exercises`/`competitions`, backfill via the existing `competition_classes.class_number` column, drop `class_id` + `competition_classes`" rather than treating `class_number` as being introduced from scratch anywhere.

## Detailed Findings

### File list accuracy (src/ and tests/)

Re-grepping the full repo for `class_id`, `classId`, `competition_classes` today produces exactly the same 8 `src/` files and 5 `tests/` files change.md lists — no drift since 2026-09-09.

- `src/types.ts:46,57,99` — `Exercise.class_id`, `Competition.class_id`, `NewCompetition` pick
- `src/lib/services/competition.ts:7-8,20,24,39-57` — `getCompetitionClasses`, `getExercisesForClass`, `getExercisesForClassNumber`
- `src/lib/services/competitions.ts:11,14,22,43,46,52,171,186` — `getCompetitionsForDogClass`, `createCompetition`, `exerciseBelongsToClass`
- `src/lib/services/competition-board.ts:15,18,29,30` — `loadCompetitionBoard`
- `src/pages/dogs/[id]/competition-results.astro:37,43-46,62` — `?classId=` param, default-class resolution
- `src/pages/api/dog/[id]/competitions/index.ts:10,33,46` — zod `classId: z.uuid(...)`, POST body
- `src/components/competition-results/CompetitionResultsGrid.tsx:107,109,190` — `handleClassChange`, nav, prop pass-through
- `src/components/competition-results/AddCompetitionDialog.tsx:19,36,55` — `classId` prop, POST body
- `tests/helpers/db.ts:126,129,135` — `seedCompetition` signature
- `tests/unit/cross-account-authorization.test.ts:54,72-80,175-228`
- `tests/unit/data-integrity.test.ts:13,23,30,35,141-180`
- `tests/unit/competition-board.test.ts:9` — only `class_id` field in `makeExercises` test fixture
- `tests/unit/competition-reference-data.test.ts:31,33,49,60,128,130`

None of the seven named functions (`getCompetitionClasses`, `getExercisesForClass`, `getExercisesForClassNumber`, `createCompetition`, `getCompetitionsForDogClass`, `loadCompetitionBoard`, `seedCompetition`) have been renamed or had signatures changed.

### Migrations — not in the original grep, and one precursor already landed

change.md only said "verify still current when planning" about the `src/`/`tests/` grep; it referenced migrations generically. Current migration set touching this area:

- `supabase/migrations/20260903000001_create_competition_reference_data.sql` — creates `competition_classes` (`id uuid PK`, `name`, `sort_position`, unique on both), `exercises.class_id uuid NOT NULL REFERENCES competition_classes(id) ON DELETE CASCADE` (line 19), RLS (`competition_classes_select_authenticated`, `authenticated`-only, no anon), grants, 29-row exercise seed.
- **`supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql`** — adds `class_number smallint NOT NULL UNIQUE` to `competition_classes`, backfilled from `sort_position`. Merged 2026-09-04 (PR #23), i.e. **before** change.md was written on 2026-09-09. `getExercisesForClassNumber` already reads this column today.
- `supabase/migrations/20260906000001_create_competitions.sql` — `competitions.class_id uuid NOT NULL REFERENCES competition_classes(id)` (no `ON DELETE` action, unlike `exercises`'s `CASCADE`), part of `UNIQUE (dog_id, class_id, competed_on)` and a composite index.
- `supabase/migrations/20260906000002_create_competition_scores.sql` — RLS policies cross-check `exercises.class_id = competitions.class_id` (lines 61, 79) — this cross-table FK-consistency check is exactly what needs a `class_number`-based replacement once `class_id` is dropped from both tables.

**Implication for planning**: the plan should not describe introducing `class_number` as new — it already exists on `competition_classes` (added 2026-09-04). The actual remaining work is: add `class_number` directly to `exercises` and `competitions` (backfilling via the existing `competition_classes.class_number` join, same as change.md already says), replace the `competition_scores` RLS cross-check to compare `class_number` instead of `class_id`, then drop `class_id` columns/FKs and the `competition_classes` table itself.

### Dependency status: competition-results-core

`context/changes/competition-results-core/change.md:1-8` frontmatter:

```
status: impl_reviewed
created: 2026-09-06
updated: 2026-09-10
archived_at: null
```

No `context/archive/**/competition-results-core*/` folder exists — contrast with genuinely closed changes in this repo (`context/archive/2026-09-03-competition-reference-data/change.md`, `context/archive/2026-09-04-training-board-refactor/change.md`), which carry `status: archived` and a real `archived_at` timestamp.

Content shows the work is done in substance: all 8 plan phases complete, `reviews/impl-review.md` shows 4 findings (0 critical, 3 warnings, 1 observation) all marked FIXED, verified via `astro check` (0 errors), lint (0 errors), `test` (102/102). `git log` shows 10 `competition-results-core`-tagged commits ending in `0833e72 chore(competition-results-core): close out plan (epilogue)` — but no archive-move commit.

**Reading**: implementation and review are done, but "merged" is not — all commits are on the `competition-results` branch, not `master`. Both halves of change.md's dependency condition ("fully implemented _and merged_... do this change right after that one _closes out_") require: (1) merge `competition-results-core`'s branch to `master`, then (2) archive it (`status: archived`, `archived_at` set, moved to `context/archive/`). Per user instruction, do **not** archive it now — it is not merged. This is a genuine blocker on starting implementation of `class-number-denormalization`, not just a procedural nicety.

### Open question 1 — backfill safety against deployed production data

No evidence found either confirming or ruling out real `competitions`/`competition_scores` rows in a deployed environment:

- `supabase/seed.sql` has only commented-out dev-seed INSERTs for `dogs`/`training_elements`/`training_logs` — nothing for `competitions`/`competition_scores`, and it's explicitly manual/local (requires hand-editing a real `auth.users` UUID).
- `.github/workflows/ci.yml` only runs `supabase start` (ephemeral local instance) for test jobs — no step targets a cloud project or runs `supabase db push`.
- `context/changes/deployment/deployment-plan-v2.md` documents one completed manual production deploy (Phases 0-6 checked) to `https://obitracker.monika-krella.workers.dev`, but its "Out of scope" section explicitly states `- Supabase database migrations (no custom tables exist yet)` — this deploy predates the `competitions`/`competition_classes`/`exercises`/`competition_scores` migrations (dated 2026-09-03/09-06) entirely. Phase 7 (auto-deploy on merge) is still unchecked.

**Status: resolved (2026-09-10).** User decision: `competition-results-core` and `class-number-denormalization` ship together in one PR/branch, so `class_id`/`competition_classes` never exist in prod on their own — there is no live-data backfill scenario to design for. The forward migration for the new tables can be written directly with `class_number` (or with `class_id` immediately superseded in the same migration set, whichever is cleaner), with no separate ALTER+backfill+drop pass needed against real prod rows.

### Open question 2 — `?classId=` → `?classNumber=` breaking URL change

No new evidence changes the assessment already in change.md ("none expected pre-launch, but worth a conscious call"). Confirmed via the deployment-plan-v2 finding above: the production deploy predates these tables, so no real competition-results URLs have been shared/bookmarked from a live environment. Still a planning-time confirmation, not a blocker.

### Open question 3 — const module shape/location

No existing precedent found for a similar "DB-backed enum replaced by app-code const" pattern elsewhere in `src/lib/domain/` or `src/const.ts` (no `src/const.ts` file currently exists). This remains an open design decision for planning, as change.md already states.

## Code References

- `src/types.ts:46,57,99`
- `src/lib/services/competition.ts:7-8,20,24,39-57`
- `src/lib/services/competitions.ts:11,14,22,43,46,52,171,186`
- `src/lib/services/competition-board.ts:15,18,29,30`
- `src/pages/dogs/[id]/competition-results.astro:37,43-46,62`
- `src/pages/api/dog/[id]/competitions/index.ts:10,33,46`
- `src/components/competition-results/CompetitionResultsGrid.tsx:107,109,190`
- `src/components/competition-results/AddCompetitionDialog.tsx:19,36,55`
- `tests/helpers/db.ts:126,129,135`
- `tests/unit/cross-account-authorization.test.ts:54,72-80,175-228`
- `tests/unit/data-integrity.test.ts:13,23,30,35,141-180`
- `tests/unit/competition-board.test.ts:9`
- `tests/unit/competition-reference-data.test.ts:31,33,49,60,128,130`
- `supabase/migrations/20260903000001_create_competition_reference_data.sql:8-15,19,25-26,30,37-38,46,53,55,64-117`
- `supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql:1-18`
- `supabase/migrations/20260906000001_create_competitions.sql:7,10,21,25,64-65`
- `supabase/migrations/20260906000002_create_competition_scores.sql:15,57-62,75-80`
- `context/changes/competition-results-core/change.md:1-19`
- `context/changes/competition-results-core/reviews/impl-review.md`
- `context/changes/deployment/deployment-plan-v2.md:245,293,302`
- `supabase/seed.sql`
- `.github/workflows/ci.yml`

## Architecture Insights

- This repo's change lifecycle convention (from `context/archive/**/change.md` examples) is `status: archived` + a real `archived_at` timestamp + folder moved under `context/archive/`. `impl_reviewed` is a mid-lifecycle state, not terminal — useful to know when judging whether a stated "depends on X closing out" condition is actually met.
- `competition_classes.class_number` was added as precursor work (2026-09-04, PR #23) ahead of this denormalization change and before change.md existed — it's easy to misread the plan as introducing `class_number` net-new; it isn't, on `competition_classes` at least.
- `exercises.class_id` uses `ON DELETE CASCADE`; `competitions.class_id` uses default `NO ACTION`. Both disappear once `class_id` is dropped, but it's worth the plan noting this asymmetry existed (in case CASCADE behavior on `competition_classes` deletion was ever relied on — it shouldn't be, since no role can DELETE from `competition_classes` today).
- `competition_scores` RLS policies (`20260906000002...sql:61,79`) do a live cross-table join comparing `exercises.class_id = competitions.class_id` — this is the one piece of _behavioral_ logic (not just column rename) that must be reimplemented against `class_number` rather than mechanically renamed.

## Historical Context (from prior changes)

- `context/archive/2026-09-03-competition-reference-data/change.md` — original creation of `competition_classes`/`exercises` reference data; establishes the archived-status convention referenced above.
- `context/changes/competition-results-core/change.md` and `reviews/impl-review.md` — the dependency this change is gated on; substance complete, procedural archive step pending.

## Related Research

None found — no prior `research.md` exists for `class-number-denormalization` or for a comparable "denormalize a DB-backed enum into app code" change elsewhere in `context/changes/**/` or `context/archive/**/`.

## Open Questions

Carried forward from change.md:

1. Is `?classId=` → `?classNumber=` an acceptable breaking change to any bookmarked/shared URLs? Still open as a conscious confirmation, though risk is low: no live deploy postdates these tables, and both changes now ship together before any prod exposure.
2. ~~Does the migration backfill approach need to handle real rows in a deployed environment?~~ **Resolved 2026-09-10**: no, both changes ship in one PR — see Dependency Status above.
3. Exact shape/location of the new const module for class display data (name/sort_position by class_number) — still open, no existing precedent in the repo to follow.

Resolved by this research pass / by user decision (2026-09-10):

4. **Sequencing decided**: `competition-results-core` (implemented, impl-reviewed, unmerged) and `class-number-denormalization` ship together as one combined PR/branch, to avoid a prod window where `class_id`/`competition_classes` exist without `class_number`. `competition-results-core` stays unarchived until that combined PR merges — do not archive it separately.
