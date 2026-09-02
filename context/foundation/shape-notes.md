---
project: ObiTracker
context_type: brownfield
created: 2026-08-30
updated: 2026-09-02
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 6
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 19
  gray_areas_resolved:
    - topic: V2 scope bundling
      decision: "All five post-MVP items (password reset, competition results, dog rename, TrainingBoard refactor, element-to-exercise linking) are shaped as one V2 PRD, not split into separate rounds."
    - topic: highlight algorithm divergence
      decision: "Shipped 3-tier/window-agnostic highlight behavior is treated as the correct, preserved baseline for V2. The divergence from the original PRD's window-scoped rule is documented as-is, not reconciled in this round."
    - topic: competition-results windowing
      decision: "A single time-window selector (all-time / last year / last 6 months) governs the competition grid's visible columns, the average column, and the highlight ranking together, rather than the average always being all-time. Resolved during the FR-009/012/013 Socrates round."
  quality_check_status: accepted
---

## Current System

ObiTracker is an Astro 6 SSR web app (React 19 islands, Tailwind 4, shadcn/ui) deployed to Cloudflare Workers, using Supabase for auth and Postgres (RLS-enforced). The MVP shipped: email + password auth (no reset flow), multi-dog management (add, switch, soft-delete — no rename), custom training elements per dog (add, rename, hard-delete), and a training grid with a tick/untick presence-only log and a green/red highlight algorithm over a configurable 7/14/30-day rolling window.

Current users: solo competitive obedience handlers, small scale, each account private to a single handler — no sharing, no roles.

The highlight algorithm as shipped has grown beyond what the MVP PRD documents: it is a 3-tier system (no highlight at n≤3 elements, single-winner-only at 4–6, full top-3/bottom-3 at n≥7) with a ≥50% coverage suppression rule, and it ranks over a fixed 30-day history rather than the user-selected window. This divergence from the written PRD is being treated as the correct, adopted behavior for V2 purposes — it will be documented accurately rather than reopened.

## Vision & Problem Statement (V2 delta)

The MVP proved the core loop — log training, see what's under-trained — but real usage since launch has surfaced five gaps blocking the next stage of the product:

1. **No account recovery.** A handler who forgets their password has no way back into their account or their dog's training history.
2. **No second signal.** The MVP's own PRD always scoped competition results (scores, rankings, per-exercise averages, strongest/weakest highlighting) as v2, contingent on MVP adoption — that condition has now been met and this is the single biggest missing capability.
3. **Dog rename asymmetry.** Training elements can be renamed; dogs cannot. A handler who mis-typed or wants to update a dog's name has no path to fix it.
4. **Highlight logic has no owner.** The training grid's highlight classification — the product's core success criterion — is computed only inside a React component's `useMemo`, with no service, API, or repository backing it. Any future consumer (competition-readiness signals, exports) has nothing to call.
5. **Training elements and competition exercises are disconnected.** A handler's custom sub-drills (e.g. "normal pace heelwork") have no link to the standard rulebook exercise they support (e.g. "Heelwork" in Class 2), so a handler can't see which of their custom training maps to which competition category.

The insight for V2: the MVP intentionally kept training (custom, handler-specific) and competition (standardized, rulebook-defined) as two unlinked concerns to hit a 3-week timeline. V2 keeps both concerns' identities intact but adds an explicit, optional link between them, while also closing the account-recovery and dog-rename gaps that are basic CRUD completeness rather than new product ideas.

## User & Persona

Same primary persona as MVP: the after-hours competitive handler, training one or more dogs, comfortable with phone or laptop. V2 adds no new persona — the same handler who logs training now also wants to log competition scores and recover a forgotten password. No secondary persona (coach, club, admin) is introduced.

## Access Control

Current model preserved: email + password, single flat role per account, no sharing, no admin separation, a logged-out user cannot access any data. The only V2 addition is a password-reset flow (request a reset link, land on a reset page, set a new password twice, with a show/hide toggle defaulting to hidden — matching the existing signup password field's default). No new roles are introduced; no other access-control behavior changes.

## Success Criteria

### Primary

- A handler can, per dog, select a competition class, enter raw per-exercise scores across multiple competitions, see a live per-exercise average, and see the top-2/bottom-2 exercises highlighted — all five V2 items ship without regressing the MVP's training-grid highlight behavior.

### Secondary

- A handler adopts the competition-results page as their scorebook, replacing whatever spreadsheet or paper record they used for competition results before V2.

### Guardrails

- The training grid's green/red highlight behavior (the MVP's core success criterion) must not change as a side effect of the TrainingBoard refactor — same input, same output, before and after.
- Existing dog and training-element data (including hard-deleted-element history and soft-deleted dogs) must survive all V2 migrations with no data loss, including the new element-to-exercise FK link.
- Presence-only training logs (no notes/comments) and the single-user/no-sharing model are preserved unchanged.

**Timeline**: ~6 weeks of after-hours work across all five items (rough split: ~3 weeks competition results, ~1 week element-exercise linking, ~1 week TrainingBoard refactor, ~0.5 week each for password reset and dog rename).

## Timeline acknowledgment

Acknowledged on 2026-08-30: 6-week V2 bundle requires sustained dedication across multiple after-hours weeks; user accepted the cost explicitly rather than scoping down to a 3-week slice.

## Functional Requirements

### Authentication

- FR-001: Handler can request a password-reset link sent to their email when they forget their password; the link expires after a short, fixed window (e.g. 1 hour). Priority: must-have. Change: new
  > Socrates: Counter-argument considered: an unbounded-lifetime reset link is a security risk. Resolution: FR revised to mandate a short expiry window.
- FR-002: Handler can set a new password from the reset link by entering it twice to confirm, with a show/hide toggle defaulting to hidden. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: double-entry may be unnecessary friction since the handler already proved email ownership via the link. Resolution: kept as written — matches the existing signup flow's pattern.

### Dog management

- FR-003: Handler can rename an existing dog. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: no duplicate-name guard exists for dogs (unlike training elements' UNIQUE constraint). Resolution: kept as written — duplicate dog names within one account are cosmetic, not a data-integrity issue, since dogs are keyed by ID everywhere.
- FR-004: Handler can add, switch between, and soft-delete dogs (existing MVP behavior). Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: V2 touches dog management anyway (rename) — natural time to add hard-delete/cascade cleanup for soft-deleted dogs' accumulating data. Resolution: kept as written — hard-delete is a separate concern from rename and the current soft-delete model isn't causing real problems yet.

### Competition classes & exercises (reference data)

- FR-005: System provides three fixed competition classes (Class 1, Class 2, Class 3), each with its own fixed list of exercises and a per-exercise point multiplier, stored in the database as reference data — not user-editable, not user-specific. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: rulebook exercises could change over time, and non-user-editable reference data would then require a code/data change to update. Resolution: kept as written — rulebook revisions are rare and a manual DB migration is an acceptable cost; no in-app admin editing is needed for V2. Flagged as an open question for whether admin-editable class data is worth building later.
- FR-006: System stores a short "Shortcut" display name per exercise, used to keep narrow UI columns readable. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.

### Competition results page

- FR-007: Handler can select which class's results to view via a dropdown on the competition-results page, per dog. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.
- FR-008: Handler can mark one class as their default per dog; the default class's results display automatically on page load. If no default is marked, Class 1 displays. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.
- FR-009: Handler can view a competition-results grid per dog per class, filtered to the time window selected via FR-013 (all-time / last year / last 6 months): exercise name (col 1), multiplier (col 2), one column per competition within that window (headed by its date), and a trailing average column; the grid scrolls horizontally when more competition columns exist than fit on screen. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: years of competition history could produce more date columns than fit on screen, and the grid as originally written had no time filter. Resolution: FR revised — the grid is filtered by the same time-window selector introduced in FR-013, and scrolls horizontally when more columns exist than fit on screen.
- FR-010: Handler can enter a raw point value (0–10, in quarter-point increments, e.g. 5.5 or 7.25) per exercise per competition cell. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.
- FR-011: Handler can add up to 3 short tags (e.g. "qualifications", "championships") per competition via a dedicated "Tags" row at the bottom of the grid; long tags truncate in the cell and show full text on hover. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: a single tag per competition is too limiting — a competition could reasonably need more than one label (e.g. both "qualifications" and a location). Resolution: FR revised to allow up to 3 short tags per competition instead of 1.
- FR-012: System computes and displays, per exercise, the average of raw (non-multiplied) points across the handler's competitions within the same time window selected via FR-013. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: if the average column were always all-time while highlighting used a shorter window, the highlighted exercises could disagree with the displayed average, confusing the handler. Resolution: FR revised — the average column and the highlight computation (FR-014) now both use the single time window selected via FR-013, so they're always in agreement.
- FR-013: Handler can choose a single time window (all results in the class, last year, or last 6 months) that governs which competition columns display in the grid (FR-009), the average column (FR-012), and the highlight ranking (FR-014) — one selector drives all three. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written (revised in place to reflect its expanded scope after FR-009/FR-012's resolutions above).
- FR-014: System highlights the top-2 exercise averages green and the bottom-2 red within the selected window; no highlight if all averages are equal; ties at the highest or lowest average expand the highlighted set to include all tied exercises. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.

### Training-element-to-exercise linking

- FR-015: Handler can attach a training element to one exercise from any class; multiple elements can attach to the same exercise. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.
- FR-016: Handler can show or hide a linked-exercise indicator column on the training grid (collapsible, to save space on mobile); each exercise renders as a distinct, consistent color in this column so elements linked to the same exercise are visually grouped. Priority: must-have. Change: new
  > Socrates: No counter-argument raised; stands as written.

### Domain architecture

- FR-017: The training grid's highlight classification is computed by a dedicated domain service (a `TrainingBoard` aggregate with a fail-fast creation path and a backing API endpoint), not only inside the client-side React component, per `context/domain/02-invariant-aggregate-refactor.md`. Priority: must-have. Change: modified
  > Socrates: No counter-argument raised; stands as written.
- FR-018: The training grid's highlight algorithm (the shipped 3-tier, window-agnostic behavior) produces byte-identical results before and after the TrainingBoard refactor and before and after all other V2 changes. Priority: must-have. Change: preserved
  > Socrates: No counter-argument raised; stands as written.
- FR-019: Presence-only training logs (tick/untick, no notes or comments) and the single-user/no-sharing access model are unchanged by V2. Priority: must-have. Change: preserved
  > Socrates: No counter-argument raised; stands as written.

## User Stories

### US-01: Handler logs a competition and sees the highlight

- **Given** a logged-in handler with a dog and one prior competition result recorded in Class 2
- **When** they select Class 2 on the competition-results page, add a new competition column dated today, and enter raw scores for each exercise
- **Then** each exercise's average recalculates immediately (pure points, not multiplied), and the top-2/bottom-2 exercise averages are highlighted according to the handler's selected averaging window

#### Acceptance Criteria

- The class dropdown defaults to the handler's marked default class for that dog, or Class 1 if none is marked
- Score cells accept 0–10 in quarter-point increments (e.g. 5.5, 7.25)
- The average column recalculates immediately after any score entry, using only raw (unmultiplied) points
- Highlighting recalculates based on the handler's selected averaging window (all-time / last year / last 6 months)
- If all exercise averages are equal, no exercise is highlighted

## Business Logic

Given a handler's raw competition scores across competitions within a selected time window (all-time / last year / last 6 months), ObiTracker computes each exercise's average score and highlights the top-2 strongest and bottom-2 weakest exercises — a second, independent signal alongside the training grid's frequency-based highlight.

This is a new domain rule, additive to and independent of the preserved training-grid highlight rule (FR-018). The rule consumes two user-facing inputs: raw per-exercise competition scores (0–10, quarter-point increments) and the handler's selected time window. From these it produces a per-exercise average, then classifies the top-2 and bottom-2 averages as highlighted, with tie-expansion at either extreme and no highlight when all averages are equal. The handler sees this classification on the competition-results page for the selected dog and class, the moment they select a time window or update a score.

## Constraints & Preserved Behavior

- The training grid's green/red highlight rule (frequency-based, 3-tier, window-agnostic) must produce byte-identical output before and after all V2 changes, including the TrainingBoard refactor (FR-017, FR-018).
- Presence-only training logs (tick/untick, no notes/comments) and the single-user/no-sharing access model are unchanged (FR-019).
- Existing dog and training-element data — including hard-deleted-element history and soft-deleted dogs — must survive all V2 migrations with no data loss, including the new element-to-exercise FK link (FR-015).
- No external integrations, public APIs, or third-party data consumers exist today; V2 introduces none.
- Competition classes and their exercises/multipliers are fixed, non-user-editable reference data (FR-005) — updating them (e.g. a rulebook revision) is a manual DB migration, not an in-app admin capability, for V2.
- No new deployment window, CI/CD gate, or monitoring/alerting requirement is introduced — the existing pre-commit lint/format hooks and Cloudflare Workers deployment apply as-is.

## Non-Functional Requirements

- Same bar as the MVP training grid applies to the competition-results page: a visible loading indicator during any data fetch; smooth horizontal and vertical scroll with no perceptible lag once loaded.
- Full usability on both phone (field/venue use) and laptop (home review) for the competition-results grid — no feature degraded or hidden on either device, including the wider grid with per-competition columns and the horizontal scroll introduced in FR-009.
- A score, tag, or password-reset action entered by the handler persists and is never silently lost; any write failure is surfaced to the handler before they navigate away.
- The training grid's existing NFRs (loading indicator, smooth scroll, phone+laptop parity, no silent data loss) are preserved unchanged by V2.

## Non-Goals

- **No admin-editable competition classes/exercises** — rulebook classes, exercises, and multipliers stay fixed DB reference data (FR-005); no in-app admin UI to add, edit, or version them. A rulebook revision is a manual migration.
- **No search or filter UI for competition tags** — tags (FR-011) are free-text labels with truncate + hover tooltip only; no tag-based search, filter, or reporting is built in V2.
- **No coach/club sharing of competition results** — extends the MVP's no-sharing, single-user model to competition results; no export-to-coach, no shared views, no multi-user access.
- **No many-to-many element-to-exercise linking** — a training element links to exactly one exercise (FR-015); no support for one element mapping to multiple exercises.
- **No product-type or user-base expansion** — V2 stays within the existing web app, same solo-handler persona, same small scale as the MVP.
