# Testing Mobile Field-Use Regression Guard — Plan Brief

> Full plan: `context/changes/testing-mobile-field-use-regression-guard/plan.md`
> Research: `context/changes/testing-mobile-field-use-regression-guard/research.md`

## What & Why

Bootstrap Playwright from scratch and add one deterministic mobile-viewport test protecting the training grid against test-plan.md Risk #1: a desktop-targeted CSS/layout change silently collapsing the mobile grid to a fraction of the viewport width, making field use impossible. This already happened once — the fix is in code, but lives in shared files a future edit could silently re-break, with no automated guard today.

## Starting Point

No Playwright infrastructure exists anywhere in the repo — no dependency, config, `tests/e2e/` directory, or CI e2e step. Both historical mobile bugs (viewport shrink-to-fit collapse, tap-triggered zoom on tick cells) are already fixed (`src/layouts/Layout.astro:17`, `src/components/training-grid/TickCell.tsx:74-88`), but only documented in a prior plan's "Deviations" section — not protected by any test. Existing Vitest integration tests already established a reusable seed/auth/cleanup pattern (`src/lib/tests/helpers/db.ts`) this phase adapts to Playwright.

## Desired End State

`npx playwright test` runs one seed test plus one risk-tied spec against a Chromium mobile emulation profile, both green, locally and in a new CI job on every PR. The spec would fail if either historical fix were ever reverted — verified once via a deliberate-break check during implementation.

## Key Decisions Made

| Decision                   | Choice                                                                                                                    | Why (1 sentence)                                                                                      | Source   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Device/browser profile     | Chromium only (Playwright `devices['Pixel 5']`)                                                                           | Lowest flake risk for a first e2e test in this repo; accepted tradeoff of not exercising WebKit.      | Plan     |
| Test structure             | One combined test (load + tap, in a single spec)                                                                          | Matches the seed-test-pattern's "full cycle in one test" rule; only one risk-tied spec this phase.    | Plan     |
| Regression-proof mechanism | Deterministic `visualViewport.scale` ≈ 1 assertion                                                                        | Agnostic to _how_ a future change breaks it — no coupling to the specific historical fix.             | Plan     |
| Tap-zoom verification      | Assert `visualViewport.scale` again post-tap                                                                              | Directly re-creates the historical bug's exact measured signature (`scale ≈ 0.25`).                   | Plan     |
| CI gating                  | Advisory (non-blocking) job, not a required check                                                                         | De-risks a brand-new, heavier CI job (Supabase + dev server + browser) before promoting it.           | Plan     |
| `.playwright-cli/` cleanup | Unstage + gitignore as part of this change                                                                                | This change is exactly what introduces real Playwright infra — the natural place to stop tracking it. | Plan     |
| Priority if squeezed       | Infra + the test are must-have; CI wiring can fast-follow                                                                 | The test itself is the actual guard — it delivers value locally even before CI enforces it.           | Plan     |
| Seed/auth/cleanup pattern  | Reuse `db.ts` helpers via Playwright `globalSetup`/`globalTeardown`, `storageState` via the real `/api/auth/signin` route | No new pattern to invent; matches research's grounded recommendation and existing Vitest precedent.   | Research |

## Scope

**In scope:**

- Playwright dependency, config, `tests/e2e/` global setup/teardown, `.gitignore` entries
- One CI job (advisory) running the suite on every PR
- One risk-tied spec covering both historical mobile bugs (page-load collapse + tap-triggered zoom)
- Cleanup of currently-staged `.playwright-cli/` debug artifacts

**Out of scope:**

- A general-purpose or page-wide e2e suite (test-plan.md §7 explicitly excludes blanket visual-snapshot tests)
- WebKit/Firefox coverage
- Literally simulating a future CSS regression as permanent test code
- Promoting the CI job to a required/blocking check (a manual GitHub-settings follow-up)

## Architecture / Approach

Two phases mirroring the project's plan/implement/e2e split. **Phase 1** (infra: dependency, config, `globalSetup`/`globalTeardown` seeding+auth, CI job, `.gitignore`, `test-plan.md` bookkeeping) is pure config/scaffolding — not E2E-worthy itself — and runs via `/10x-implement`. **Phase 2** (the actual risk-tied spec) is deliberately handed to `/10x-e2e`, which owns the seed-exemplar pattern, generation, five-anti-pattern review, and the deliberate-break verification — this plan specifies the risk and assertion contract, not the literal test code.

`globalSetup` seeds one user/dog/element via existing `db.ts` helpers, signs in via the real `/api/auth/signin` route to produce a correctly-shaped `storageState`, and writes the seeded IDs to a companion JSON file (`storageState` itself can't carry them). `globalTeardown` reads that file independently and deletes the user directly — it doesn't rely on `globalSetup`'s in-memory cleanup closure surviving across process boundaries.

## Phases at a Glance

| Phase                                     | What it delivers                                                              | Key risk                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Playwright bootstrap (infra)           | Dependency, config, seed/auth plumbing, advisory CI job, `.gitignore` cleanup | New CI job flakes on first runs (Supabase/dev-server boot timing)     |
| 2. Mobile field-use regression-guard test | One spec proving Risk #1 stays fixed, deliberate-break verified               | Chromium-only misses a WebKit-specific regression of the tap-zoom fix |

**Prerequisites:** Local Supabase running (`npx supabase start`), `.env` with `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
**Estimated effort:** ~1-2 sessions across 2 phases (Phase 1 is mechanical infra; Phase 2 runs through `/10x-e2e`'s own loop).

## Open Risks & Assumptions

- Chromium-only coverage doesn't exercise WebKit, the engine research names for the tap-zoom quirk — accepted tradeoff; a manual real-device/WebKit spot-check (Phase 2 manual verification) partially offsets this.
- Advisory CI means a red e2e run doesn't block merges until someone manually promotes the job to a required status check in GitHub repo settings — outside this plan's file changes.
- `globalSetup`/`globalTeardown` seeding (rather than per-test) is only safe because this phase ships exactly one spec; a second e2e test later should move to per-test seeding to preserve independence.

## Success Criteria (Summary)

- `npx playwright test` passes locally and in CI against a Chromium mobile profile
- The spec fails when either historical fix (`initial-scale=1` or the `TickCell` hitbox) is reverted, and passes again once restored
- No previously-tracked ephemeral `.playwright-cli/` artifacts remain in git
