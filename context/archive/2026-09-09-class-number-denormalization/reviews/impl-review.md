<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Class Number Denormalization

- **Plan**: context/changes/class-number-denormalization/plan.md
- **Scope**: Phase 1 and Phase 2 (full plan, both complete)
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Verification performed

- `npx supabase db reset` — all 11 migrations (including the two rewritten ones and the deleted vestigial one) applied cleanly from a blank DB.
- `npx astro check` — 0 errors, 0 warnings.
- `npm run lint` — 0 errors (2 pre-existing unrelated warnings).
- `npm run test` — 101/101 tests pass against the live local DB.
- Repo-wide grep for `class_id`, `classId`, `competition_classes` in `src/` and `tests/` — zero hits. (`CompetitionClass` as a substring also returns zero hits against the _old_ interface; it now only matches the new, intentional `COMPETITION_CLASSES` const and `CompetitionClassNumber` type.)
- `supabase/migrations/20260903000002_add_class_number_to_competition_classes.sql` confirmed deleted.
- Live DB inspection: `exercises`/`competitions` schemas carry `class_number smallint NOT NULL CHECK (class_number IN (1,2,3))`; no `class_id`/`competition_classes` remain anywhere in the schema. All 29 seeded exercise rows spot-checked directly via `psql`.
- Two sub-agents cross-checked (a) every planned file against actual content for drift/missing/extra, and (b) security/performance/reliability/data-safety and pattern-compliance across all 18 changed files, including diffing pre-refactor service code to verify the claimed round-trip elimination.

## Findings

### F1 — Exercise name silently changed during "mechanical" migration rewrite

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260903000001_create_competition_reference_data.sql:57,68,81

- **Detail**: The plan's contract for this file explicitly required "preserving every existing name/shortcut/multiplier/sort_position value exactly" — the reseed was meant to be a pure structural rewrite (subquery-joined INSERT → literal-value INSERT), not a content change. In all three classes, the exercise historically named `'Square'` (shortcut `'Box'`, unchanged) was renamed to `'Sending to box'`:

  ```
  -    ('Square', 'Box', 4, 5),
  +  (1, 'Sending to box', 'Box', 4, 5),
  ```

  (same swap at Class 2 pos 5 and Class 3 pos 6). Confirmed via `git diff 8360880^..8360880` on this file and confirmed live in the reset DB — `'Sending to box'` is what's actually seeded today. This name doesn't appear anywhere in `research.md`, `plan-brief.md`, or the plan itself as an intended correction — it rode along silently inside a commit whose stated purpose was a pure `class_id`→`class_number` structural rename. Shortcut, multiplier, sort_position, and class assignment for this row are all correct; only the display `name` changed, and only for this one exercise.

- **Fix A**: Revert the name back to `'Square'` in all three classes, matching the plan's literal "preserve exactly" contract; if `'Sending to box'` is in fact the more correct name, raise it as its own separate, reviewed change to the rulebook data.
  - Strength: Restores the plan's stated guarantee exactly — this migration becomes provably content-neutral, which is what let it be reviewed as "just a rename."
  - Tradeoff: If `'Sending to box'` is actually the correct/intended exercise name (plausible — it reads as a fuller, more descriptive name than the terse `'Square'`), reverting reintroduces a less-accurate label into production data.
  - Confidence: MED — no source of truth in this repo confirms which name is correct; this is a domain-knowledge call only the user can make.
  - Blind spot: Whether `'Square'` or `'Sending to box'` is the name that matches the actual competition rulebook.

- **Fix B**: Keep `'Sending to box'` as-is, and add a one-line addendum to the plan/change notes documenting this as a deliberate data correction bundled into the rewrite.
  - Strength: Preserves the (possibly more accurate) name without a throwaway revert-then-refix cycle; makes the deviation traceable for anyone reading the plan later.
  - Tradeoff: Still an unreviewed change riding on an unrelated migration — this only fixes the paper trail, not the process gap.
  - Confidence: MED — same domain-knowledge gap as Fix A.
  - Blind spot: Same as Fix A.

- **Decision**: FIXED via Fix B — kept `'Sending to box'`, confirmed with the user as a deliberate data correction (not accidental), documented as an addendum in `context/changes/class-number-denormalization/change.md`.
