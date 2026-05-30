# Roadmap Suggestions

Implementation notes and resolved-unknown follow-ups to carry into `/10x-plan` sessions.

---

## S-01: Auth flow

**Context:** S-01 Unknown resolved 2026-05-27 — sign-up page and API route confirmed wired.

**Suggestions for `/10x-plan auth-flow`:**

- `confirm-email.astro` exists, meaning Supabase email confirmation is part of the sign-up flow. Verify that the post-signup redirect lands the handler on a clear "check your email" screen rather than dropping them on a broken or empty state. The confirmation link from Supabase should then redirect to `/dashboard` (or wherever the first authenticated screen is) once the email is confirmed.

---

## S-04: Training grid

**Context:** S-04 Unknowns resolved 2026-05-27.

**Suggestions for `/10x-plan training-grid`:**

- **Empty state:** when a dog has elements but zero ticks within the selected window, render all rows with no highlight (no green, no red). This applies both on first use and when a handler switches to a shorter window that contains no data.
- **Window-scoped counting:** the highlight algorithm counts only ticks whose date falls within the currently selected window (7, 14, or 30 days ending today inclusive). Switching the window selector must re-run the algorithm immediately — highlights are always a function of the visible date range, not all historical data.
- **Algorithm input/output contract:** `rankElements(ticks: Tick[], windowDays: number, today: Date) → { elementId, count, highlight: 'green' | 'red' | null }[]`. Keep it a pure function so edge cases (all elements tied, fewer than 3 elements, zero ticks) are unit-testable without a database.
- **Grid is configurable 7/14/30 days** (FR-005 authoritative; US-01 "30-day" wording is a doc gap, not a spec).

---

## S-03: Training elements

**Context:** S-03 Unknown resolved 2026-05-27 — deleting an element hard-deletes all its tick history.

**Suggestions for `/10x-plan training-elements`:**

- The delete endpoint must cascade-delete all `training_logs` rows for that element (either via a `CASCADE` foreign key constraint in the schema, or an explicit delete in the service layer before removing the element row).
- The element management screen should include a confirmation step before deletion — the action is irreversible and the tick history cannot be recovered. This is a deliberate exception to the "no confirmation dialog" rule that applies to the training grid (FR-006/US-01 acceptance criteria); the grid tick is low-stakes and easily reversed by unticking, whereas element deletion is permanent.
