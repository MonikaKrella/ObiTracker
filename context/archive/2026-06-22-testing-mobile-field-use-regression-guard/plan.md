# Testing Mobile Field-Use Regression Guard Implementation Plan

## Overview

Bootstrap Playwright from scratch (no e2e infrastructure exists in this repo today) and add one risk-tied mobile-viewport test that protects the training grid against test-plan.md Risk #1: a desktop-targeted CSS/layout change silently collapsing the mobile grid to a fraction of the viewport width. Both known historical causes of that symptom are already fixed in code (`src/layouts/Layout.astro:17` viewport meta, `src/components/training-grid/TickCell.tsx:74-88` tap-hitbox fix) — this phase turns that fix into a standing, deterministic guard instead of tribal knowledge in a plan's "Deviations" section.

## Current State Analysis

- No Playwright dependency, config, `tests/e2e/` directory, or CI e2e step exists anywhere in the repo (`context/changes/testing-mobile-field-use-regression-guard/research.md`, "Playwright/CI bootstrap" section).
- The mobile-width mechanism is a three-layer, uncontained chain with no shared abstraction: `AuthLayout.astro`'s `max-w-4xl` column → `grid.astro`'s page-specific `mx-[calc(50%-50vw)]` break-out → `TrainingGrid.tsx`'s `overflow-x-auto` scroll wrapper. `html, body { overflow-x: hidden }` (`src/layouts/Layout.astro:42-49`) means a future miscalculation anywhere in that chain would silently clip rather than produce a visible scrollbar or console error.
- Both historical bugs manifested as `visualViewport.scale` collapsing toward 0 (measured `≈0.25` in the real incident) — that API is the precise technical signature of the failure class this test guards against, not merely a symptom worth checking incidentally.
- `.playwright-cli/*` manual-exploration artifacts are currently staged in git (per `git status`) — ephemeral debug output from an external CLI tool used during research, not part of the test suite.
- Existing Vitest integration tests (`src/lib/tests/data-integrity.test.ts`, `cross-account-authorization.test.ts`) already establish the seeding/auth/cleanup pattern (`src/lib/tests/helpers/db.ts`) this phase reuses, and CI (`.github/workflows/ci.yml`) already knows how to start local Supabase and export its credentials.

## Desired End State

Running `npx playwright test` locally (with local Supabase up and `npm run dev` available) executes one seed test plus one risk-tied spec against a real Chromium mobile emulation profile, both green. CI runs the same suite as a new, non-blocking `e2e` job on every PR. If `src/layouts/Layout.astro:17`'s `initial-scale=1` (or the `TickCell.tsx` full-size hitbox) were ever reverted, the new spec would fail — verified once, deliberately, during Phase 2.

### Key Discoveries:

- `src/pages/api/auth/signin.ts:10-39` mints a real, correctly-cookie-shaped session via `@supabase/ssr` when POSTed form-encoded `email`/`password` — the recommended way to build `storageState` without reverse-engineering cookie internals or driving the UI form.
- `src/lib/tests/helpers/db.ts` already exports `createAdminClient`, `createTestUser`, `seedDog`, `seedElement` — reusable as-is for e2e seeding, just called from a Playwright `globalSetup` instead of a Vitest `beforeEach`.
- `TrainingGrid.tsx:97-99` renders a distinct `EmptyElementsGrid` when `elements.length === 0` — seeding must include `seedElement`, not just `seedDog`, or the test would exercise the wrong UI state.
- `TickCell.tsx:87` gives the tick checkbox a stable accessible name (`aria-label={`${elementName}, ${formatAriaDate(date)}`}`) — usable directly with `getByRole('checkbox', { name: ... })`, no test IDs needed.
- Dog selection is a path segment (`/dogs/<uuid>/grid`), resolved and ownership-checked by `src/middleware.ts` — the test navigates straight to the seeded dog's URL, no UI dog-picker flow required.

## What We're NOT Doing

- Not writing a general-purpose or page-wide e2e suite — scoped to the one training-grid risk per `test-plan.md` §7's explicit "no blanket visual-snapshot tests" exclusion.
- Not adding WebKit or Firefox projects — Chromium (`devices['Pixel 5']`) only, a deliberate scope tradeoff (see Open Risks in the plan brief).
- Not literally simulating "a future desktop-targeted CSS change" in the test itself — the deterministic width/scale assertion is designed to be agnostic to _how_ a future regression happens, so no synthetic "break the CSS" step is added as permanent test code (a one-time deliberate-break check happens during Phase 2's VERIFY step, then is reverted, never committed).
- Not promoting the new CI job to a required/blocking status check — it lands advisory (runs and reports on every PR, but doesn't block merges) for this phase; promoting it is a follow-up GitHub repo-settings action outside this plan's file changes.
- Not writing `tests/e2e/mobile-grid.spec.ts` or `tests/e2e/seed.spec.ts` in Phase 1 — both are generated in Phase 2 by `/10x-e2e`, which owns the seed-exemplar + PLAN→GENERATE→REVIEW→VERIFY loop; Phase 1 only builds the infrastructure they run on.

## Implementation Approach

Two phases, matching the project's existing plan/implement/e2e split: Phase 1 is pure infrastructure (dependency, config, auth/seed plumbing, CI, cleanup) with no test-writing judgment calls, driven by `/10x-implement`. Phase 2 is the one browser-level risk itself, deliberately left to `/10x-e2e` so it gets that skill's seed-pattern grounding, five-anti-pattern review, and deliberate-break verification rather than being hand-written here.

## Critical Implementation Details

**`storageState` can't carry seeded IDs.** Playwright's `storageState` snapshots cookies/localStorage only — it has no slot for the seeded dog/element IDs the spec needs to build its target URL. `globalSetup` must write those to a second JSON file (`playwright/.auth/seed.json`: `{ userId, dogId, elementId, email }`) alongside the `storageState` cookie file (`playwright/.auth/user.json`), and both the spec and `globalTeardown` read from `seed.json`.

**`globalTeardown` must not depend on `globalSetup`'s in-memory closure.** `createTestUser`'s returned `cleanup()` closure only exists within `globalSetup`'s own execution — Playwright does not guarantee `globalTeardown` runs in the same process/module scope. `globalTeardown` must independently call `createAdminClient()` and `admin.auth.admin.deleteUser(userId)` directly (reading `userId` from `seed.json`), mirroring what `cleanup()` does rather than reusing the closure itself.

**Playwright config isn't a Vite context.** Unlike `vitest.config.ts`'s `loadEnv`, `playwright.config.ts` and the global setup/teardown scripts run outside Vite entirely, so `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` won't be populated from `.env` automatically for local runs. Load them explicitly via `dotenv/config` at the top of `playwright.config.ts` (new devDependency) — CI already exports the same three vars into `$GITHUB_ENV`, so this is a local-only gap.

**`visualViewport.scale` is the assertion, not a proxy for one.** Both historical bugs collapsed `window.visualViewport.scale` toward 0 (measured `≈0.25` in the real incident) — this is the literal, precise signature of the failure class, not an indirect symptom. The Phase 2 spec's core assertions are `page.evaluate(() => window.visualViewport.scale)` staying within a small tolerance of 1, both after initial load and after tapping a tick cell, plus a page-level `document.documentElement.scrollWidth` ≈ `clientWidth` check (catches a regression that `overflow-x: hidden` would otherwise clip silently, per research's "Architecture Insights").

---

## Phase 1: Playwright bootstrap (infra)

### Overview

Stand up everything `/10x-e2e` assumes already exists — dependency, config, an auth+seed pattern, a CI job — without writing any spec content. This phase is deliberately not E2E-worthy itself (pure config/infra, per the project's own E2E-eligibility gate).

### Changes Required:

#### 1. Playwright dependency + script

**File**: `package.json`

**Intent**: Add Playwright as the e2e test runner and give it a dedicated npm script, distinct from Vitest's `test`.

**Contract**: `devDependencies` gains `@playwright/test` and `dotenv` (see Critical Implementation Details). Scripts gains `"test:e2e": "playwright test"`.

#### 2. Playwright config

**File**: `playwright.config.ts` (new, repo root)

**Intent**: Wire the running app, the mobile browser profile, and the auth/seed lifecycle together.

**Contract**: `testDir: "./tests/e2e"`; `webServer: { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: !process.env.CI }` (matches `wrangler.jsonc`'s pinned port and research's "pragmatic target" recommendation); `globalSetup`/`globalTeardown` pointing at the two files below; one project only — `{ name: "mobile-chrome", use: { ...devices["Pixel 5"], storageState: "playwright/.auth/user.json" } }`. Load env via `dotenv/config` before anything else reads `process.env`.

#### 3. Global setup — seed + auth

**File**: `tests/e2e/global-setup.ts` (new)

**Intent**: Seed one test user/dog/training-element via the existing `db.ts` helpers, then mint a real session and persist it as `storageState`, so every spec in this phase starts already authenticated against a known dog.

**Contract**: Uses `createAdminClient`, `createTestUser`, `seedDog`, `seedElement` from `src/lib/tests/helpers/db.ts`. Signs in by POSTing form-encoded `email`/`password` to `http://localhost:4321/api/auth/signin` via Playwright's `request.newContext({ baseURL })`, then `requestContext.storageState({ path: "playwright/.auth/user.json" })`. Writes `{ userId, dogId, elementId, email }` to `playwright/.auth/seed.json`. Unique email per run (timestamp suffix, matching `createTestUser`'s existing pattern) — no cross-run collisions.

#### 4. Global teardown — cleanup

**File**: `tests/e2e/global-teardown.ts` (new)

**Intent**: Delete the seeded user (cascading dogs → elements → logs) after the full run, independent of `global-setup.ts`'s process lifetime.

**Contract**: Reads `playwright/.auth/seed.json`, calls `createAdminClient()` and `admin.auth.admin.deleteUser(userId)` directly — does not import or reuse `createTestUser`'s `cleanup()` closure (see Critical Implementation Details).

#### 5. Ignore runtime/debug artifacts

**File**: `.gitignore`

**Intent**: Keep Playwright's own output and the auth/seed runtime files out of version control, and stop tracking the ephemeral manual-exploration artifacts from this research session.

**Contract**: Add `playwright-report/`, `test-results/`, `playwright/.auth/`, and `.playwright-cli/`. Separately, `git rm --cached` the currently-staged `.playwright-cli/*` files and delete them from the working tree — they're debug output from an external CLI tool, not part of the suite (research.md, "The current PR being worked on").

#### 6. CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the e2e suite on every PR alongside the existing `ci` job, without making it a required check.

**Contract**: New top-level job `e2e` (parallel to the existing `ci` job, same `on:` triggers): checkout, `setup-node@v4` (Node 22), `supabase/setup-cli@v1`, `npm ci`, `npx playwright install --with-deps chromium`, start Supabase and export `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` into `$GITHUB_ENV` (same pattern as the existing job), then `npm run test:e2e`. Not added to any branch-protection required-checks list — advisory by omission, matching the chosen rollout strategy.

#### 7. Test-plan bookkeeping

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that Playwright now exists and the gate is advisory-first, not yet blocking.

**Contract**: §4 Stack table, `e2e` row: update from "none yet — see Phase 1" to note Playwright is bootstrapped and scoped to this one spec. §5 Quality Gates table, "e2e on mobile viewport" row: update "Required?" from "required after §3 Phase 1" to reflect advisory-first status, with a one-line note that promotion to required is a manual follow-up.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on all new/changed files
- `npm ci && npx playwright install --with-deps chromium` completes without error
- `npx playwright test --list` runs without a config-loading error (0 tests found is expected — no spec exists until Phase 2)
- `git status` no longer shows `.playwright-cli/**` as tracked, and it's covered by `.gitignore`

#### Manual Verification:

- The new `e2e` CI job runs on the PR (Supabase start, dev-server boot, Playwright install all succeed) even though it currently finds 0 tests — validates the pipeline plumbing before Phase 2 adds real assertions
- Confirm the `e2e` job is not configured as a required status check (advisory, per the chosen rollout strategy)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Mobile field-use regression-guard test

### Overview

The one risk-tied spec this rollout phase exists to deliver — driven by `/10x-e2e`, not hand-written here. This section specifies the risk and contract `/10x-e2e`'s PLAN step should consume; the actual test code is generated, reviewed against the five anti-patterns, and deliberate-break-verified by that skill.

### Changes Required:

#### 1. Seed exemplar + E2E rules (one-time, created by `/10x-e2e` itself)

**File**: `tests/e2e/seed.spec.ts`

**Intent**: `/10x-e2e`'s own first-use setup creates this from `references/seed-test-pattern.md` if absent — not written by this plan. The project's E2E rules block already exists in root `CLAUDE.md` (the "10xDevs AI Toolkit - Module 3, Lesson 4" section), so that lever needs no new file.

**Contract**: N/A — owned by `/10x-e2e`'s Setup step 6.

#### 2. The risk-tied spec

**File**: `tests/e2e/mobile-grid.spec.ts`

**Intent**: Prove test-plan.md Risk #1 stays fixed: at a real mobile viewport, the training grid renders using the full available width (not collapsed) and stays usable after a tap, both on initial load and after interaction — using the seeded dog/element from Phase 1's `global-setup.ts` and navigating straight to `/dogs/<dogId>/grid`.

**Contract**: One test (per the chosen single-combined-test structure), named to bind it to the risk (e.g. `"training grid renders at full mobile width and stays usable after a tap"`). Assertions, in order:

1. On load: `page.evaluate(() => window.visualViewport.scale)` is within a small tolerance of `1` (catches the shrink-to-fit collapse — the historical incident measured `≈0.25`).
2. On load: `document.documentElement.scrollWidth` is within ~1px of `document.documentElement.clientWidth` — no page-level horizontal overflow (catches a regression `overflow-x: hidden` would otherwise clip silently).
3. Tap one tick cell via `getByRole('checkbox', { name: /.../ })` (the `aria-label` `TickCell.tsx:87` already provides — no test IDs needed).
4. After the tap: re-assert `visualViewport.scale` ≈ `1` (catches the tap-triggered zoom quirk) and assert the checkbox's `checked` state flipped (the toggle itself still works).

Uses the `mobile-chrome` project's `storageState` — no UI login. Reads `dogId`/`elementId` from `playwright/.auth/seed.json` (Phase 1). No per-test cleanup needed (teardown is global — see Critical Implementation Details on why this is acceptable for exactly one test in this phase).

### Success Criteria:

#### Automated Verification:

- `npx playwright test tests/e2e/mobile-grid.spec.ts` passes locally against `npm run dev`
- Deliberate-break check (per `/10x-e2e`'s own VERIFY step): temporarily revert `initial-scale=1` in `src/layouts/Layout.astro:17`, re-run the spec, confirm it fails; revert immediately and confirm green again — never committed
- `npm run lint` passes on `tests/e2e/mobile-grid.spec.ts` and `tests/e2e/seed.spec.ts`
- The `e2e` CI job passes on the PR

#### Manual Verification:

- On a real mobile device or DevTools device emulation (outside the Chromium-only Playwright project), spot-check that the grid renders full-width and a tap doesn't zoom — closes research's open question about the `TickCell.tsx` fix never being device-confirmed, supplementing the Chromium-only automated coverage
- Confirm the generated spec matches the seed-test-pattern's four qualities (role-based locators, independence, wait-for-state, risk-tied name) — `/10x-e2e`'s own REVIEW step

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added — this phase is browser-level by design; the underlying logic (highlight, dates, grid helpers) already has unit coverage from Phase 2 of the wider test-plan.md rollout.

### Integration Tests:

- None added — Risk #1 exists only in rendered/CSS behavior, which an integration test (no browser) cannot observe.

### Manual Testing Steps:

1. After Phase 1, confirm the CI `e2e` job boots successfully with 0 tests (pipeline plumbing check).
2. After Phase 2, run the spec locally and watch it fail during the deliberate-break check, then pass again after reverting.
3. Spot-check the grid on a real phone or DevTools mobile emulation outside Chromium (e.g. Safari/WebKit) to supplement the Chromium-only automated coverage.

## Performance Considerations

The new `e2e` CI job adds roughly 1-2 minutes to PR turnaround (Supabase start + Chromium install + one dev-server boot) but runs in parallel with the existing `ci` job, not in series — and it's advisory, so it never blocks merges.

## Migration Notes

N/A — no data migration; purely additive test infrastructure.

## References

- Research: `context/changes/testing-mobile-field-use-regression-guard/research.md`
- Risk source: `context/foundation/test-plan.md` §2 Risk #1, §3 Phase 1
- Historical incident write-up: `context/changes/training-grid/plan.md:392-414`
- Seed/auth pattern precedent: `src/lib/tests/helpers/db.ts`, `src/lib/tests/data-integrity.test.ts`, `src/lib/tests/cross-account-authorization.test.ts`
- E2E skill: `.claude/skills/10x-e2e/SKILL.md`, `references/seed-test-pattern.md`, `references/e2e-quality-rules.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Playwright bootstrap (infra)

#### Automated

- [x] 1.1 `npm run lint` passes on all new/changed files — 2703bd1
- [x] 1.2 `npm ci && npx playwright install --with-deps chromium` completes without error — 2703bd1
- [x] 1.3 `npx playwright test --list` runs without a config-loading error — 2703bd1
- [x] 1.4 `.playwright-cli/**` no longer tracked and covered by `.gitignore` — 2703bd1

#### Manual

- [x] 1.5 New `e2e` CI job runs successfully on the PR (0 tests found, pipeline plumbing validated)
- [x] 1.6 `e2e` job confirmed not a required status check (advisory)

### Phase 2: Mobile field-use regression-guard test

#### Automated

- [x] 2.1 `npx playwright test tests/e2e/mobile-grid.spec.ts` passes locally — 2e2bb5b
- [x] 2.2 Deliberate-break check: spec fails when the regression is reproduced, passes again after revert (see Deviations below — broke the CSS overflow wrapper, not `initial-scale`, and corrected assertion 2's target element in the process) — 2e2bb5b
- [x] 2.3 `npm run lint` passes on the new spec files — 2e2bb5b
- [x] 2.4 `e2e` CI job passes on the PR — 0bf173d

#### Manual

- [x] 2.5 Real-device or non-Chromium spot-check of full-width render + no-zoom-on-tap
- [x] 2.6 Generated spec reviewed against the five anti-patterns (hallucinated assertion, brittle selector, shared state, wait-for-time, no cleanup) — none found in `seed.spec.ts` or `mobile-grid.spec.ts`

### Deviations from the plan (Phase 2)

- **Deliberate-break target.** The plan's Success Criteria named reverting `initial-scale=1` in `Layout.astro:17` as the deliberate break. Tried it first — the mobile-grid spec stayed green, because Playwright's Chromium device emulation (`devices["Pixel 5"]`) doesn't reproduce the mobile-browser shrink-to-fit zoom heuristic the meta tag guards against on a real device; `visualViewport.scale` stayed `1` regardless of the meta tag in this environment. Switched the break to the actual CSS mechanism Risk #1 describes: temporarily stripped `max-w-full overflow-x-auto` from the grid's scroll wrapper (`TrainingGrid.tsx` line 146) so the 30-day table overflows its container un-scrolled — this is a faithful reproduction of "a desktop-targeted CSS change silently collapses the mobile grid." Reverted immediately after confirming red→green; never committed.
- **Assertion 2's target element.** The plan specified `document.documentElement.scrollWidth` vs `clientWidth`. Empirically, `Layout.astro`'s `overflow-x: hidden` is set on both `html` and `body` — and Chromium clamps `documentElement.scrollWidth` to its own `clientWidth` once `html` itself has `overflow-x: hidden`, so the literal assertion never caught the deliberate break (stayed passing even mid-regression). `document.body.scrollWidth` still reports the true unclamped content extent, so the spec asserts on that instead. Confirmed this correctly fails on the break and passes after the revert.
- **CI failure: Vitest picked up the new Playwright specs.** `npm run test` (Vitest, required job) failed on the pushed commit — `vitest.config.ts` had no `test.include`, so its default glob (`**/*.{test,spec}.ts`) also matched `tests/e2e/*.spec.ts`, and Playwright's `test()` isn't callable outside the Playwright runner (`Playwright Test did not expect test() to be called here`). Not caught locally during Phase 2 because `npm run test` was never re-run after the new spec files were added — only `npx playwright test` and `eslint` were. Fixed by scoping `vitest.config.ts`'s `test.include` to `src/**/*.test.ts`, matching this project's actual unit/integration test location (`context/foundation/test-plan.md` §6.1). Verified locally: `npm run test` now runs exactly the 5 pre-existing suites (49 passing), no e2e specs picked up.
