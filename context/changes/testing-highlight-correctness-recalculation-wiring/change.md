---
change_id: testing-highlight-correctness-recalculation-wiring
title: Highlight correctness & recalculation wiring
status: implementing
created: 2026-06-23
updated: 2026-06-25
archived_at: null
---

## Notes

Phase 2 of the test-plan rollout (`context/foundation/test-plan.md` §3). Covers risks #2 and #5: the green/red highlight rule must be correct across element counts/ties (including the reported 8-element incident), and switching the rolling window (7/14/30-day) must trigger correct recalculation, including boundary-day handling. Test types: unit (extend `src/lib/highlight.test.ts`) + integration (tick-toggle-triggers-recalculation wiring).
