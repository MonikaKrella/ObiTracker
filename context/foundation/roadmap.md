---
project: ObiTracker
version: 1
status: draft
created: 2026-09-02
updated: 2026-09-06
prd_version: 2
main_goal: quality
top_blocker: capacity
---

# Roadmap: ObiTracker

> Derived from `context/foundation/prd-v2.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

The MVP proved the core training-grid loop; V2 closes five gaps surfaced by real usage: no account recovery, no competition-results signal, no dog rename, an unowned highlight algorithm, and no link between a handler's custom training elements and the standard rulebook exercises they support. The biggest of these — competition results — adds a second, independent signal (score-based, not frequency-based) alongside the existing training grid, without changing that grid's preserved behavior.

## North star

**S-01: Handler enters competition scores for a class and sees live averages with top-2/bottom-2 highlighting** — the smallest end-to-end slice whose successful delivery would prove V2's core hypothesis: that a handler adopts the competition-results page as their scorebook, replacing whatever spreadsheet or paper record they used before.

> The north star is the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works. Here the hypothesis is that a handler will actually replace their spreadsheet with this grid, which requires the full score-entry → average → highlight loop working together, not any one piece alone.

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                                                                                                | Prerequisites | PRD refs                                              | Status   |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- | -------- |
| F-01 | competition-reference-data | (foundation) three competition classes and their exercises/multipliers/shortcut names are seeded as fixed, queryable reference data | —             | FR-005, FR-006                                        | done     |
| F-02 | training-board-refactor    | (foundation) highlight classification is computed by a dedicated, fail-fast domain service, byte-identical to today's output        | —             | FR-017, FR-018, FR-019                                | done     |
| S-01 | competition-results-core   | select a class, enter raw per-exercise scores, see live averages and top-2/bottom-2 highlighting, filtered by time window           | F-01          | FR-007, FR-009, FR-010, FR-012, FR-013, FR-014, US-01 | proposed |
| S-02 | element-exercise-linking   | link a training element to one competition exercise and see a color-coded indicator column on the training grid                     | F-01          | FR-015, FR-016                                        | proposed |
| S-03 | default-competition-class  | mark one class as their default per dog, so it displays automatically on page load                                                  | S-01          | FR-008                                                | proposed |
| S-04 | competition-tags           | add up to 3 short tags per competition, truncated with a hover tooltip                                                              | S-01          | FR-011                                                | proposed |
| S-05 | password-reset             | request a password-reset link by email and set a new password twice to regain account access                                        | —             | FR-001, FR-002                                        | ready    |
| S-06 | dog-rename                 | rename an existing dog                                                                                                              | —             | FR-003, FR-004                                        | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                                              | Note                                                                                                          |
| ------ | ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A      | Competition scoring loop | `F-01` → `S-01` → `S-03` / `S-04`, `F-01` → `S-02` | Critical path to the north star; invest deeply here per the `quality` goal — data + domain layer.             |
| B      | Domain hygiene           | `F-02`                                             | Isolated refactor, no in-round consumer; sequenced eagerly anyway because `quality` biases foundations early. |
| C      | Account recovery         | `S-05`                                             | Standalone auth completeness item — no dependency on Stream A or B.                                           |
| D      | Dog identity fix         | `S-06`                                             | Standalone CRUD completeness item — no dependency on any other stream.                                        |

## Baseline

What's already in place in the codebase as of 2026-09-02 (auto-researched + verified against the live repo).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, shadcn/ui; training grid at `src/pages/dogs/[id]/grid.astro`, dashboard at `src/pages/dashboard.astro`.
- **Backend / API:** present — Astro SSR API routes at `src/pages/api/dog/**` and `src/pages/api/auth/**`; middleware at `src/middleware.ts`.
- **Data:** present for MVP entities — `dogs`, `training_elements`, `training_logs` live in Supabase with RLS (`supabase/migrations/20260530*`–`20260719*`); present for F-01's competition classes/exercises/multipliers (`competition-reference-data`, archived); **absent** for the rest of V2 — no element-exercise-link table exists yet (needs S-02).
- **Auth:** present for signup/signin/signout/password-reset (`src/pages/auth/`, `src/pages/api/auth/{signin,signup,signout,forgot-password,reset-password,confirm}.ts`, cookie-based sessions via `src/lib/supabase.ts`) — password-reset (S-05, `password-reset` change) shipped 2026-09-06; two production Supabase dashboard steps (reset-link expiry window, custom SMTP) are still tracked as open in that change's notes before it's archived.
- **Deploy / infra:** present — `wrangler.jsonc` (Cloudflare Workers), GitHub Actions CI (`.github/workflows/ci.yml`).
- **Observability:** absent — unchanged from V1; no V2 NFR requires it either.
- **Domain layer (highlight classification):** present — `TrainingBoard` aggregate (`src/lib/domain/training-board.ts`) with a fail-fast `create()` factory, a `loadTrainingBoard()` repository, and `GET /api/dog/[id]/grid` now own highlight classification independently of `TrainingGrid.tsx` (F-02, `training-board-refactor`, archived); byte-identical output to the prior `useMemo`-only implementation.

## Foundations

### F-01: Competition reference data

- **Outcome:** (foundation) the three fixed competition classes (Class 1, Class 2, Class 3), each with its own exercise list, per-exercise point multiplier, and short "Shortcut" display name, are seeded as non-user-editable reference data in Postgres — queryable by class, ready for the results grid and the element-exercise link to consume.
- **Change ID:** competition-reference-data
- **PRD refs:** FR-005, FR-006
- **Unlocks:** S-01 (needs classes/exercises to select and score against), S-02 (needs exercises to link training elements to)
- **Prerequisites:** —
- **Parallel with:** F-02, S-05, S-06
- **Blockers:** —
- **Unknowns:** — (the exact exercise/multiplier tables for all three classes are already specified in `context/foundation/post-mvp-notes.md`, sourced from the rulebook)
- **Risk:** this data is not user-editable for this change (FR-005's Socrates round explicitly rejected in-app admin editing) — a seeding error in a multiplier or exercise name is not self-correcting through the UI and would silently skew every downstream average; get it right once at migration time.
- **Status:** done

### F-02: TrainingBoard domain refactor

- **Outcome:** (foundation) the training grid's highlight classification moves from a React component's `useMemo` into a dedicated domain service with a fail-fast creation path (rejects an unknown-element tick instead of silently dropping it), producing byte-identical results to today's shipped 3-tier/suppression algorithm before and after the move.
- **Change ID:** training-board-refactor
- **PRD refs:** FR-017, FR-018, FR-019
- **Unlocks:** directly resolves the PRD's own named gap ("Highlight logic has no owner... any future consumer has nothing to call" — Problem Statement item 4) and establishes the verification path FR-018's byte-identical guarantee requires (a dedicated before/after regression suite plus a new `GET /api/dog/[id]/grid` endpoint). This is not infrastructure built ahead of any user-facing integration — the already-shipped training grid (V1's `training-grid` slice, `grid.astro` + `TrainingGrid.tsx`) is the existing vertical slice that keeps surfacing this computation to users throughout, now backed by a guarded service instead of inline UI logic. No _new_ V2 slice consumes it directly — the PRD frames further consumers (competition-readiness signals, exports) as explicitly post-V2.
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02, S-03, S-04, S-05, S-06 (touches only the existing training-grid code path, isolated from every new V2 schema and screen)
- **Blockers:** —
- **Unknowns:** — (a full phased design already exists in `context/domain/02-invariant-aggregate-refactor.md`, including the exact test-first port of all 9 existing trace-table cases)
- **Risk:** the guardrail demands byte-identical output before and after — the risk isn't building the service, it's silent behavioral drift during the move; the existing phased plan's test-first port is the mitigation, and Phase 5 of that plan explicitly calls out the one existing test whose meaning must flip (from "asserts a swallow" to "asserts a throw").
- **Status:** done

## Slices

### S-01: Competition results core ← North star

- **Outcome:** user can, per dog, select a competition class (defaulting to Class 1 or the handler's marked default), enter raw per-exercise scores (0–10, quarter-point increments) for a competition, see each exercise's average recalculate immediately from raw points, and see the top-2 strongest and bottom-2 weakest exercise averages highlighted — all filtered to the handler's selected time window (all-time / last year / last 6 months), which also governs which competition columns are visible.
- **Change ID:** competition-results-core
- **PRD refs:** FR-007, FR-009, FR-010, FR-012, FR-013, FR-014, US-01
- **Prerequisites:** F-01
- **Parallel with:** F-02, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Interaction between the grid's horizontal+vertical scroll (once competition columns exceed screen width, per FR-009) and the existing loading-indicator NFR — the training grid already has a proven pattern for this, but it should be confirmed rather than assumed identical. Owner: team. Block: no.
- **Risk:** this is the largest slice in the roadmap by FR count, but FR-013's own Socrates resolution explicitly requires the time-window selector, the average column, and the highlight computation to move together atomically (splitting them risks reproducing the exact "average disagrees with what's highlighted" confusion the PRD rejected). The risk is under-scoping any one of the three, not the slice being oversized for its own sake.
- **Status:** proposed

### S-02: Element-exercise linking

- **Outcome:** user can attach a training element to one exercise from any class (many elements may attach to the same exercise, never one element to many exercises), and can show or hide a collapsible linked-exercise indicator column on the training grid, where each exercise renders as a distinct, consistent color so elements linked to the same exercise are visually grouped.
- **Change ID:** element-exercise-linking
- **PRD refs:** FR-015, FR-016
- **Prerequisites:** F-01
- **Parallel with:** F-02, S-01, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - The exact color-assignment scheme (fixed palette keyed deterministically by exercise ID vs. a handler-chosen color) isn't specified beyond "distinct, consistent color." Owner: user. Block: no — a deterministic hash-to-palette default is a reasonable starting point for `/10x-plan`; escalate only if the handler wants manual control.
- **Risk:** this is the only slice touching two aggregates at once (`TrainingElement` and the new `Exercise` reference data) with a genuinely new foreign key; the "many elements to one exercise, never many-to-many" cardinality (Non-Goals) is easy to accidentally implement backwards if the join table's uniqueness constraint is on the wrong column.
- **Status:** proposed

### S-03: Default competition class

- **Outcome:** user can mark one class as their default per dog; that class's results display automatically the next time the competition-results page loads for that dog, instead of always falling back to Class 1.
- **Change ID:** default-competition-class
- **PRD refs:** FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** low — a preference flag layered on S-01's existing class dropdown; the main risk is forgetting the "Class 1 if none marked" fallback on a handler's very first visit.
- **Status:** proposed

### S-04: Competition tags

- **Outcome:** user can add up to 3 short tags per competition (e.g. "qualifications", "championships") via a dedicated Tags row at the bottom of the results grid; long tags truncate in the cell and show full text on hover.
- **Change ID:** competition-tags
- **PRD refs:** FR-011
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** low — additive UI on a grid that already exists after S-01; truncate-plus-tooltip is a well-understood pattern.
- **Status:** proposed

### S-05: Password reset

- **Outcome:** user can request a password-reset link sent to their email (expiring after a short, fixed window), follow it to a reset page, and set a new password by entering it twice with a show/hide toggle (hidden by default) — regaining access to their account and their dogs' training history.
- **Change ID:** password-reset
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01, S-02, S-03, S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** low — matches the existing signup password field's pattern (double-entry, hidden-by-default toggle); the main risk is under-specifying the "surface any write failure before the handler navigates away" NFR on the set-new-password step.
- **Status:** ready

### S-06: Dog rename

- **Outcome:** user can rename an existing dog; the new name displays everywhere the dog is referenced across the app.
- **Change ID:** dog-rename
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01, S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** low — closes a known asymmetry with training elements (which already support rename); no uniqueness constraint is required (the PRD's Socrates round explicitly ruled this out — dogs are keyed by ID everywhere).
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                                          | Ready for `/10x-plan` | Notes                                                                                                                  |
| ---------- | -------------------------- | ------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F-01       | competition-reference-data | Seed competition classes, exercises, multipliers, shortcuts                    | yes                   | Run `/10x-plan competition-reference-data`                                                                             |
| F-02       | training-board-refactor    | Extract highlight classification into a TrainingBoard domain service           | yes                   | Run `/10x-plan training-board-refactor`; design already drafted in `context/domain/02-invariant-aggregate-refactor.md` |
| S-01       | competition-results-core   | Competition results grid: score entry, live averages, top-2/bottom-2 highlight | no                    | Needs F-01 done first; this is the north star                                                                          |
| S-02       | element-exercise-linking   | Link training elements to competition exercises + indicator column             | no                    | Needs F-01 done first                                                                                                  |
| S-03       | default-competition-class  | Mark a default competition class per dog                                       | no                    | Needs S-01 done first                                                                                                  |
| S-04       | competition-tags           | Add tags to a competition                                                      | no                    | Needs S-01 done first                                                                                                  |
| S-05       | password-reset             | Password-reset flow (request link, set new password)                           | yes                   | Run `/10x-plan password-reset`                                                                                         |
| S-06       | dog-rename                 | Rename a dog                                                                   | yes                   | Run `/10x-plan dog-rename`                                                                                             |

## Open Roadmap Questions

1. **Is admin-editable competition class/exercise reference data (classes, exercises, multipliers) worth building later?** — Flagged during the FR-005 Socrates round; not blocking delivery of this roadmap. Owner: user. Block: no slices — F-01 ships with fixed, migration-seeded data regardless of the answer.

## Parked

- **No admin-editable competition classes/exercises** — Why parked: rulebook classes, exercises, and multipliers stay fixed reference data (FR-005); a rulebook revision is a manual, out-of-band update for this change.
- **No search or filter UI for competition tags** — Why parked: PRD Non-Goals; tags (FR-011) are free-text labels with truncate + hover tooltip only.
- **No coach/club sharing of competition results** — Why parked: PRD Non-Goals; extends the existing no-sharing, single-user model to competition results.
- **No many-to-many element-to-exercise linking** — Why parked: PRD Non-Goals; a training element links to exactly one exercise (FR-015).
- **No product-type or user-base expansion** — Why parked: PRD Non-Goals; this change stays within the existing web app, same solo-handler persona, same small scale.
- **Hard delete / cascade cleanup for soft-deleted dogs** — Why parked: FR-004's own Socrates round considered and rejected this for the current change ("permanent erasure is a separate concern from rename, and the current removal model isn't causing real problems yet").

## Done

- **F-01: (foundation) three competition classes and their exercises/multipliers/shortcut names are seeded as fixed, queryable reference data** — Archived 2026-09-06 → `context/archive/2026-09-03-competition-reference-data/`. Lesson: —.
- **F-02: (foundation) highlight classification is computed by a dedicated, fail-fast domain service, byte-identical to today's output** — Archived 2026-09-06 → `context/archive/2026-09-04-training-board-refactor/`. Lesson: —.
