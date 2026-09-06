---
change_id: competition-results-core
title: Competition results core
status: implementing
created: 2026-09-06
updated: 2026-09-06
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-06: Triaged all 5 findings from `reviews/plan-review.md`. F1 (AddCompetitionDialog 401 redirect) rejected — it's a non-deep-linkable modal, so falls through to generic toast error instead; codified as a new exception on the 401-redirect lesson in `context/foundation/lessons.md`. F2 (competitions DELETE policy) kept as-is per user call, documented as an accepted risk. F3 (leap-year window) resolved: Feb 29 clamps to Feb 28. F4 (dashboard nav path) and F5 (sticky z-index values) accepted as proposed. `plan.md`, `plan-brief.md`, and `reviews/plan-review.md` all updated.
