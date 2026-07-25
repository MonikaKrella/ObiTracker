# Training Grid — Plan Brief

> Full plan: `context/changes/training-grid/plan.md`
> Research: `context/changes/training-grid/research.md`

## What & Why

Build the training grid — ObiTracker's north star (S-04). One glance at `/dogs/[id]/grid` must tell the handler what to train next: a sticky-header/sticky-column table of training elements × days, with the 3 most- and 3 least-trained rows highlighted green/red within a configurable 7/14/30-day window, and single-tap ticking with no confirmation dialog.

## Starting Point

The `training_logs` table, its indexes, and RLS already exist (S-03, merged) — no migration needed. The `training-elements` feature established every convention this plan reuses: service-layer functions, zod-validated API routes with a uniform error shape, and the `useMounted()` SSR-hydration-guard pattern for React islands. There's no test runner in the project today.

## Desired End State

The handler opens the grid, sees correct green/red highlights immediately, taps cells to tick/untick with instant visual feedback that persists, and switches between 7/14/30-day windows instantly (no network call) with the selection surviving a page reload via the URL.

## Key Decisions Made

| Decision               | Choice                                                                              | Why (1 sentence)                                                                                                 | Source   |
| ---------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Grid markup            | `<table>` with `position: sticky` + `overflow-y: clip`                              | Native sticky-column support, free ARIA grid semantics, zero-JS two-axis sticky                                  | Research |
| Tick interaction       | `useOptimistic` + debounced/aborted fetch                                           | Field-use latency can't block the UI; React 19's auto-revert removes manual rollback complexity                  | Research |
| Highlight algorithm    | 3-tier `computeHighlights` (n≤3 none / 4-6 single-winner / n≥7 full top-3/bottom-3) | Fully traced against 9 edge cases already in research; copied verbatim                                           | Research |
| Toggle API             | Single `POST .../logs` endpoint, INSERT-then-DELETE-on-conflict                     | UNIQUE constraint serializes concurrent toggles; idempotent under rapid taps                                     | Research |
| Window selector UI     | Segmented button group (not dropdown/native select)                                 | Single tap, fastest for field use, no new dependency                                                             | Plan     |
| Window persistence     | URL query param (`?window=`), default 30                                            | Shareable/bookmarkable, survives reload, no client storage                                                       | Plan     |
| Testing                | Minimal Vitest suite, scoped to `computeHighlights` only                            | This algorithm is the entire product's value prop; an exception to "no test suite" is worth it here specifically | Plan     |
| Supabase misconfigured | Skeleton + "Something went wrong, please try later" overlay                         | Distinct from the empty-elements state, unlike the silent-empty-array precedent elsewhere                        | Plan     |
| Toggle date guard      | Reject `trainedOn` > server's UTC "today" (400)                                     | Timezone-neutral by construction — blocks only dates the rendered grid could never produce                       | Plan     |
| Insert-error handling  | Check Postgres code `23505` before falling to DELETE                                | Fixes a bug in the research draft: any other insert error would silently become a no-op "untick"                 | Plan     |

## Scope

**In scope:** grid page + island, optimistic tick toggle, 3-tier highlight algorithm + its unit tests, window selector with URL persistence, scroll-to-today, dashboard tile, accessibility pass.

**Out of scope:** new migrations, per-user timezone handling, no-JS-functional window switching, competition results, session notes/sharing, general test infrastructure beyond the one scoped suite.

## Architecture / Approach

SSR fetches all 30 days of tick history once (`Promise.all` of elements + logs); the React island filters client-side per selected window through a memoized chain (`allTicks → windowTicks → tickCounts → highlights`), so window switching is instant with zero extra network calls. The toggle API is a single idempotent endpoint backed by the table's UNIQUE constraint, with optimistic UI on the client and an explicit Postgres-error-code check server-side.

## Phases at a Glance

| Phase                                      | What it delivers                                              | Key risk                                                                                |
| ------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Pure Functions & Test Infrastructure    | `computeHighlights`, date helpers, scoped Vitest suite        | Vitest/Astro alias misconfiguration (mitigated — no alias needed, see plan)             |
| 2. Service Layer & Toggle API              | `getTrainingLogs`, `toggleTrainingLog`, `POST .../logs` route | Insert-error mishandling silently corrupting tick state if the `23505` check is skipped |
| 3. Astro Page Shell & Static Grid          | Working read-only `/dogs/[id]/grid` page                      | Sticky CSS (`overflow-y: clip`) browser quirks, especially iOS Safari                   |
| 4. Interactive React Island                | Optimistic ticking, window selector, scroll-to-today          | Stale scroll position or URL/state desync on window switch                              |
| 5. Dashboard Wiring & Accessibility Polish | Dashboard tile, ARIA/keyboard/touch-target verification       | Touch target regressions only visible on a real device, not DevTools                    |

**Prerequisites:** S-03 (training-elements) is `impl_reviewed` and merged — confirmed in `change.md`.
**Estimated effort:** ~5 phases, roughly one focused after-hours session each.

## Open Risks & Assumptions

- iOS Safari's two-axis sticky behavior (`overflow-y: clip`) is assumed broadly supported per research but should be device-tested in Phase 3/4, not just emulated.
- UTC-only date handling (no per-user timezone) is an accepted MVP simplification per research.md Q4 — revisit post-launch if handlers report date-mismatch confusion.

## Success Criteria (Summary)

- Handler can identify what to train next within 10 seconds of opening the grid, with correct green/red highlights.
- A tick entered persists reliably (survives reload) and is never silently lost.
- The grid and tick interactions are fully usable on both phone (field, touch) and laptop (review, pointer).
