# Post-MVP Notes (V2 Candidates)

Collected from `context/` during MVP wrap-up on 2026-08-19. Each item below was explicitly deferred or scoped out during MVP planning/implementation — not a new idea, a decision already made.

## Competition & Scoring

### Competition results page (scores, rankings, averages)

- **Deferred because:** Explicitly v2 in the PRD's Non-Goals, contingent on MVP adoption.
- **Source:** `context/foundation/prd.md` §Non-Goals ("No competition results page in v1 — score entry, averages, and strongest/weakest exercise highlights are explicitly v2, contingent on MVP adoption."); reaffirmed in `roadmap.md` §Parked, `shape-notes.md`, and re-excluded in `context/archive/2026-06-09-training-elements/plan.md` and `plan-brief.md`.
- **Notes:** The original two-page product concept (training grid + competition results) was scoped down to one page for the 3-week MVP timeline (`shape-notes.md`: "Scoped down from original two-page concept"). Vision text already frames competition results as "a second signal independent of training frequency," using the standard rulebook exercise list — distinct and unlinked from custom training elements. No schema, type, route, or component exists for this in code (confirmed in `context/domain/01-domain-distillation.md` Step 1).

## Sharing & Multi-user

### Sharing with a coach or club / multi-user access to a dog's data

- **Deferred because:** PRD Non-Goals — training data is private to the handler's account only.
- **Source:** `context/foundation/prd.md` §Non-Goals ("No sharing with a coach or club — training data is private to the handler's account; no export-to-coach, no shared views, no multi-user access to a dog's data."); `roadmap.md` §Parked.
- **Notes:** Access Control section reaffirms: "no sharing, no roles, no admin separation."

## Session Content

### Session notes or comments

- **Deferred because:** PRD Non-Goals — the grid deliberately records presence only.
- **Source:** `context/foundation/prd.md` §Non-Goals ("No session notes or comments — the grid records presence only (tick/untick). Quality, feedback, or context on how a session went are out of scope."); `roadmap.md` §Parked.
- **Notes:** This is a deliberate product-shape decision, not just an unbuilt feature — the domain distillation (`context/domain/01-domain-distillation.md`) confirms the `training_logs` schema has no notes/text column, and the tick/untick insert-or-delete model depends on presence-only semantics.

## Notifications

### Push notifications / training reminders

- **Deferred because:** PRD Non-Goals — the app is opened intentionally by the handler, no reminder mechanism.
- **Source:** `context/foundation/prd.md` §Non-Goals; `roadmap.md` §Parked.

## Authentication

### OAuth / social login (Google, GitHub, etc.)

- **Deferred because:** PRD Non-Goals — v1 is email + password only.
- **Source:** `context/foundation/prd.md` §Non-Goals ("No OAuth / social login in v1 ... Google, GitHub, and similar providers are explicitly deferred to a future version."); `roadmap.md` §Parked.

### Password reset / forgot-password flow

- **Deferred because:** Out of scope for the S-01 auth-flow slice.
- **Source:** `context/archive/2026-05-31-auth-flow/plan-brief.md` §Out of scope ("No password reset / forgot-password flow"); `context/archive/2026-05-31-auth-flow/plan.md` §What We're NOT Doing.
- **Notes:** No PRD line addresses this either way — it's a slice-level scope cut, not a Non-Goal, so it may simply have been missed rather than deliberately rejected. Worth explicit re-scoping for v2 given it's a real gap in an otherwise-complete auth flow.

### Resend-confirmation-email feature

- **Deferred because:** Out of scope for S-01.
- **Source:** `context/archive/2026-05-31-auth-flow/plan.md` §What We're NOT Doing ("No resend-confirmation-email feature (out of scope for S-01)").

## Dog Management

### Dog rename

- **Deferred because:** No FR requirement in S-02; out of scope for the dog-management slice.
- **Source:** `context/archive/2026-05-31-dog-management/plan.md` §What We're NOT Doing ("Dog rename — out of scope for this slice (no FR requirement in S-02)"); `context/archive/2026-05-31-dog-management/plan-brief.md` §Out of scope.
- **Notes:** Training elements already support rename (FR-004); dogs currently do not. This asymmetry is a real functionality gap, not a documented product decision — dogs can be added and soft-deleted but never renamed.

### Hard delete of dogs (cascade cleanup)

- **Deferred because:** Soft delete was chosen instead; hard delete/cascade cleanup of elements and logs explicitly excluded.
- **Source:** `context/archive/2026-05-31-dog-management/plan.md` §What We're NOT Doing ("Hard delete — soft delete only; training elements and logs remain in the DB (invisible through the app since their dog no longer appears)"); `plan-brief.md` §Out of scope.
- **Notes:** A soft-deleted dog's elements/logs remain in the DB indefinitely, merely hidden via RLS (`is_deleted = FALSE` filter). No purge/GC mechanism exists. Not flagged anywhere as a deliberate v2 decision, but is a natural consequence of the soft-delete-only design worth revisiting if data volume becomes a concern.

## Training Elements

### Bulk import/export of training elements

- **Deferred because:** Out of scope for the training-elements slice.
- **Source:** `context/archive/2026-06-09-training-elements/plan-brief.md` §Out of scope ("bulk import/export").

### Soft delete for training elements

- **Deferred because:** Deliberately rejected — hard delete is the intended behavior (resolved roadmap unknown).
- **Source:** `context/foundation/roadmap.md` S-03 ("Unknowns: — (resolved 2026-05-27: deleting an element hard-deletes all its tick history — no soft delete)"); `context/archive/2026-06-09-training-elements/plan.md` §What We're NOT Doing ("Soft delete for elements — hard delete is intentional").
- **Notes:** Unlike dogs (soft delete), elements are hard-deleted with cascading tick-history loss. This is a confirmed, deliberate asymmetry — not an oversight — but worth re-confirming for v2 if handlers request recoverable element history.

## Domain Model Gaps (surfaced by architecture review, Module 4)

### Highlight ranking is window-agnostic; PRD says it should be window-scoped

- **Deferred because:** Implemented as a deliberate engineering decision during S-04 (training-grid), but never written back into the PRD — an unresolved contradiction, not a formally ratified v2 deferral.
- **Source:** `context/domain/01-domain-distillation.md` Step 4, crossover #1; `context/domain/02-invariant-aggregate-refactor.md` Step 1 invariant #1; PRD Business Logic (`prd.md:104-108`) states the rule "consumes two user-facing inputs: the tick records ... and the selected window length," but `src/lib/training-grid-helpers.ts` computes highlight counts over the full fixed 30-day history regardless of the 7/14/30-day selector.
- **Notes:** Flagged as the #1 priority item in the domain distillation's refactor ranking: "reconcile `prd.md` FR-007/Business Logic with the actual Tier 1/2/3 + suppression algorithm, and explicitly resolve whether ranking should be window-scoped or window-agnostic." Not a "feature," but a spec/implementation divergence that needs a product decision before v2 planning builds on top of it.

### Highlight algorithm has grown a 3-tier system undocumented in the PRD

- **Deferred because:** Not formally deferred — organically evolved through five post-launch corrections, never folded back into `prd.md`.
- **Source:** `context/domain/01-domain-distillation.md` Step 3/4; `context/archive/2026-06-17-training-grid/research.md` (Corrections 1–5); `src/lib/highlight.ts`.
- **Notes:** PRD (FR-007) describes one flat top-3/bottom-3 rule with rank-1 tie-expansion. Code implements a 3-tier system (no highlight at n≤3, single-winner-only at 4–6, full top-3/bottom-3 at n≥7) plus a "≥50% coverage" suppression rule and a rank-2/3 tie-uniqueness guard. Same reconciliation need as above.

### `TrainingBoard` aggregate refactor (highlight classification as a guarded domain object)

- **Deferred because:** Proposed in a standalone refactor plan, not yet implemented — a design, not a shipped decision.
- **Source:** `context/domain/02-invariant-aggregate-refactor.md` (full plan; explicitly states "This is a plan only. No production code is modified by this document.").
- **Notes:** Diagnoses that the highlight classification — the PRD's literal Primary Success Criterion — is currently computed exclusively inside `TrainingGrid.tsx`'s `useMemo`, with no service/API/repository producing it independently, and an unchecked precondition (unknown-element ticks are silently dropped rather than failing fast). Proposes a `TrainingBoard` aggregate (`src/lib/domain/training-board.ts`) with a fail-fast `create()` factory, a `loadTrainingBoard()` repository, and a new `GET /api/dog/[id]/grid` endpoint so SSR, API, and client all share one gatekeeper. Relevant for v2 if any non-React consumer (mobile client, export, digest) is ever planned.

### Anti-corruption layer for Supabase `User` type in `App.Locals`

- **Deferred because:** Proposed refactor plan, not yet implemented.
- **Source:** `context/domain/03-anti-corruption-layer.md` (full plan; "This is a plan only. No production code is modified by this document.").
- **Notes:** `src/env.d.ts` types `context.locals.user` directly as `@supabase/supabase-js`'s `User` (~20 fields), even though only `.id` is ever read anywhere in the app. Plan proposes an `AuthenticatedAccount { id }` value object + `SessionPort` + `SupabaseSessionAdapter`, isolating the vendor type to one adapter file. Low-cost, high-leverage fix explicitly designed to require zero changes to the seven existing consumer files.

### `SupabaseClient` threaded through the service layer (Leak A) — explicitly deferred within its own plan

- **Deferred because:** Judged too costly relative to benefit for a solo 3-week MVP with no second-backend driver.
- **Source:** `context/domain/03-anti-corruption-layer.md` §Step 6 ("Explicitly deferred: Leak A ... Applying the same ACL pattern would mean designing a repository-style port per aggregate ... a substantially larger effort with no current driver ... Recommend revisiting only if a concrete second-backend or heavy-testing driver emerges.").
- **Notes:** All three service files (`dogs.ts`, `training-elements.ts`, `training-logs.ts`) take a raw `SupabaseClient` as their first parameter and call the concrete Postgrest builder directly. Revisit only if Supabase is ever at risk of being swapped, or if a heavier test-double strategy is needed.

## Security / Schema Hygiene Debt

### RPC `anon` EXECUTE grant not explicitly revoked on `soft_delete_dog` and `reorder_training_elements`

- **Deferred because:** Out of scope for the cross-account-authorization test phase; judged defense-in-depth only (RLS on the underlying tables makes an anon call a safe no-op).
- **Source:** `context/archive/2026-06-28-testing-cross-account-authorization-gate/research.md` §Open Questions ("RPC anon EXECUTE gap: `soft_delete_dog` and `reorder_training_elements` migrations do `REVOKE FROM PUBLIC` but not `REVOKE FROM anon` explicitly ... Not in Phase 4 scope; should be addressed in a dedicated migration if/when the RPCs are next touched."); the general rule is codified in `context/foundation/lessons.md` ("Explicitly revoke EXECUTE from `anon` on RPC functions meant for `authenticated` only"), which itself notes this gap was found on these exact two functions.
- **Notes:** Low risk today (RLS backstop intact), but flagged as unresolved schema hygiene. Worth a small migration whenever either RPC is next touched, v2 or otherwise.

### `Dog` name uniqueness enforced only at the application layer (racy check-then-insert), unlike `TrainingElement` names

- **Deferred because:** Not a formal deferral — an inconsistency surfaced by architecture review, not yet acted on.
- **Source:** `context/domain/01-domain-distillation.md` Step 3 and Step 5 (ranked #2 priority: "the fix (a `UNIQUE (account_id, lower(name)) WHERE is_deleted = false` index) is cheap relative to the inconsistency it removes").
- **Notes:** `isDogNameTaken()` is a check-then-insert race with no DB-level backstop, while `training_elements` has a real `UNIQUE (dog_id, name)` constraint. Low likelihood of triggering at current (solo, small-scale) usage, but cheap to fix.

### `training_logs` future-date guard is API-only, not DB-enforced

- **Deferred because:** Not a formal deferral — surfaced by architecture review as a narrow, low-risk gap.
- **Source:** `context/domain/01-domain-distillation.md` Step 3/Step 5 (ranked #3 priority); `context/domain/02-invariant-aggregate-refactor.md` Step 1 invariant #4.
- **Notes:** `isFutureUtcDate()` is enforced only in the Zod schema at the API boundary (`src/pages/api/dog/[id]/logs/index.ts`); no DB `CHECK (trained_on <= CURRENT_DATE)` constraint exists. Only reachable via a direct RPC call bypassing the API, which requires valid session credentials — low risk, but a documented gap.

## Testing Infrastructure

### CI integration for integration tests (data-integrity, cross-account-authorization suites)

- **Deferred because:** Needs a GitHub Actions Supabase setup judged out of scope for the phase that added these tests.
- **Source:** `context/archive/2026-06-28-testing-data-integrity-at-the-api-layer/plan.md` §What We're NOT Doing ("No CI integration for these tests — deferred; needs a GitHub Actions Supabase setup that is out of scope for Phase 3"); reaffirmed in `plan-brief.md` §Out of scope ("CI pipeline changes").
- **Notes:** These integration tests currently require a locally running Supabase instance (`npx supabase start`) and are not run in CI at all — only lint/typecheck and the advisory mobile e2e job run in CI per `test-plan.md` §5.

### Mobile e2e CI job is advisory, not a required/blocking status check

- **Deferred because:** Promoting it to required is a manual GitHub repo-settings action, explicitly left as a follow-up outside the plan's file changes.
- **Source:** `context/archive/2026-06-22-testing-mobile-field-use-regression-guard/plan.md` §What We're NOT Doing ("Not promoting the new CI job to a required/blocking status check — it lands advisory ... promoting it is a follow-up GitHub repo-settings action outside this plan's file changes."); `context/foundation/test-plan.md` §5 Quality Gates confirms this is still "advisory (not yet required)."

### WebKit/Firefox e2e coverage

- **Deferred because:** Deliberate scope tradeoff — Chromium (`devices['Pixel 5']`) only.
- **Source:** `context/archive/2026-06-22-testing-mobile-field-use-regression-guard/plan.md` §What We're NOT Doing; `plan-brief.md` §Out of scope.

### Structured error tracking / observability (e.g. Sentry)

- **Deferred because:** No MVP NFR mandates it; basic Cloudflare request logging via `wrangler.jsonc` was judged sufficient for now.
- **Source:** `context/foundation/roadmap.md` §Parked ("Observability / error tracking — Why parked: no MVP NFR mandates it; `wrangler.jsonc` has `observability: { enabled: true }` for basic Cloudflare request logging; structured error tracking (Sentry etc.) deferred to post-launch.").

## Open questions for V2 scoping

1. **Window-scoped vs. window-agnostic highlight ranking** — the PRD's Business Logic section says highlight ranking should depend on the selected 7/14/30-day window; the shipped implementation always ranks over a fixed 30-day history. This was never resolved as a ratified product decision (`context/domain/01-domain-distillation.md` Step 4, crossover #1) — v2 planning should explicitly decide which behavior is correct and update the PRD accordingly, since it will affect any competition-results or reporting feature built on top of tick history.
2. **US-01 "30-day grid" vs. FR-005's configurable 7/14/30-day window** — a documentation contradiction the PRD's own Open Questions section (`prd.md:122-124`) flagged and left unresolved with "Owner: user." Still unresolved as of MVP completion (`roadmap.md` §Open Roadmap Questions repeats the same open item).
3. **Should the highlight algorithm's 3-tier/suppression rules (never in the PRD) be formally specified before v2 builds anything that depends on "what counts as trained enough"** (e.g. competition-readiness signals)? Currently only `src/lib/highlight.ts`'s JSDoc and `research.md`'s Corrections 1–5 describe the real behavior.
