---
date: 2026-07-20T19:28:53Z
researcher: Claude
git_commit: 9942dacfa6284c88a10f9233a7cb4472fcd3c7e0
branch: e2e
repository: ObiTracker
topic: "Testing mobile field use regression guard"
tags: [research, codebase, mobile, viewport, playwright, e2e, training-grid, layout]
status: complete
last_updated: 2026-07-20
last_updated_by: Claude
---

# Research: Testing mobile field use regression guard

**Date**: 2026-07-20T19:28:53Z
**Researcher**: Claude
**Git Commit**: 9942dacfa6284c88a10f9233a7cb4472fcd3c7e0
**Branch**: e2e
**Repository**: ObiTracker

## Research Question

This is Phase 1 of the phased test rollout (`context/foundation/test-plan.md` §3, Risk #1): "A desktop-targeted CSS/layout change silently collapses the mobile grid (observed: rendered at ~10% of viewport width), making field use impossible." Goal: prove the training grid renders and works at real mobile viewports, and survives a future desktop-targeted CSS change, via a new deterministic Playwright viewport/width check — the first e2e test in this codebase.

## Summary

The reported incident is **fully documented**, not just a one-line test-plan citation: `context/changes/training-grid/plan.md:392-414` gives the exact root cause. A missing `initial-scale=1` in the viewport `<meta>` tag caused mobile browsers to shrink-to-fit the entire page (not just the grid) to accommodate the grid's intentionally-wide table, producing `visualViewport.scale ≈ 0.25` — matching the "~10% of viewport width" symptom almost exactly. That bug is already fixed in current code (`src/layouts/Layout.astro:17`), alongside a second, tap-triggered mobile zoom bug in `TickCell.tsx` (fixed by replacing a `sr-only`-clipped checkbox with a full-size `opacity-0` overlay) — but the training-grid change's own writeup flags that second fix as **"not yet user-confirmed on-device"** as of its last update. Both fixes are layout-affecting but not grid-specific (`Layout.astro` is shared by every page), meaning a regression could reintroduce either failure mode via an edit anywhere in the shared layout chain, not just in grid-specific files.

The mobile-width mechanism itself is a fragile, three-layer, uncontained chain: `AuthLayout.astro`'s centered `max-w-4xl` column → `grid.astro`'s one-off `mx-[calc(50%-50vw)]` full-bleed break-out (unique to this page, not a shared/reusable pattern) → `TrainingGrid.tsx`'s `w-fit max-w-full overflow-x-auto` scroll wrapper. `overflow-x: hidden` on `html`/`body` (added as part of the incident fix) would silently clip rather than surface any future miscalculation in that chain — reinforcing why a deterministic rendered-width assertion, not a "no console error" check, is required.

No Playwright infrastructure exists yet in this repo — this is a from-scratch e2e bootstrap, not just a new spec file. However, several pieces are already primed for it: `.gitignore` already ignores `auth.json` (apparently anticipating `storageState`), `src/lib/tests/helpers/db.ts` exposes reusable Node-side seeding helpers, and the real `/api/auth/signin` API route can mint valid session cookies for `storageState` without ever driving the UI login form.

## Detailed Findings

### The historical incident (Risk #1's real-world source)

- `context/changes/training-grid/plan.md:392-403` — root cause: `src/layouts/Layout.astro`'s `<meta name="viewport">` was `width=device-width` with no `initial-scale`. The grid's table is deliberately ~1650px wide (30 date columns × `min-w-[3.5rem]` + sticky name column), meant to scroll inside its own `overflow-x-auto` wrapper. Without `initial-scale=1`, mobile browsers' shrink-to-fit heuristic zoomed the _entire page_ out (measured `visualViewport.scale = 0.25` against a 390px device with `window.innerWidth` measuring 1560px) instead of confining the overflow to the intended internal scroller — reproduced pixel-for-pixel by reverting the fix.
- Fix (already landed): `src/layouts/Layout.astro:17` — `<meta name="viewport" content="width=device-width, initial-scale=1" />`; `src/layouts/Layout.astro:42-50` — `overflow-x: hidden` added to `html, body` as a defensive backstop, not the primary fix.
- **A second, distinct bug**, surfaced only by tapping a tick cell (not on initial load): `context/changes/training-grid/plan.md:404-414`. Root cause (explicitly flagged as "hypothesis, not yet user-confirmed on-device"): the `TickCell` checkbox `<input>` was hidden via Tailwind's `sr-only` (clips to 1×1px) inside the horizontally-scrollable grid wrapper; mobile WebKit/Blink has a known quirk where focusing a near-zero-size element inside a scrollable ancestor triggers a "scroll/zoom focused element into view" heuristic that can compute an extreme zoom.
- Fix (already landed): `src/components/training-grid/TickCell.tsx:75-88` — the input is now `absolute inset-0 size-full opacity-0` inside a `relative` `<label>`, matching the visible 44×44px touch target's bounding box instead of collapsing to 1px.
- **Both fixes live in shared, non-grid-specific files** (`Layout.astro` wraps every page via `AuthLayout.astro`; `TickCell.tsx` is grid-specific but the _pattern_ — a focusable element with a near-zero hit box inside a horizontal scroller — could recur elsewhere). This means the e2e test should verify both the static rendered width **and** a real tap interaction, not just a page-load snapshot, since the second bug only manifested on tap.
- The current PR being worked on (per `git status`) has `.playwright-cli/` artifacts already staged from manual exploration on 2026-07-20 (signin/dashboard snapshots) — these are ephemeral debug output from an external Playwright CLI tool, not part of the actual test suite, and should not be committed as part of this change (see Playwright infra findings below).

### PRD / roadmap grounding

- `context/foundation/prd.md:47` (Guardrails): "Full usability on both phone (field use) and laptop (review at home) — no degraded mobile experience."
- `context/foundation/prd.md:101` (NFR): "The app is fully usable on a phone (touch-first, field conditions) and on a laptop (pointer-based, home review) — no feature is degraded or hidden on either device."
- `context/foundation/prd.md:87-89` — FR-005 requires the grid to scroll horizontally on mobile; a resolved Socrates note explains the 7/14/30-day window selector plus horizontal scroll was the answer to "fixed 30 days is too wide for phone."
- `context/foundation/roadmap.md:44` (S-04) — "Critical path to the north star; invest in data schema and mobile frontend UX." No separate mobile risk note in roadmap.md's S-04 risk fields (its only documented risk there concerns the highlight tie-break algorithm, not layout).
- No standalone "interview" transcript exists on disk for the Q1–Q4 evidence test-plan.md's Risk #1/#2 Source columns cite — those were apparently conducted live during the `/10x-test-plan` session and not persisted. `context/archive/` contains only a README; nothing archived yet.

### CSS/layout mechanism controlling mobile grid width

- `src/pages/dogs/[id]/grid.astro:61-71` — the full-bleed break-out: `<div class="mx-[calc(50%-50vw)] px-4 lg:px-8">` cancels `AuthLayout.astro`'s `mx-auto max-w-4xl px-4 py-6` centered column (`src/layouts/AuthLayout.astro:18`) so the grid can span full viewport width. This pattern is **unique to `grid.astro`** — no other `AuthLayout` page (`dashboard.astro`, `dogs/[id]/dashboard.astro`, `dogs/[id]/elements.astro`, `dogs/new.astro`) uses it, and there is no shared component/utility encoding it — it's hand-written and commented in place, so any future replication would be copy-paste with no single point of fix.
- `src/components/training-grid/TrainingGrid.tsx:146` — the scroll wrapper: `mx-auto w-fit max-w-full overflow-x-auto [overflow-y:clip] rounded-2xl border ...`, wrapping a `table-fixed` table with fixed column widths (`w-[15.625rem]` sticky name column at lines 151/193/261/273; `w-[3.5rem]` per-date columns at lines 159/265).
- `src/layouts/Layout.astro:42-49` — `html, body { overflow-x: hidden; ... }`, added in the same historical fix as `initial-scale=1` (confirmed above), not an independent design choice.
- No Tailwind breakpoint/container customization exists (`src/styles/global.css` has no `@theme --breakpoint-*` overrides); Tailwind's default breakpoints apply (`sm`=640px, `md`=768px, `lg`=1024px). The break-out's only responsive step is `lg:px-8` — nothing narrower gets special handling, so mobile is implicitly "whatever renders when no `lg:` override fires."
- **Risk mechanism for a future regression**: the chain has no width fallback or containment query. A plausible break: a desktop-targeted edit to `AuthLayout.astro`'s wrapper (e.g. adding a new `lg:`-scoped container/padding for other pages) without also touching `grid.astro`'s `calc(50%-50vw)`, which is computed relative to that wrapper's `50%`. Any change to how/where that 50% is computed would break specifically on mobile (where `lg:` overrides don't mask it), while looking fine on desktop — and `overflow-x: hidden` would silently clip the result rather than surfacing a scrollbar.
- Git history: the break-out, `TrainingGrid.tsx`'s scroll wrapper, and `Layout.astro`'s `overflow-x: hidden` all trace to a single commit (`7706bd2`, "feat: Training grid (S-04)") — no prior mobile-fix churn exists to compare against; the current implementation (with the two historical bugs above already fixed on top of it) is what should be protected going forward.

### Playwright/CI bootstrap — greenfield, not incremental

- **Confirmed nothing exists yet**: no `playwright`/`@playwright/test` dependency, no `playwright.config.*`, no `*.spec.ts`, no `tests/e2e/` directory anywhere in the repo.
- `package.json` scripts (full list): `dev` (`astro dev`), `build`, `preview`, `astro`, `lint`, `lint:fix`, `format`, `test` (`vitest run`), `deploy` (`wrangler deploy`) — no `test:e2e` yet. No `engines` field; CI pins Node 22 (`.github/workflows/ci.yml:11-13`... via `actions/setup-node@v4`).
- `wrangler.jsonc` fixes the dev port at 4321 (`"dev": { "port": 4321 }`); `astro.config.mjs` uses `output: "server"` + Cloudflare adapter. **`astro dev` does not fully emulate the Cloudflare workerd runtime** — it's a Vite/Node dev server. For this phase's purposes (hitting Supabase directly, no Cloudflare-bindings-specific behavior under test), `npm run dev` on port 4321 is the pragmatic Playwright `webServer` target; `astro build` + `wrangler`-backed preview would be the closer-to-production alternative if ever needed.
- `.gitignore` has **no** Playwright-related ignores yet (`playwright-report/`, `test-results/`, `.playwright-cli/` are all absent) — `.playwright-cli/` artifacts are currently _staged_ in git status and should be gitignored/unstaged rather than committed. Notably, `.gitignore` **already** ignores `auth.json`, labeled "auth test setup" — this pre-anticipates a Playwright `storageState` file landing at that path.
- `vitest.config.ts` uses `loadEnv(mode, process.cwd(), "")` to pull all `.env` vars into `process.env` for integration tests (mirrors what a Playwright global-setup process will need to do itself, e.g. via `dotenv`, since Playwright config isn't a Vite context).
- `.env.example` declares exactly the three vars integration tests and a Playwright global-setup would both need: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- CI (`.github/workflows/ci.yml`) already starts local Supabase and exports these three vars as `GITHUB_ENV` before running `npm run test` — the same job (or a new one following it) can reuse that setup for a Playwright step, adding only `npx playwright install --with-deps` and a `test:e2e` script/invocation.
- Missing, concretely: the `playwright`/`@playwright/test` devDependency; `playwright.config.ts` (with `webServer` → `npm run dev`, env passthrough); `tests/e2e/` dir + seed spec per `.claude/skills/10x-e2e/references/seed-test-pattern.md`; a `test:e2e` script; a CI step; the three `.gitignore` entries; and removal of the currently-staged `.playwright-cli/*` files.
- The project's own `/10x-e2e` skill (`.claude/skills/10x-e2e/SKILL.md:61,111-122`) explicitly **refuses** to install Playwright or scaffold config — it only drives tests once that infra exists. This confirms the bootstrap work (config, script, CI wiring) is this phase's own responsibility, separate from writing the actual mobile-viewport spec.

### Auth/seeding strategy for the e2e test

- **Recommended approach**: seed data node-side (reuse `src/lib/tests/helpers/db.ts`'s `createAdminClient`, `createTestUser`, `seedDog`, `seedElement` — the same helpers Phase 3/4 integration tests already use) inside a Playwright `globalSetup`, then mint real session cookies by POSTing the seeded user's credentials to `/api/auth/signin` (`src/pages/api/auth/signin.ts:10-39`) against the running dev server, and capture the result into Playwright's `storageState`. This satisfies the project's own "authenticate without the UI" e2e guideline while guaranteeing cookie-format correctness, since it reuses the real `@supabase/ssr` cookie-writing code path (`src/lib/supabase.ts:9-23`) rather than hand-constructing cookies (which would require reverse-engineering `@supabase/ssr`'s internal chunking/naming — brittle across version bumps).
- Dog selection is purely a **path segment**, not a query param or client-side state: `src/middleware.ts` resolves `context.locals.selectedDog` from `/dogs/<uuid>/...` via a regex, checking ownership against the authenticated user, and redirects (`?flash=dog_not_found`) if the seed/session pairing is wrong — a useful built-in sentinel if seeding is ever misconfigured. `PROTECTED_ROUTES` includes `/dogs`, covering `/dogs/[id]/grid`.
- Teardown: reuse the `cleanup()` closure `createTestUser` already returns (cascades `auth.users → dogs → training_elements → training_logs`), exactly as `data-integrity.test.ts` and `cross-account-authorization.test.ts` already do for Vitest.
- Fallback if API-route seeding is ever blocked: a real UI login is entirely viable too — `src/pages/auth/signin.astro` + `SignInForm.tsx` use clean `getByLabel("Email")`/`getByLabel("Password")` targets (via `FormField.tsx`), just slower per-test than storageState reuse.
- The grid requires **at least one training element** to render its populated state — `TrainingGrid.tsx:97-99` renders a distinct `EmptyElementsGrid` skeleton when `elements.length === 0`, so seeding must include `seedElement`, not just `seedDog`.

## Code References

- `context/changes/training-grid/plan.md:392-414` — full root-cause writeup for both historical mobile bugs (viewport shrink-to-fit, tick-checkbox zoom quirk)
- `src/layouts/Layout.astro:17,42-49` — viewport meta fix + `overflow-x: hidden` backstop
- `src/components/training-grid/TickCell.tsx:74-88` — full-size `opacity-0` overlay fix (was `sr-only`)
- `src/pages/dogs/[id]/grid.astro:61-71` — full-bleed break-out, unique to this page
- `src/layouts/AuthLayout.astro:18` — the `max-w-4xl` centered column the break-out cancels
- `src/components/training-grid/TrainingGrid.tsx:146` — scroll wrapper (`w-fit max-w-full overflow-x-auto`)
- `src/middleware.ts` — `PROTECTED_ROUTES`, dog-selection-by-path-segment, ownership check
- `src/lib/supabase.ts:9-23` — `@supabase/ssr` cookie adapter (don't hand-construct storageState cookies)
- `src/pages/api/auth/signin.ts:10-39` — real sign-in endpoint to mint storageState-ready cookies
- `src/lib/tests/helpers/db.ts` — reusable seeding helpers (`createAdminClient`, `createTestUser`, `seedDog`, `seedElement`, `cleanup()`)
- `.github/workflows/ci.yml` — existing local-Supabase CI setup a Playwright job step can extend
- `vitest.config.ts`, `.env.example` — env-loading pattern to mirror in a Playwright global-setup
- `.claude/skills/10x-e2e/SKILL.md:61,111-122` — confirms this skill assumes Playwright pre-exists and won't install it
- `.claude/skills/10x-e2e/references/seed-test-pattern.md`, `references/e2e-quality-rules.md` — templates to use once Playwright itself is installed

## Architecture Insights

- The mobile-width mechanism is a **three-layer, uncontained chain** (`AuthLayout` column → `grid.astro` break-out → `TrainingGrid` scroll wrapper) with no shared abstraction — the break-out is hand-written and page-specific, so a future desktop-targeted `AuthLayout` change is the most plausible regression vector, and `overflow-x: hidden` means such a regression would clip silently rather than produce a visible scrollbar or console error.
- Both historical mobile bugs lived in **shared, non-grid-specific files** (`Layout.astro`) or a **reusable pattern** (a near-zero-hitbox focusable element inside a scroll container) — a regression test scoped only to `grid.astro`'s own markup would miss a regression introduced via `Layout.astro` or reintroduced via the same anti-pattern elsewhere.
- The tap-triggered zoom bug (still unconfirmed on-device per the historical writeup) means a page-load-only viewport/width assertion is insufficient — the e2e test should include an actual tap on a tick cell as part of its check, not just measure static rendered width.
- The project's test infrastructure for integration tests (`db.ts` helpers, two-client seeding, `cleanup()` lifecycle) is directly reusable for e2e global setup/teardown — no new seeding pattern needs to be invented, just adapted from Node-context (Vitest) to Playwright's `globalSetup`/`globalTeardown` lifecycle.

## Historical Context (from prior changes)

- `context/changes/training-grid/plan.md` — original S-04 implementation plan; its "Deviations from Plan" section (lines 370-419) is the authoritative source for both historical mobile bugs, discovered during that change's own Phase 4 manual mobile testing (DevTools device emulation + CDP instrumentation), not during a dedicated mobile-testing effort.
- `context/changes/training-grid/research.md:107,129,747` — original design rationale for the `AuthLayout` `max-w-4xl` constraint the full-bleed break-out exists to cancel.
- `context/foundation/test-plan.md` §2–3 — the risk map and phased rollout this research grounds; Phase 1 here, Phases 2–4 already shipped (highlight correctness, data integrity, cross-account authorization), all integration/unit only — this is the first phase requiring a browser.

## Related Research

- `context/changes/testing-highlight-correctness-recalculation-wiring/research.md` — Phase 2's research (highlight/window recalculation), sibling rollout phase.
- `context/changes/testing-data-integrity-at-the-api-layer/` — Phase 3, established the `db.ts` seeding-helper pattern this research recommends reusing for e2e.
- `context/changes/testing-cross-account-authorization-gate/` — Phase 4, established the two-account/cleanup lifecycle pattern this research recommends mirroring in Playwright global-setup/teardown.

## Open Questions

- Was the `TickCell.tsx` tap-triggered zoom fix ever confirmed on a real device? The training-grid change's own writeup leaves this as an open item — worth checking `context/changes/training-grid/change.md` or its Progress section for a later resolution before assuming the fix is fully proven, and worth having the new e2e test's tap-interaction check serve as the missing confirmation.
- Which real mobile viewport dimensions to assert against (e.g. iPhone SE 375×667 vs a larger modern phone) — not yet decided; should be picked during planning based on Playwright's built-in device presets and whatever "real mobile viewport width" means for this team's field-use devices.
- Whether the e2e CI job should run on every PR (test-plan.md §5 says "required after §3 Phase 1") or be gated some other way given it needs local Supabase + a full app build/dev-server boot — worth deciding during planning rather than research.
