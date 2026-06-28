# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-28

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (last 30 days, excluding `context/`, `supabase/migrations/`, build output).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A desktop-targeted CSS/layout change silently collapses the mobile grid (observed: rendered at ~10% of viewport width), making field use impossible | High | High | interview Q2 (real incident), Q3, Q4; PRD NFR "fully usable on phone"; hot-spot dir `src/pages/dogs/[id]/` (6 commits/30d), `src/components/training-grid/` (3 commits/30d) |
| 2 | The highlight calculation marks the wrong rows green/red (observed: ticking 1 of 8 elements highlighted 3 rows instead of 1), silently misleading the handler on what to train next | High | High | interview Q1, Q2 (real incident); PRD FR-007, Business Logic section; hot-spot dir `src/lib/` (highlight.ts, 3 commits/30d), `src/components/training-grid/` |
| 3 | Rapid or duplicate taps on a tick cell produce a lost write or a duplicated row instead of a clean toggle | High | Medium | PRD guardrail "no data loss" + FR-006 (single-tap, no confirmation); hot-spot dir `src/lib/services/` (4 commits/30d) |
| 4 | An authenticated handler can read or modify another account's dog/element/log data via a path-scoped resource ID | High | Medium | PRD Access Control section ("no sharing, no multi-user access"); roadmap F-01 RLS risk note; CLAUDE.md RLS-policy convention (abuse/IDOR lens) |
| 5 | A rolling-window (7/14/30-day) boundary day is included or excluded inconsistently, or a UTC offset shifts a tick out of its window | Medium | Medium | PRD Business Logic (rolling-window classification); roadmap S-04 resolved-unknowns note on window-scoped recalculation |
| 6 | Deleting one training element's cascade removes another element's or another dog's `training_logs` rows instead of only its own | Medium | Low-Medium | roadmap S-03 risk note ("irreversible hard delete"); hot-spot dir `src/lib/services/` (training-elements.ts, 4 commits/30d) |

Challenger findings: none of the six risks were dropped — each traces to a real incident (Q2), a PRD line, or a roadmap risk note. Risk #5 was reframed to boundary-day cases specifically (not "test the date logic" generically) to avoid generic-coverage padding.

**Abuse / security lens.** The product has email/password auth and per-account, per-resource data (dogs, elements, logs). Risk #4 is the mandatory abuse-scenario row: authorization/ownership, not just authentication.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | At a real mobile viewport width, the grid renders using the available width (not collapsed to a fraction of it) and stays scrollable/tappable, both on initial load and after a desktop-targeted CSS change | "No console error means no regression" — the observed incident was a pure CSS/layout failure with no error of any kind | Which CSS classes/Tailwind utilities control grid width on mobile; whether a rendered-width check or a DOM-structure check is required to catch a regression like this | e2e (Playwright) deterministic viewport/width check — the one case in this rollout where a browser-level check is justified | A DOM-snapshot test that only checks elements exist (would have passed during the actual incident); reaching for a vision-model layer when a deterministic width assertion is cheaper and sufficient |
| #2 | Across varying element counts (including the reported 8-element case), the rendered highlight set matches exactly the top-3/bottom-3-with-rank-1-tie-expansion rule | "`highlight.test.ts` already covers this" — it existed before the reported incident and may not exercise that exact count/tie combination | How/when the highlight calculation is invoked from the React island (every render? tick toggle? window change?); whether the bug traces to the calculation function or to the caller passing stale/wrong counts | unit (pure function, infra exists) + one integration/component test for tick-toggle-triggers-recalculation wiring | Oracle problem — asserting against the calculation's own current output instead of deriving expected rows independently from FR-007 and reproducing the exact 8-element scenario reported |
| #3 | Rapid/duplicate taps converge on the correct final ticked/unticked state; any write failure surfaces to the handler, never silently discarded | "200 response means saved" — must verify actual persisted row state, not just HTTP status; "double-tap can't happen on touch" — touch UIs are exactly where it happens | The toggle service's upsert/idempotency logic; whether the API or DB enforces one row per dog/element/day | integration (service/API layer, two rapid requests, assert final DB state) | Asserting on the API response shape alone without querying persisted state; over-mocking the DB layer so the real upsert/conflict path never executes |
| #4 | A request for another account's dog/element/log resource (valid session, wrong ownership) is denied for every dog-scoped API route | "RLS makes API-level checks redundant" — RLS and API-level authorization are independent layers; an app-level bug can leak data even with correct RLS | Which routes accept a path-scoped resource ID; where ownership is actually checked (RLS, service-layer filter, both, neither) | integration, two distinct authenticated accounts hitting the same routes | Testing only "no session = 401" and calling authorization "tested" — that is a different failure mode than "wrong account, valid session" |
| #5 | Switching 7/14/30-day windows recalculates grid columns and highlight ranking using only ticks within the newly selected window; a tick on the boundary day is included/excluded consistently; UTC handling doesn't shift it | "Testing during business hours won't surface a UTC offset bug" | How the window/date-range functions define inclusive/exclusive boundaries; whether dates are UTC-consistent end-to-end (DB column type, display, comparison) | unit, on the existing pure date functions (promote already-manually-verified checks to automated assertions) | Testing only the middle of the window — the bug class lives at the edges (first/last day, window-size change) |
| #6 | Deleting one element removes exactly that element and its own `training_logs` rows — never a sibling element's or another dog's | "FK `ON DELETE CASCADE` is automatically correct" — must verify the cascade is scoped by the right key (element, not dog or shared sort position) | The actual FK/cascade definition in the migration; whether the DELETE endpoint targets the element specifically | integration — create two elements with logs, delete one, assert the other's logs survive | Testing deletion in isolation (single element, no siblings) — would pass even if the cascade scope were wrong |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Mobile field-use regression guard | Prove the grid renders and works at real mobile viewports, and survives a future desktop-targeted CSS change | #1 | e2e (Playwright, new) — deterministic viewport/width checks | change opened | `context/changes/testing-mobile-field-use-regression-guard/` |
| 2 | Highlight correctness & recalculation wiring | Prove the green/red rule is correct across element counts/ties, and tick-toggle triggers correct recalculation | #2, #5 | unit (extend `highlight.test.ts`) + integration | complete | `context/changes/testing-highlight-correctness-recalculation-wiring/` |
| 3 | Data integrity at the API layer | Prove ticks persist correctly under rapid taps, and element deletion doesn't leak across elements/dogs | #3, #6 | integration (vitest, no browser) | complete | `context/changes/testing-data-integrity-at-the-api-layer/` |
| 4 | Cross-account authorization gate | Prove every dog-scoped API route denies cross-account access, not just unauthenticated access | #4 | integration, two seeded accounts | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 4.1.9 | configured; 4 test files in `src/lib/tests/` — `highlight.test.ts` (18 cases), `dates.test.ts` (11 cases), `training-grid.test.ts` (8 cases), `data-integrity.test.ts` (3 cases); 40 passing |
| API mocking | none yet | n/a | Phase 3/4 integration tests should hit a real test Supabase project or local Supabase, not mock the DB layer — research to confirm the approach |
| e2e | none yet — see Phase 1 | n/a | Playwright bootstrapped in Phase 1, scoped to mobile-viewport grid checks, not a general e2e suite |
| accessibility | none yet | n/a | not in scope — no risk row in §2 maps to it |
| (optional) AI-native | none — checked: 2026-06-22 | n/a | not used; Risk #1's failure mode is answered more cheaply by a deterministic viewport/width assertion than a vision-model layer |

**Stack grounding tools (current session):**
- Docs: Cloudflare docs MCP available — not queried this session, relevant for Workers/CI gates later; checked: 2026-06-22
- Search: Exa web search/fetch MCP available — not queried this session; checked: 2026-06-22
- Runtime/browser: no Playwright MCP available this session — not used; checked: 2026-06-22
- Provider/platform: Cloudflare MCP (docs/search/execute) available; no Supabase or GitHub MCP this session — not used; checked: 2026-06-22

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 2 | highlight, data-integrity, and authorization logic regressions |
| e2e on mobile viewport | CI on PR | required after §3 Phase 1 | mobile grid rendering/layout regressions |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: `src/lib/tests/<module>.test.ts`. Test files live in the `tests/` subdirectory of `src/lib/` — not colocated directly in `src/lib/`. Vitest's default glob (`**/*.test.ts`) picks them up automatically.
- **Naming**: `<module>.test.ts` matching the module under test.
- **Imports**: use relative imports from the tests directory — e.g. `import { fn } from "../module"`. Never use `@/` value imports in test files: the vitest config runs `environment: "node"` with no path-alias resolution, so `@/` runtime imports will fail. `import type` from `@/types` is safe (esbuild-stripped).
- **Reference tests**: `src/lib/tests/highlight.test.ts` (pure-function algorithm tests), `src/lib/tests/dates.test.ts` (boundary/consistency tests), `src/lib/tests/training-grid.test.ts` (helper + design-invariant tests).
- **Extracting private helpers**: if a function under test is private/unexported, extract it to a new `src/lib/<name>-helpers.ts` module (see `src/lib/training-grid-helpers.ts`) and import it back into the component. Do not export from the original file while keeping the definition there — move the definition entirely to avoid drift.
- **Run locally**: `npm run test`.

### 6.2 Adding an integration test

- **Location**: `src/lib/tests/<name>.test.ts` — same directory as unit tests; Vitest picks them up automatically.
- **Shared helpers**: `src/lib/tests/helpers/db.ts` exports `createAdminClient`, `createTestUser`, `seedDog`, `seedElement`. Import from there instead of duplicating setup logic.
- **Two-client pattern**: `createAdminClient()` (service-role) for seeding and count-verification; `createTestUser(admin).authClient` (user-scoped JWT) for service-function calls that must pass RLS.
- **Per-test teardown**: `createTestUser` returns a `cleanup()` that deletes the test user from `auth.users`, cascading through `dogs → training_elements → training_logs`. Call it in `afterEach`. Do not run `supabase db reset` between tests.
- **Env requirements**: local Supabase must be running (`npx supabase start`); `.env` must contain `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). `vitest.config.ts` loads all `.env` vars via `loadEnv` with an empty prefix.
- **Count-verification pattern**: `.select("*", { count: "exact", head: true }).eq(...)` — use `count` from the result, not row data.
- **Reference test**: `src/lib/tests/data-integrity.test.ts` (tick-toggle persistence, deletion-cascade scope).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 1 for the mobile field-use regression-guard pattern.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 3 (data integrity) and Phase 4 (cross-account authorization) for the integration-test pattern against dog-scoped routes.

### 6.5 Per-rollout-phase notes

#### Phase 3 — Data integrity at the API layer (shipped 2026-06-28)

Change: `context/changes/testing-data-integrity-at-the-api-layer/`

**What was built:**

- `src/lib/tests/helpers/db.ts` — shared integration-test helper: `createAdminClient` (service-role, bypasses RLS), `createTestUser` (two-client pattern: admin creates user, anon client signs in for JWT), `seedDog`, `seedElement`. Includes orphan-guard (try/catch deletes user if post-create steps fail), session null-check, and explicit env-var throws.
- `src/lib/tests/data-integrity.test.ts` — 3 integration tests calling service functions directly against local Supabase (no HTTP, no Astro dev server): happy-path sequential toggle (Risk #3 baseline), concurrent duplicate-toggle via `Promise.allSettled` (Risk #3), and element-deletion cascade isolation (Risk #6).
- `vitest.config.ts` — extended with `loadEnv(mode, process.cwd(), "")` so `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are available via `process.env` in integration tests.

**Key design decisions:**

- Service layer, not HTTP layer — tests call `toggleTrainingLog` and `deleteTrainingElement` directly; the Astro routing layer is not involved. The DB-integrity risks live in the service + DB path.
- `Promise.allSettled` (not `Promise.all`) for the concurrent-toggle test — makes service-thrown errors surface as readable assertion failures rather than unhandled rejections.
- Per-test teardown via `userCleanup()` — deleting the test user from `auth.users` cascades through `dogs → training_elements → training_logs`; no `supabase db reset` between tests.
- Local Supabase required; CI integration deferred (needs a GitHub Actions Supabase setup out of scope for this phase).

#### Phase 2 — Highlight correctness & recalculation wiring (shipped 2026-06-28)

Change: `context/changes/testing-highlight-correctness-recalculation-wiring/`

**What was built:**

- `src/lib/tests/highlight.test.ts` — extended from 12 → 18 cases covering all Tier 1/2/3 boundary and tie configurations, including the reported 8-element incident (Correction-5 guard) and five new Tier 3 edge cases (rank-1 tie expansion, rank-last tie expansion, rank-2/3 uniqueness guard, all-equal suppression, Tier 2 unique-winner happy-path)
- `src/lib/tests/dates.test.ts` — 11 cases for `getTrainingWindow`, `generateDateRange`, and `isFutureUtcDate`; covers 7/14/30-day windows, month-turn boundary arithmetic, and cross-function consistency (`generateDateRange` and `getTrainingWindow` agree on the window's oldest date)
- `src/lib/training-grid-helpers.ts` — pure-function extraction of `applyTick`, `buildTicksByElement`, and `buildTickCounts` from `TrainingGrid.tsx`; no behaviour change
- `src/lib/tests/training-grid.test.ts` — 8 cases for the three helpers plus a design-invariant test that asserts `buildTickCounts` uses `dateSet.size` (all 30-day ticks) not a display-window-filtered count, documenting the intentional window-agnostic highlight design

**Key design decisions:**

- `vitest.config.ts` stays `environment: "node"` — no JSDOM/RTL; pure-function layer only. All `@/` imports in tested modules and test files must be `import type` (esbuild-stripped before vitest sees them).
- Highlight ranking is window-agnostic by design: `tickCounts` is always computed over 30-day data regardless of the 7/14/30-day display window. The invariant test documents this explicitly.
- Private helpers extracted to `src/lib/training-grid-helpers.ts` and imported back into `TrainingGrid.tsx` — move-not-duplicate to prevent drift.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Auth/sign-up flow** — already shipped and stable; low priority to re-test now. Re-evaluate if the auth flow changes (new provider, password-reset flow, etc.). (Source: Phase 2 interview Q5.)
- **Blanket visual-snapshot tests across every page** — too brittle, catches noise rather than regressions. Phase 1's mobile check stays scoped to the training grid component, not a page-wide snapshot suite. Re-evaluate if a specific page (other than the grid) has its own reported visual-regression incident. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-22
- Stack versions last verified: 2026-06-28 (Vitest 4.1.9, 40 passing tests)
- AI-native tool references last verified: 2026-06-22

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
