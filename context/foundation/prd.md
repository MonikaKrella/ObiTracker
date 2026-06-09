---
project: ObiTracker
version: 1
status: draft
created: 2026-05-23
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-01
  after_hours_only: true
---

# ObiTracker

## Vision & Problem Statement

Competitive obedience handlers training after hours have no fast way to log what they worked on or decide what to focus on next. After a session, writing notes takes too long to be sustainable; before a session, reviewing those notes takes too long to be useful. The current tool — a squared notebook or Excel used as a plain grid — captures nothing the handler can act on without re-reading everything.

The insight: other tools optimize for documentation. ObiTracker optimizes for the moment _before_ training — one glance tells the handler what to train next. The training grid uses the handler's own custom sub-drill breakdown (not a fixed list), so it fits how they actually train, not how the rulebook categorizes exercises. Competition results use the standard exercise list and surface the weakest scores directly, giving a second signal independent of training frequency.

## User & Persona

**Primary persona: The after-hours competitive handler**

A competitive dog obedience handler — at any level — training one or more dogs in their own time (evenings, weekends) alongside a day job. They enter obedience competitions and care about scores. They want to improve specific exercises but have no time for a detailed training journal. Comfortable with a phone or laptop but not spreadsheet features.

The moment they reach for ObiTracker: standing at the training field about to start a session, needing to know in ten seconds what to work on.

## Success Criteria

### Primary

- Handler opens the app, sees the training grid for their dog, and can identify what to train next in under 10 seconds — without reading any history or notes.

### Secondary

- Handler adopts ObiTracker as their default log and stops using notebook or Excel within the first two weeks of use.

### Guardrails

- No data loss — a tick entered must persist; losing training history destroys trust in the product.
- Full usability on both phone (field use) and laptop (review at home) — no degraded mobile experience.

## User Stories

### US-01: Handler checks the grid and decides what to train

- **Given** a logged-in handler with at least one dog and at least one training element configured
- **When** they open the training grid for their dog
- **Then** they see a loading indicator while data is fetched, and once loaded, a 30-day grid with green and red row highlights they can read at a glance and tick within seconds

#### Acceptance Criteria

- A visible spinner or progress indicator is shown while grid data is loading
- Once loaded, the grid scrolls smoothly in both directions (up-down and left-right) with no jank
- Green/red highlight is immediately visible without hovering or extra taps
- Ticking an element for today is a single tap/click — no confirmation dialog

## Functional Requirements

### Authentication

- FR-001: Handler can sign up and log in with email + password. Priority: must-have
  > Socrates: Counter-argument considered: local-only storage to skip auth complexity. Resolution: rejected — app is web-based and must persist data per account across phone and laptop. Auth is load-bearing.

### Dog management

- FR-002: Handler can add a dog with a name. Priority: must-have

  > Socrates: No counter-argument. Many handlers train more than one dog; single-dog MVP would exclude a real part of the persona from day one.

- FR-003: Handler can switch between dogs. Priority: must-have
  > Socrates: No counter-argument. Follows directly from FR-002; multi-dog support requires a selection mechanism.

### Training element setup

- FR-004: Handler can add, rename, and remove custom training elements for a dog. Priority: must-have
  > Socrates: No counter-argument. Custom elements are the product's core value — a fixed list does not fit how individual handlers train.

### Training grid

- FR-005: Handler can view a training grid for the selected dog — element names in the first column, one column per day, with a configurable window of 7, 14, or 30 days; grid scrolls horizontally on mobile. Priority: must-have

  > Socrates: Counter-argument considered: fixed 30 days is arbitrary and too wide for phone. Resolution: configurable window (7/14/30) added; horizontal scroll on mobile for wider windows.

- FR-006: Handler can tick or untick any visible cell in the training grid — current day or any past day within the visible window. Priority: must-have

  > Socrates: Counter-argument considered: handler may log the morning after training (wrong day), or enter a tick by mistake. Resolution: any visible cell is togglable; the tick records the day of the cell, not the day of entry.

- FR-007: Handler can see row highlights indicating training frequency — the 3 most-trained rows highlighted green, the 3 least-trained rows highlighted red; if multiple rows tie at the highest (or lowest) frequency, all tied rows are highlighted; ties at 2nd or 3rd rank are not highlighted. Priority: must-have
  > Socrates: Counter-argument considered: without a target frequency, relative "most/least" is meaningless. Resolution: user clarified the rule precisely — top 3 / bottom 3 by count, with tie-breaking logic for 1st-place ties only. Rule is deterministic without a per-element target.

## Non-Functional Requirements

- The handler sees a visible loading indicator during any data fetch; once data is available the grid scrolls smoothly horizontally and vertically with no perceptible lag.
- The app is fully usable on a phone (touch-first, field conditions) and on a laptop (pointer-based, home review) — no feature is degraded or hidden on either device.
- A tick entered by the handler persists and is never silently lost; any write failure is surfaced to the handler before they navigate away.

## Business Logic

Given the handler's training history across a configurable rolling window (7, 14, or 30 days), ObiTracker classifies each element as overtrained or undertrained and surfaces the top and bottom performers as row highlights.

The rule consumes two user-facing inputs: the tick records (which element was trained on which day, per dog) and the selected window length. From these it produces a ranked frequency count per element. The top 3 elements by tick count receive a green highlight; the bottom 3 receive a red highlight. Ties at the highest or lowest frequency expand the highlighted set (all tied rows are shown); ties at 2nd or 3rd rank do not expand it (tied rows remain unhighlighted). The handler sees this classification the moment they open the training grid — no manual action required.

## Access Control

Single-user, account-based. Each handler signs up with email + password. All data belongs to that account only — no sharing, no roles, no admin separation. A logged-out user cannot access any data.

## Non-Goals

- **No competition results page in v1** — score entry, averages, and strongest/weakest exercise highlights are explicitly v2, contingent on MVP adoption.
- **No sharing with a coach or club** — training data is private to the handler's account; no export-to-coach, no shared views, no multi-user access to a dog's data.
- **No session notes or comments** — the grid records presence only (tick/untick). Quality, feedback, or context on how a session went are out of scope.
- **No push notifications or training reminders** — the app is opened intentionally by the handler; no reminders to train or to log a session.
- **No OAuth / social login in v1** — authentication is email + password only; Google, GitHub, and similar providers are explicitly deferred to a future version.

## Open Questions

1. **US-01 references a 30-day grid but FR-005 established a configurable window (7, 14, or 30 days)** — the user story acceptance criteria should be updated to reflect that the grid length matches the handler's selected window, not a fixed 30 days. Owner: user. Block: no (FR-005 is authoritative; the user story is informational).
