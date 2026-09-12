# Default Competition Class — Plan Brief

> Full plan: `context/changes/default-competition-class/plan.md`

## What & Why

Implements FR-008: a handler can mark one competition class as their default per dog, so the competition-results page opens on that class automatically. This closes a gap the S-01 (competition-results-core) plan explicitly deferred ("the FR-008 'marked default' behavior is S-03, not built here"). It also changes the fallback used when no class is marked — Class 3 (the last class) instead of Class 1 — since dogs spend the longest time in the last class.

## Starting Point

`competition-results-core` (S-01) is shipped and archived — the competition-results page, class selector, and full scoring/averaging/highlighting loop all work today, but the class selector always falls back to Class 1 (`competition-results.astro:36-39`) when no `?classNumber=` is in the URL. There is no per-dog preference storage anywhere in the schema yet.

## Desired End State

A golden star icon next to the class selector renders filled solid when the currently viewed class is the dog's marked default, outlined (empty interior) otherwise; clicking it toggles the current class's default status, with tooltip/`aria-label` text tracking the state. The dropdown shows a "· Default" marker on whichever class is actually marked, regardless of which class is being viewed. Reloading the competition-results page with no `?classNumber=` opens on the marked default, or Class 3 if none is marked (changed from today's Class 1).

## Key Decisions Made

| Decision            | Choice                                                                                                                    | Why (1 sentence)                                                                                                                               | Source |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Data model          | Nullable `default_class_number` column on `dogs`, not a separate table                                                    | Single scalar preference per dog; no unnecessary abstraction, matches the existing `class_number` denormalization precedent                    | Plan   |
| UI affordance       | Golden star icon toggle (filled = default, outlined = not) next to the existing class `Select`, in place of a text button | Recognizable "favorite/default" idiom; more compact than a text button in the toolbar row                                                      | User   |
| Trigger             | Explicit click only, never automatic on class switch                                                                      | Avoids silently overwriting a deliberate default just from browsing another class                                                              | User   |
| Clear behavior      | Same star flips from filled back to outlined when clicked while viewing the current default — no separate clear control   | Simplest model: once set, marking always means "point at a (possibly different) class"; no motivated use case for a bare "no preference" state | User   |
| Dropdown visibility | Show a "· Default" badge on the marked class inside the dropdown, independent of the toggle's own label                   | Handler can see the current default at a glance even while viewing a different class                                                           | User   |
| API shape           | New dedicated `PATCH /api/dog/[id]/default-class` route                                                                   | Keeps this change's request shape independent of the not-yet-built dog-rename (S-06) slice's eventual PATCH body on `/api/dog/[id]`            | User   |
| Fallback default    | Class 3 (last class) instead of Class 1 when no default is marked — applies to every dog, existing and new                | Dogs spend the longest time in the last class, making it a more useful blind default than always Class 1                                       | User   |

## Scope

**In scope:** `dogs.default_class_number` column + CHECK constraint, `setDefaultClassNumber` service function, new PATCH API route, cross-account + CHECK-constraint test coverage, page-load fallback logic, star toggle, dropdown badge.

**Out of scope:** Any change to the class-_switch_ mechanism or averaging/highlighting logic; a dedicated mobile E2E spec (no new sticky-column or zoom-on-focus risk class is introduced); a dog-settings page; any "no default marked" indicator beyond the very first visit.

## Architecture / Approach

Three phases along the codebase's established schema → data-access → UI order: (1) one nullable column, no RLS/grant changes needed since `dogs`' existing `UPDATE` policy and `service_role` grant already cover it; (2) a service function mirroring `renameTrainingElement`'s proven update-and-return-or-null shape, plus a small dedicated API route reusing the working zod literal-union pattern already in `competitions/index.ts`; (3) rewiring the page's existing Class-1 fallback to check the dog's default first and fall back to Class 3 (not Class 1) when none is marked, plus the toggle/badge UI.

## Phases at a Glance

| Phase                                   | What it delivers                                                                 | Key risk                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Schema & Types                       | Nullable `default_class_number` column with CHECK constraint; `Dog` type updated | Low — additive column, no RLS/grant changes needed                                                                                                                                                         |
| 2. Service, API & Test Coverage         | `setDefaultClassNumber` service fn, new PATCH route, cross-account + CHECK tests | Low — directly mirrors an existing, proven service/route shape                                                                                                                                             |
| 3. UI — Default Toggle & Dropdown Badge | Fallback wiring, star toggle, dropdown badge                                     | Low — keep the dropdown badge in sync with the _actual_ default, not the viewed class; the Class 1 → Class 3 blind-fallback switch takes effect for every dog with no marked default as soon as this ships |

**Prerequisites:** None beyond S-01 (competition-results-core), already shipped and archived.
**Estimated effort:** ~1 session across the 3 phases — this is the smallest slice in the current roadmap batch.

## Open Risks & Assumptions

- Assumes no dog-rename (S-06) work has started yet on `/api/dog/[id]/index.ts` — if it has, the "dedicated endpoint" decision should be revisited to check for overlap.

## Success Criteria (Summary)

- Marking a class as default and reloading the page (no `?classNumber=`) opens on that class; clearing it reverts to Class 3 (the new blind default, not Class 1).
- The dropdown's "· Default" marker always tracks the actual default, independent of which class is currently being viewed.
- All existing competition-results functionality (scoring, averages, highlights, class switching, time window) behaves identically — this change touches only the initial-class-selection fallback (Class 1 → Class 3 when nothing is marked) and adds a preference toggle.
