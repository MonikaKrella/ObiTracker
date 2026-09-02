---
project: ObiTracker
version: 2
status: draft
created: 2026-09-02
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 6
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

**System purpose**: ObiTracker is a competitive dog obedience training tracker — it lets a handler log training presence per custom element and see, at a glance, what's under-trained.

**Key architecture**: Astro 6 SSR web app with React 19 islands, deployed to Cloudflare Workers.

**Tech stack**: Astro 6, React 19 islands, Tailwind 4, shadcn/ui, Supabase for auth, Postgres (RLS-enforced).

**Current user base**: Solo competitive obedience handlers, small scale; each account is private to a single handler — no sharing, no roles.

**Core functionality (shipped)**:

- Email + password auth (no reset flow)
- Multi-dog management: add, switch, soft-delete (no rename)
- Custom training elements per dog: add, rename, hard-delete
- Training grid: tick/untick presence-only log, with a green/red highlight algorithm over a configurable 7/14/30-day rolling window

The highlight algorithm as shipped has grown beyond what the original PRD documented: it is a 3-tier system (no highlight at n≤3 elements, single-winner-only at 4–6, full top-3/bottom-3 at n≥7) with a ≥50% coverage suppression rule, and it ranks over a fixed 30-day history rather than the user-selected window. This divergence from the original written PRD is treated as the correct, adopted behavior going forward — documented accurately here rather than reopened.

## Problem Statement & Motivation

The MVP proved the core loop — log training, see what's under-trained — but real usage since launch has surfaced five gaps blocking the next stage of the product:

1. **No account recovery.** A handler who forgets their password has no way back into their account or their dog's training history.
2. **No second signal.** The original PRD always scoped competition results (scores, rankings, per-exercise averages, strongest/weakest highlighting) as a later phase, contingent on MVP adoption — that condition has now been met, and this is the single biggest missing capability.
3. **Dog rename asymmetry.** Training elements can be renamed; dogs cannot. A handler who mis-typed or wants to update a dog's name has no path to fix it.
4. **Highlight logic has no owner.** The training grid's highlight classification — the product's core success criterion — is computed only inside the UI's local state, with no service or repository backing it. Any future consumer (competition-readiness signals, exports) has nothing to call.
5. **Training elements and competition exercises are disconnected.** A handler's custom sub-drills (e.g. "normal pace heelwork") have no link to the standard rulebook exercise they support (e.g. "Heelwork" in Class 2), so a handler can't see which of their custom training maps to which competition category.

The insight for this change: the MVP intentionally kept training (custom, handler-specific) and competition (standardized, rulebook-defined) as two unlinked concerns to hit a tight timeline. This change keeps both concerns' identities intact but adds an explicit, optional link between them, while also closing the account-recovery and dog-rename gaps — basic CRUD completeness rather than new product ideas.

## User & Persona

Same primary persona as the current system: the after-hours competitive handler, training one or more dogs, comfortable with phone or laptop. This change adds no new persona — the same handler who logs training now also wants to log competition scores and recover a forgotten password. No secondary persona (coach, club, admin) is introduced.

## Success Criteria

### Primary

- A handler can, per dog, select a competition class, enter raw per-exercise scores across multiple competitions, see a live per-exercise average, and see the top-2/bottom-2 exercises highlighted — all five items in this change ship without regressing the existing training grid's highlight behavior.

### Secondary

- A handler adopts the competition-results page as their scorebook, replacing whatever spreadsheet or paper record they used for competition results before this change.

### Guardrails

- The training grid's green/red highlight behavior (the product's core success criterion) must not change as a side effect of the highlight-service refactor — same input, same output, before and after.
- Existing dog and training-element data — including history left behind by permanently deleted training elements, and data belonging to dogs the handler has removed from their active list — must survive all changes in this release with no data loss, including the new element-to-exercise link.
- Presence-only training logs (no notes/comments) and the single-user/no-sharing model are preserved unchanged.
- The training grid's existing quality bar is preserved and extended to the new competition-results page: a handler sees visible acknowledgement of any in-progress data fetch, and both pages scroll smoothly (horizontal and vertical) with no perceptible lag once loaded.
- Both the training grid and the competition-results page remain fully usable on phone (field/venue use) and laptop (home review) — no feature degraded or hidden on either device.
- A score, tag, or password-reset action entered by the handler always persists; any write failure is surfaced to the handler before they navigate away — nothing is silently lost.

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

## Scope of Change

### Authentication

- [new] FR-001: Handler can request a password-reset link sent to their email when they forget their password; the link expires after a short, fixed window (e.g. 1 hour). Priority: must-have.
  > Socrates: Counter-argument considered: an unbounded-lifetime reset link is a security risk. Resolution: FR revised to mandate a short expiry window.
- [new] FR-002: Handler can set a new password from the reset link by entering it twice to confirm, with a show/hide toggle defaulting to hidden. Priority: must-have.
  > Socrates: Counter-argument considered: double-entry may be unnecessary friction since the handler already proved email ownership via the link. Resolution: kept as written — matches the existing signup flow's pattern.

### Dog management

- [new] FR-003: Handler can rename an existing dog. Priority: must-have.
  > Socrates: Counter-argument considered: no duplicate-name guard exists for dogs (unlike training elements' uniqueness constraint). Resolution: kept as written — duplicate dog names within one account are cosmetic, not a data-integrity issue, since dogs are keyed by ID everywhere.
- [preserved] FR-004: Handler can add, switch between, and soft-delete dogs (existing behavior). Priority: must-have.
  > Socrates: Counter-argument considered: this change touches dog management anyway (rename) — natural time to add a way to permanently erase accumulating data for dogs the handler has removed from their active list. Resolution: kept as written — permanent erasure is a separate concern from rename, and the current removal model isn't causing real problems yet.

### Competition classes & exercises (reference data)

- [new] FR-005: System provides three fixed competition classes (Class 1, Class 2, Class 3), each with its own fixed list of exercises and a per-exercise point multiplier, stored as reference data — not user-editable, not user-specific. Priority: must-have.
  > Socrates: Counter-argument considered: rulebook exercises could change over time, and non-user-editable reference data would then require a code/data change to update. Resolution: kept as written — rulebook revisions are rare and a manual data update is an acceptable cost; no in-app admin editing is needed for this change. Flagged as an open question for whether admin-editable class data is worth building later.
- [new] FR-006: System stores a short "Shortcut" display name per exercise, used to keep narrow UI columns readable. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.

### Competition results page

- [new] FR-007: Handler can select which class's results to view via a dropdown on the competition-results page, per dog. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [new] FR-008: Handler can mark one class as their default per dog; the default class's results display automatically on page load. If no default is marked, Class 1 displays. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [new] FR-009: Handler can view a competition-results grid per dog per class, filtered to the time window selected via FR-013 (all-time / last year / last 6 months): exercise name (col 1), multiplier (col 2), one column per competition within that window (headed by its date), and a trailing average column; the grid scrolls horizontally when more competition columns exist than fit on screen. Priority: must-have.
  > Socrates: Counter-argument considered: years of competition history could produce more date columns than fit on screen, and the grid as originally written had no time filter. Resolution: FR revised — the grid is filtered by the same time-window selector introduced in FR-013, and scrolls horizontally when more columns exist than fit on screen.
- [new] FR-010: Handler can enter a raw point value (0–10, in quarter-point increments, e.g. 5.5 or 7.25) per exercise per competition cell. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [new] FR-011: Handler can add up to 3 short tags (e.g. "qualifications", "championships") per competition via a dedicated "Tags" row at the bottom of the grid; long tags truncate in the cell and show full text on hover. Priority: must-have.
  > Socrates: Counter-argument considered: a single tag per competition is too limiting — a competition could reasonably need more than one label (e.g. both "qualifications" and a location). Resolution: FR revised to allow up to 3 short tags per competition instead of 1.
- [new] FR-012: System computes and displays, per exercise, the average of raw (non-multiplied) points across the handler's competitions within the same time window selected via FR-013. Priority: must-have.
  > Socrates: Counter-argument considered: if the average column were always all-time while highlighting used a shorter window, the highlighted exercises could disagree with the displayed average, confusing the handler. Resolution: FR revised — the average column and the highlight computation (FR-014) now both use the single time window selected via FR-013, so they're always in agreement.
- [new] FR-013: Handler can choose a single time window (all results in the class, last year, or last 6 months) that governs which competition columns display in the grid (FR-009), the average column (FR-012), and the highlight ranking (FR-014) — one selector drives all three. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [new] FR-014: System highlights the top-2 exercise averages green and the bottom-2 red within the selected window; no highlight if all averages are equal; ties at the highest or lowest average expand the highlighted set to include all tied exercises. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.

### Training-element-to-exercise linking

- [new] FR-015: Handler can attach a training element to one exercise from any class; multiple elements can attach to the same exercise. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [new] FR-016: Handler can show or hide a linked-exercise indicator column on the training grid (collapsible, to save space on mobile); each exercise renders as a distinct, consistent color in this column so elements linked to the same exercise are visually grouped. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.

### Domain architecture

- [modified] FR-017: The training grid's highlight classification is computed by a dedicated, reusable domain service (a `TrainingBoard` aggregate with a fail-fast creation path), rather than only by the UI's local computation — so other parts of the product (e.g. future competition-readiness signals, exports) can reuse the same classification without duplicating logic. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [preserved] FR-018: The training grid's highlight algorithm (the shipped 3-tier, window-agnostic behavior) produces byte-identical results before and after the highlight-service refactor and before and after all other changes in this release. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.
- [preserved] FR-019: Presence-only training logs (tick/untick, no notes or comments) and the single-user/no-sharing access model are unchanged. Priority: must-have.
  > Socrates: No counter-argument raised; stands as written.

## Constraints & Compatibility

- **Backward compatibility**: No external integrations, public APIs, or third-party data consumers exist today; this change introduces none.
- **Data continuity**: Existing dog and training-element data — including history left behind by permanently deleted training elements, and data belonging to dogs the handler has removed from their active list — must carry forward with no loss when this change ships, including the new element-to-exercise link (FR-015).
- **Preserved behavior**: The training grid's green/red highlight rule (frequency-based, 3-tier, window-agnostic) must produce byte-identical output before and after all changes in this release, including the highlight-service refactor (FR-017, FR-018). Presence-only training logs (tick/untick, no notes/comments) and the single-user/no-sharing access model are unchanged (FR-019).
- **Reference data maintenance**: Competition classes and their exercises/multipliers are fixed, non-user-editable reference data (FR-005) — updating them (e.g. a rulebook revision) is a manual, out-of-band content update, not an in-app admin capability, for this change.
- **Operational footprint**: No new deployment, release-process, or monitoring requirement is introduced by this change — existing processes continue to apply unchanged.

## Business Logic Changes

Given a handler's raw competition scores across competitions within a selected time window (all-time / last year / last 6 months), ObiTracker computes each exercise's average score and highlights the top-2 strongest and bottom-2 weakest exercises — a second, independent signal alongside the training grid's frequency-based highlight.

This is a new domain rule, additive to and independent of the preserved training-grid highlight rule (FR-018) — the current rule (frequency-based, computed from tick/untick presence over a rolling window) is unchanged; this adds a second, score-based rule alongside it. The new rule consumes two user-facing inputs: raw per-exercise competition scores (0–10, quarter-point increments) and the handler's selected time window. From these it produces a per-exercise average, then classifies the top-2 and bottom-2 averages as highlighted, with tie-expansion at either extreme and no highlight when all averages are equal. The handler sees this classification on the competition-results page for the selected dog and class, the moment they select a time window or update a score.

## Access Control Changes

Current model preserved: email + password, single flat role per account, no sharing, no admin separation, a logged-out user cannot access any data. The only addition in this change is a password-reset flow (request a reset link, land on a reset page, set a new password twice, with a show/hide toggle defaulting to hidden — matching the existing signup password field's default). No new roles are introduced; no other access-control behavior changes.

## Non-Goals

- **No admin-editable competition classes/exercises** — rulebook classes, exercises, and multipliers stay fixed reference data (FR-005); no in-app admin UI to add, edit, or version them. A rulebook revision is a manual, out-of-band update.
- **No search or filter UI for competition tags** — tags (FR-011) are free-text labels with truncate + hover tooltip only; no tag-based search, filter, or reporting is built in this change.
- **No coach/club sharing of competition results** — extends the existing no-sharing, single-user model to competition results; no export-to-coach, no shared views, no multi-user access.
- **No many-to-many element-to-exercise linking** — a training element links to exactly one exercise (FR-015); no support for one element mapping to multiple exercises.
- **No product-type or user-base expansion** — this change stays within the existing web app, same solo-handler persona, same small scale as before.

## Open Questions

1. **Is admin-editable competition class/exercise reference data (classes, exercises, multipliers) worth building later?** — Flagged during the FR-005 Socrates round; not blocking delivery of this change. Owner: user. By: no deadline set.
