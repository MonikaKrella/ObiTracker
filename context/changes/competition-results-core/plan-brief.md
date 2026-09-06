# Competition Results Core — Plan Brief

> Full plan: `context/changes/competition-results-core/plan.md`
> Research: `context/changes/competition-results-core/research.md`

## What & Why

Builds S-01, V2's north star: per dog, a handler selects a competition class, enters raw per-exercise scores across dated competitions, sees each exercise's average recalculate live, and sees the top-2/bottom-2 exercises highlighted — a second, score-based signal alongside the existing frequency-based training grid. Success here proves the core V2 hypothesis: that a handler adopts this page as their scorebook, replacing a spreadsheet or paper record.

## Starting Point

F-01 (competition classes/exercises reference data) and F-02 (`TrainingBoard` domain-aggregate refactor) are both shipped. No schema, domain logic, or UI exists yet for competition results — no `competitions`/`competition_scores` tables, no `Select` component, no decimal input, no right-edge sticky grid column.

## Desired End State

A handler on `/dogs/[id]/competition-results` can pick a class, add a competition by date, type scores into a grid (quarter-point precision), and immediately see per-exercise averages and green/red top-2/bottom-2 highlights, all scoped to a chosen time window (all-time / last year / last 6 months) that also controls which competition columns are visible. Works fully on mobile and desktop.

## Key Decisions Made

| Decision                     | Choice                                          | Why (1 sentence)                                                                              | Source      |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| Tags in this slice?          | Excluded                                        | Roadmap assigns FR-011 to S-04, prerequisite S-01 — not part of this slice                    | Research    |
| Partial scores               | Allowed (row absence = unscored)                | Matches real handler behavior; forcing placeholders would corrupt averages                    | Plan        |
| Same-date competitions       | One per (dog, class, date) — UNIQUE constraint  | Simpler column headers; no disambiguation UI needed                                           | Plan        |
| Score save behavior          | Save on blur                                    | One write per completed entry, matches spreadsheet-replacement feel                           | Plan        |
| Add-competition UX           | Small dialog (mirrors AddElementDialog)         | Reuses existing dialog/form/toast pattern exactly                                             | Plan        |
| Edit/delete a competition    | Out of scope this slice                         | Not in S-01's FR list; tracked as new roadmap slice S-07                                      | Plan        |
| Tie-expansion architecture   | New independent `CompetitionBoard` aggregate    | Matches established per-aggregate precedent; avoids touching FR-018-protected `TrainingBoard` | Plan        |
| Time-window persistence      | Cookie (like the existing 7/14/30 selector)     | No new state-persistence pattern introduced                                                   | Plan        |
| Future-dated competitions    | Allowed                                         | User-confirmed — no rulebook reason to block them                                             | Plan        |
| Mobile E2E timing            | Ship within this slice                          | PRD guardrail treats phone parity as a hard must-have                                         | Plan        |
| Ownership-proof pattern      | Denormalized `account_id` (training_logs-style) | Averaging read path matches the training grid's query shape                                   | Plan        |
| `competitions` DELETE policy | Ship now, undocumented UI                       | CLAUDE.md's one-policy-per-operation convention; avoids a second S-07 migration               | Plan review |
| Leap-year "last year" bound  | Feb 29 clamps to Feb 28 of target year          | Matches the calendar-subtraction behavior users expect from a "1 year ago" cutoff             | Plan review |

## Scope

**In scope:** class selection (default Class 1), add a competition by date, per-cell score entry/edit/clear, live averages over raw points, top-2/bottom-2 highlighting with tie-expansion, time-window selector governing columns+averages+highlights together, mobile parity.

**Out of scope:** tags (S-04), default-class marking (S-03), editing/deleting a competition (new S-07), element-exercise linking (S-02), any shared ranking utility with `TrainingBoard`.

## Architecture / Approach

Two new tables (`competitions`, `competition_scores`), denormalized-`account_id` RLS matching `training_logs`. A new `CompetitionBoard` domain aggregate (private constructor + `create()` factory, same shape as `TrainingBoard` but independent) computes averages and highlights. SSR page fetches everything server-side (mirroring `grid.astro`); mutations go through two small API routes; highlights recompute client-side from the fetched data, no highlights API call.

## Phases at a Glance

| Phase                                | What it delivers                              | Key risk                                                                          |
| ------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Schema & Types                    | Both tables, RLS, grants, constraints         | Cross-FK RLS check (exercise must match competition's class) is easy to get wrong |
| 2. Time-window helper                | Calendar-period date math                     | Leap-year / month-boundary edge cases                                             |
| 3. CompetitionBoard — averages       | `create()` + averages, fail-fast              | Partial-scores-as-absence must not be conflated with zero                         |
| 4. CompetitionBoard — highlights     | Top-2/bottom-2 tie-expansion                  | Non-obvious greedy-group algorithm; green/red overlap resolution                  |
| 5. Service layer & integration tests | Repository, seeding, RLS/data-integrity tests | Concurrency test for the score upsert                                             |
| 6. API routes                        | Create competition, upsert/clear score        | 409-on-duplicate-date UX; cross-FK 404 handling                                   |
| 7. UI                                | Page, grid, Select, score cells, add dialog   | First-ever right-sticky column + top+right sticky corner combo                    |
| 8. Mobile E2E                        | New Playwright spec                           | Zoom-on-focus regression on a text/number input, not just a checkbox              |

**Prerequisites:** F-01 (done), F-02 (done) — both already shipped.
**Estimated effort:** ~4-6 sessions across 8 phases — this is the largest slice in the roadmap by FR count.

## Open Risks & Assumptions

- The greedy-group tie-expansion algorithm (Phase 4) is a plan-time design, not lifted from an existing implementation — verify it against FR-014's wording carefully during oracle-discipline test-writing.
- The top+right sticky header corner (Phase 7) is a genuine first for this codebase; budget extra manual-verification time for z-index layering on real mobile browsers.
- S-07 (delete competition) has been added to the roadmap as a new, not-yet-planned slice with no PRD FR backing it yet — flag this to the user if PRD v2 should be amended to reflect it.
- `competitions` ships with a live DELETE RLS policy this slice despite no delete UI/API route — a direct Supabase client call could delete a competition before S-07's confirmation UX exists. Accepted risk (plan review F2), documented in Phase 1's migration and in "What We're NOT Doing."

## Success Criteria (Summary)

- A handler can complete the full US-01 loop (select class → add competition → enter scores → see average → see highlight → switch window) on both desktop and mobile with no data loss and no visible regression to the existing training grid.
