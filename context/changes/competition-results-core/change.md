---
change_id: competition-results-core
title: Competition results core
status: implementing
created: 2026-09-06
updated: 2026-09-08
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-06: Triaged all 5 findings from `reviews/plan-review.md`. F1 (AddCompetitionDialog 401 redirect) rejected — it's a non-deep-linkable modal, so falls through to generic toast error instead; codified as a new exception on the 401-redirect lesson in `context/foundation/lessons.md`. F2 (competitions DELETE policy) kept as-is per user call, documented as an accepted risk. F3 (leap-year window) resolved: Feb 29 clamps to Feb 28. F4 (dashboard nav path) and F5 (sticky z-index values) accepted as proposed. `plan.md`, `plan-brief.md`, and `reviews/plan-review.md` all updated.
- 2026-09-08: **Open item — resolve before archiving this change.** Phase 8's E2E suite (`tests/e2e/*.spec.ts`, 3 specs total) is reliably green run standalone or with `--workers=1`, but flaked intermittently under Playwright's default 3-worker parallelism against the `astro dev` (Vite dev-mode) server — and the flake hit `seed.spec.ts`/`mobile-grid.spec.ts` too, not just the new `mobile-competition-results.spec.ts`, so it's pre-existing dev-server compile contention under parallel load, not a defect introduced by this phase. User explicitly deferred the call on how to handle it (pin `playwright.config.ts` workers to 1? investigate the Vite contention further? accept as known CI flakiness?) to a future session — do not treat Phase 8 or this change as fully done until that decision is made.
- 2026-09-08: Added a loading overlay to `CompetitionResultsGrid.tsx` (user-reported: the class dropdown looked "broken" rather than loading, both on first page load pre-hydration and during a class switch's full-page navigation). New `isNavigating` state set right before `window.location.href` navigates away (never reset — mirrors the existing "stay loading — navigating away" convention elsewhere in this codebase); combined with the existing `!mounted` flag into `isLoading`, which renders a `bg-black/40` overlay with a spinner (reusing the same visual style as `ServiceUnavailableGrid`/`EmptyCompetitionsGrid`) over the whole card. Not part of the original Phase 7 plan contract — an ad-hoc UX fix requested mid-Phase-8, applied directly since it's small and self-contained.
- 2026-09-09: **Resolved the 2026-09-08 E2E-flakiness open item.** Root cause was not Vite dev-mode compilation as first suspected — `astro dev` and `astro preview` both run through `@cloudflare/vite-plugin`'s local Miniflare/workerd emulation (confirmed: build+preview was tried first and made things worse, failing outright with `miniflare dispatchFetch "fetch failed"` errors under 3-worker load, not just flaking). Fix: pinned `workers: 1` in `playwright.config.ts`, which avoids the concurrency entirely. Verified green across 3 consecutive full-suite runs. One separate, narrower flake surfaced during verification — `mobile-competition-results.spec.ts`'s cleanup block (line ~140) occasionally times out waiting for the average cell to show `—` after clearing a score, independent of worker concurrency (seen once even at `workers: 1`) — user explicitly deferred fixing this; left as-is, worth revisiting if it recurs.
