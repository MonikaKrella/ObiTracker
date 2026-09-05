# Training Board Refactor — Plan Brief

> Full plan: `context/changes/training-board-refactor/plan.md`
> Design source: `context/domain/02-invariant-aggregate-refactor.md` (built on `context/domain/01-domain-distillation.md`)

## What & Why

ObiTracker's Primary Success Criterion — "handler identifies what to train next in under 10 seconds" (`prd.md:38`) — is decided entirely by the green/red highlight classification. Today that classification is computed in exactly one place in the whole codebase: a `useMemo` inside the `TrainingGrid.tsx` React component. No service, API route, or repository can ever produce it independently, and its own documented precondition ("every element must be present in the tick-count map") is never actually checked — a domain audit flagged this as the single most core, least-enforced invariant in the product.

## Starting Point

The training grid (`src/components/training-grid/`, `src/lib/highlight.ts`, `src/lib/training-grid-helpers.ts`) is a fully-built, working feature with existing Vitest coverage on the algorithm (17 trace-table cases). This refactor doesn't touch the algorithm's business logic — it moves the same verbatim rules into a proper aggregate class that every consumer (SSR page, API, client) goes through.

## Desired End State

A `TrainingBoard` aggregate is the only legal way to produce a highlight. `grid.astro` validates its data through it before rendering (degrading to the existing "service unavailable" overlay on any failure); a new `GET /api/dog/[id]/grid` endpoint gives a future non-React consumer a real integration point; the client's tap-to-recompute path uses the same class. The handler sees **zero visible change** — same grid, same ticks, same highlights, same window behavior.

## Key Decisions Made

| Decision                              | Choice                                                                                                                        | Why (1 sentence)                                                                                                                                                                    | Source |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Refactor target                       | The highlight classification invariant only                                                                                   | It's the one thing the PRD's Vision and Primary Success Criterion are both about — nothing else is close                                                                            | Frame  |
| Behavior change allowed?              | None — pure refactor                                                                                                          | User explicit instruction; algorithm moves verbatim                                                                                                                                 | User   |
| New `GET /api/dog/[id]/grid` endpoint | Build it now                                                                                                                  | Closes the doc's core finding at low cost since the domain/service layer is being built anyway                                                                                      | User   |
| Fail-fast error handling at runtime   | Degrade to the existing "service unavailable" overlay, not a hard 500                                                         | Matches the codebase's existing convention; the failure case is unreachable today (FK cascade prevents it)                                                                          | User   |
| `loadTrainingBoard()` fetch window    | Fixed 30 days, matching `grid.astro`'s current fetch exactly                                                                  | The design doc's "full history" phrasing was imprecise; the real behavior is window-agnostic _within_ a fixed 30-day fetch, not truly unbounded                                     | Plan   |
| `grid.astro` vs `loadTrainingBoard()` | `grid.astro` builds its own `TrainingBoard` from data it already has; `loadTrainingBoard()` is used only by the new API route | `TrainingBoard` discards per-day tick data (keeps only counts) so it can never supply `grid.astro`'s `initialTicks`; routing `grid.astro` through the repository would double-fetch | Plan   |
| `training-grid.test.ts:59-65`         | Left unchanged                                                                                                                | It tests `buildTicksByElement`, a different function with a different, still-valid contract — the source doc's instruction to "update" it was a conflation                          | Plan   |
| New domain file location              | `src/lib/domain/training-board.ts`                                                                                            | Establishes a distinct layer for invariant-guarding aggregates, separate from the existing thin `src/lib/services/*.ts` wrappers                                                    | Frame  |

## Scope

**In scope:** `TrainingBoard` aggregate + tests, `loadTrainingBoard()` service, `GET /api/dog/[id]/grid` route, rewiring `grid.astro` and `TrainingGrid.tsx`, deleting `highlight.ts`/`highlight.test.ts`, one-line `CLAUDE.md` convention note.

**Out of scope:** the algorithm's business rules (unchanged), the window-agnostic ranking semantics (unchanged), `context/domain/03-anti-corruption-layer.md` (Supabase `User` leak), domain invariants #2-4 from `01-domain-distillation.md` (dog-name uniqueness, future-date DB constraint, soft-delete docs), any PRD reconciliation.

## Architecture / Approach

`TrainingBoard.create(elements, ticks)` is a private-constructor aggregate whose factory fails fast (`UnknownElementTickError`) instead of silently trusting the "all elements present" precondition `computeHighlights` never checked. Three call sites converge on it: `loadTrainingBoard()` (new repository, used only by the new API route), `grid.astro` (builds one directly from data it already fetched, for validation), and `TrainingGrid.tsx` (client-side recompute-on-tap). The algorithm body inside `.highlights()` is moved character-for-character from `highlight.ts`.

## Phases at a Glance

| Phase                        | What it delivers                                             | Key risk                                                           |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1. Test-first                | `training-board.test.ts` against the not-yet-existing class  | None — additive, fails to compile until Phase 2                    |
| 2. Implement `TrainingBoard` | The aggregate itself, Phase 1 goes green                     | Transcription error moving the algorithm verbatim                  |
| 3. `loadTrainingBoard()`     | Repository function for the API route                        | Wrong fetch bounds (must match `grid.astro`'s fixed 30-day window) |
| 4. `GET /api/dog/[id]/grid`  | New, purely additive endpoint                                | None — nothing existing depends on it yet                          |
| 5. Wire `grid.astro`         | SSR page validates via the aggregate, degrades gracefully    | Double-fetching data, or crashing instead of degrading             |
| 6. Wire `TrainingGrid.tsx`   | Client recompute-on-tap uses the same class                  | Regression in the optimistic-tick/debounce interaction             |
| 7. Cleanup                   | Delete `highlight.ts`/`highlight.test.ts`, doc the new layer | Leaving a stray reference that breaks the build                    |

**Prerequisites:** None — training grid feature is already fully built and merged.
**Estimated effort:** ~7 phases, each a small focused change; roughly 2-3 sessions.

## Open Risks & Assumptions

- Assumes `ON DELETE CASCADE` on `training_logs.element_id` genuinely prevents orphaned ticks today, so `UnknownElementTickError` should never fire in practice — if it ever does, the degrade-to-overlay behavior means it fails quietly rather than loudly (a deliberate tradeoff, see Key Decisions).
- The 17-case count in `highlight.test.ts` (vs. the source doc's stated "9") was verified by direct read; all 17 must be ported in Phase 1.

## Success Criteria (Summary)

- The handler-visible training board is byte-for-byte identical in behavior before and after this refactor, with one deliberate exception: a pre-existing Supabase fetch failure in `grid.astro` now degrades to the "service unavailable" overlay instead of an unhandled SSR crash (see plan.md Desired End State).
- `computeHighlights`/`highlight.ts` have zero remaining references and are deleted.
- A non-UI consumer (verified via `curl`/devtools against the new endpoint) can independently obtain the same highlight classification the grid displays.
