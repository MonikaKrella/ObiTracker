---
project: ObiTracker
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-09 # F-01, S-01, S-02 marked done (all merged to master, impl_reviewed)
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: ObiTracker

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Competitive dog obedience handlers need to know what to train _before_ they step onto the field — not after reviewing pages of notes. ObiTracker shows a training grid at a glance: custom elements in rows, dates in columns, green/red highlights surfacing the 3 most-trained and 3 least-trained rows within a rolling window the handler configures. The core bet: if one glance replaces a notebook, handlers adopt it immediately and stop reaching for Excel.

## North star

**S-04: Handler sees the highlighted grid and ticks a cell** — proves the core product hypothesis: one glance at the training grid tells the handler what to train next, making a notebook or spreadsheet unnecessary.

> The north star is the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works. For ObiTracker, the hypothesis is: a handler standing at a training field can identify what to drill in under 10 seconds by glancing at a colour-coded grid built from their own training history.

## At a glance

| ID   | Change ID         | Outcome (user can …)                                                                          | Prerequisites | PRD refs                                       | Status   |
| ---- | ----------------- | --------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- | -------- |
| F-01 | db-schema         | (foundation) custom tables live in Supabase with RLS; data layer ready for app writes         | —             | FR-002, FR-003, FR-004, FR-005, FR-006, FR-007 | done     |
| S-01 | auth-flow         | sign up and sign in with email + password; protected routes redirect unauthenticated users    | —             | FR-001                                         | done     |
| S-02 | dog-management    | add a dog and switch between dogs from any authenticated screen                               | F-01, S-01    | FR-002, FR-003                                 | done     |
| S-03 | training-elements | add, rename, and remove custom training elements for the selected dog                         | S-02          | FR-004                                         | proposed |
| S-04 | training-grid     | view the colour-coded training grid, tick any visible cell, and see the grid update instantly | S-03          | FR-005, FR-006, FR-007, US-01                  | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme            | Chain                             | Note                                                                              |
| ------ | ---------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| A      | Data + core loop | `F-01` → `S-02` → `S-03` → `S-04` | Critical path to the north star; invest in data schema and mobile frontend UX.    |
| B      | Auth             | `S-01`                            | Parallel with F-01; auth tables are in Supabase — no dependency on custom schema. |

## Baseline

What's already in place in the codebase as of 2026-05-27 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4; shadcn/ui partially adopted (`src/components/ui/button.tsx`); pages at `src/pages/dashboard.astro`, `src/pages/auth/signin.astro`.
- **Backend / API:** present — Astro SSR (`output: "server"`, `@astrojs/cloudflare`); auth API routes at `src/pages/api/auth/`; middleware at `src/middleware.ts`.
- **Data:** partial — `@supabase/supabase-js` client present; no custom migrations; only `auth.users` in use. Dogs, elements, and tick tables are absent.
- **Auth:** present — `@supabase/ssr`, cookie-based sessions (`src/lib/supabase.ts`); route-level middleware protecting `/dashboard` (`src/middleware.ts:20`); sign-in/sign-up API routes wired.
- **Deploy / infra:** present — `wrangler.jsonc` (Cloudflare Workers); GitHub Actions CI at `.github/workflows/ci.yml` (auto-deploy on merge to master).
- **Observability:** absent — no logging or error-tracking library; errors surface only via query-param redirects.

## Foundations

### F-01: Database schema

- **Outcome:** (foundation) `dogs`, `training_elements`, and `training_logs` tables are live in Supabase with row-level security policies; the Supabase JS client can read and write user-scoped rows without further schema changes.
- **Change ID:** db-schema
- **PRD refs:** FR-002, FR-003, FR-004, FR-005, FR-006, FR-007
- **Unlocks:** S-02 (dog management needs the `dogs` table), S-03 (elements need `training_elements`), S-04 (ticks need `training_logs`)
- **Prerequisites:** —
- **Parallel with:** S-01 (auth uses `auth.users` only — no dependency on custom tables)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** RLS policies must be correct from the start — a misconfigured policy that allows cross-account data reads is a trust-destroying bug; write one policy per operation per role (SELECT, INSERT, UPDATE, DELETE) as CLAUDE.md prescribes, not a single catch-all.
- **Status:** done

## Slices

### S-01: Auth flow

- **Outcome:** user can sign up with email + password, sign in, and sign out; unauthenticated requests to protected routes are redirected to the sign-in page.
- **Change ID:** auth-flow
- **PRD refs:** FR-001
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** — _(resolved 2026-05-27: `signup.astro` exists and `SignUpForm.tsx` POSTs to `/api/auth/signup`; full round-trip confirmed. Note: `confirm-email.astro` exists — Supabase email confirmation is part of the flow; verify post-signup redirect UX during planning.)_
- **Risk:** Auth routes and middleware are already scaffolded; this slice confirms the full round-trip (sign-up form → Supabase → session cookie → protected redirect) works on both phone and laptop. Risk is low, but an unverified end-to-end auth path has caused silent breakage at launch before.
- **Status:** done

### S-02: Dog management

- **Outcome:** user can add a dog with a name and switch between dogs from any authenticated screen; the selected dog persists across page loads.
- **Change ID:** dog-management
- **PRD refs:** FR-002, FR-003
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — _(resolved 2026-05-27: dog switcher is a header dropdown on all screen sizes)_
- **Risk:** The dog-switcher UX determines the information architecture for every screen that follows; choosing a pattern that doesn't scale to 3+ dogs will require a refactor before launch.
- **Implementation notes:**
  - _(F3, db-schema review)_ `NewDog` in `src/types.ts` currently omits `account_id` (`Pick<Dog, "name">`) even though `account_id` is `NOT NULL` in the schema. S-02 must resolve this before shipping any dog-insert code: either update the type to `Pick<Dog, "name" | "account_id">` (preferred — gives compile-time safety) or explicitly inject `account_id` from the session in the insert service and add a JSDoc note on `NewDog` explaining the injection pattern. Leaving it as-is produces a NOT NULL violation at runtime with no TypeScript warning.
- **Status:** done

### S-03: Training elements

- **Outcome:** user can add, rename, and remove custom training elements for the selected dog; changes are reflected immediately the next time the training grid is opened.
- **Change ID:** training-elements
- **PRD refs:** FR-004
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — _(resolved 2026-05-27: deleting an element hard-deletes all its tick history — no soft delete)_
- **Risk:** Deleting an element with training history is irreversible under hard delete; the element management screen may need a confirmation step, while the tick grid deliberately has none (single tap, FR-006).
- **Status:** proposed

### S-04: Training grid ← North star

- **Outcome:** user can view the training grid for the selected dog with a configurable window (7, 14, or 30 days), see green highlights on the 3 most-trained rows and red on the 3 least-trained (all tied rows highlighted at rank 1; ties at rank 2 or 3 not highlighted), tick or untick any visible cell with a single tap, and see the highlight recalculate immediately.
- **Change ID:** training-grid
- **PRD refs:** FR-005, FR-006, FR-007, US-01
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — _(all resolved 2026-05-27)_
  - _(resolved)_ Empty state when no ticks exist in the visible window: all rows unhighlighted — no green/red shown until at least one tick is recorded.
  - _(resolved)_ Highlight count scope: only ticks within the currently selected window (7, 14, or 30 days) are counted — switching the window immediately recalculates highlights.
  - _(resolved)_ US-01 "30-day grid" wording is a documentation gap; grid is configurable 7/14/30 days per FR-005.
- **Risk:** The highlight algorithm (top-3/bottom-3 with tie-expansion at rank 1 only) is the product's core differentiator; a subtle bug in the tie-breaking logic produces wrong highlights with no visible error. Requires a pure, unit-testable function and at least one edge-case scenario (all elements tied) exercised before launch.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID         | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                         |
| ---------- | ----------------- | ----------------------------------------------------------- | --------------------- | --------------------------------------------- |
| F-01       | db-schema         | Set up Supabase schema: dogs, elements, training_logs + RLS | done                  | Merged to master                              |
| S-01       | auth-flow         | Complete and verify email auth end-to-end                   | done                  | Merged to master                              |
| S-02       | dog-management    | Add dog + dog switcher                                      | done                  | Merged to master                              |
| S-03       | training-elements | Custom training elements CRUD                               | yes                   | Run `/10x-plan training-elements`             |
| S-04       | training-grid     | Training grid with green/red highlights and ticking         | no                    | Needs S-03 done first; this is the north star |

## Open Roadmap Questions

1. **US-01 acceptance criteria reference a fixed "30-day grid"** — FR-005 is authoritative (configurable 7/14/30-day window); the user story wording should be updated for consistency. Owner: user. Block: no slices — FR-005 drives implementation, not the user story wording.

## Parked

- **Competition results page** — Why parked: explicitly v2 per PRD §Non-Goals; contingent on MVP adoption.
- **Session notes or comments** — Why parked: PRD §Non-Goals; grid records presence only (tick/untick).
- **Push notifications / training reminders** — Why parked: PRD §Non-Goals; app is opened intentionally by the handler.
- **OAuth / social login** — Why parked: PRD §Non-Goals; email + password only for v1.
- **Sharing with coach or club** — Why parked: PRD §Non-Goals; training data is private to the handler's account.
- **Observability / error tracking** — Why parked: no MVP NFR mandates it; `wrangler.jsonc` has `observability: { enabled: true }` for basic Cloudflare request logging; structured error tracking (Sentry etc.) deferred to post-launch.

## Done

| ID   | Change ID         | Outcome                                                                                 | Merged     |
| ---- | ----------------- | --------------------------------------------------------------------------------------- | ---------- |
| F-01 | db-schema         | `dogs`, `training_elements`, `training_logs` live in Supabase with RLS                 | 2026-05-27 |
| S-01 | auth-flow         | Email + password sign-up/sign-in; protected routes redirect unauthenticated users       | 2026-05-27 |
| S-02 | dog-management    | Add a dog, switch between dogs from header dropdown; selection persists across reloads  | 2026-06-09 |
