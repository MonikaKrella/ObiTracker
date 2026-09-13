<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dog Rename Implementation Plan

- **Plan**: context/changes/dog-rename/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan — both phases complete)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Unrelated roadmap.md status update bundled into Phase 1 commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; already disclosed and benign
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (commit 13e6963)
- **Detail**: Commit `13e6963` ("Backend — rename endpoint (p1)") bundles a documentation-only update to `context/foundation/roadmap.md` marking S-03 (default-competition-class) and S-05 (password-reset) as `done`, alongside unrelated commit-range/risk notes for those changes. This has nothing to do with dog-rename and isn't mentioned in the plan's file list. The commit message itself discloses it explicitly: "context/foundation/roadmap.md (unrelated status update, staged per user choice)" — so it was a deliberate, user-directed inclusion rather than accidental scope creep. No code paths, tests, or dog-rename behavior are affected.
- **Fix**: None needed — informational only, already disclosed in the commit message as an intentional bundle.
- **Decision**: PENDING

## Notes (non-findings, for awareness only — not in diff, not scored)

- Sub-agent 2 observed that `DeleteDogModal.tsx` (pre-existing, untouched by this change) has no 401-redirect handling, unlike both `RenameDogDialog.tsx` and `RenameElementDialog.tsx`. This is a pre-existing gap outside this diff's scope — not a finding against dog-rename, just a possible future follow-up.
- `renameDog` (src/lib/services/dogs.ts) relies on RLS scoping via `.eq("id", dogId).maybeSingle()` without a separate ownership pre-fetch, unlike the elements PATCH handler's `getDogById` pre-check. This matches the existing `setDefaultClassNumber` function in the same file (established local precedent) and is proven safe by the new cross-account test. No action needed.

## Verification results

- `npm run test`: 105/105 passed (9 test files)
- `npm run lint`: 0 errors, 3 pre-existing warnings (unrelated files: `forgot-password.ts`, `global-teardown.ts`)
- `npm run build`: succeeded, type-checking clean

## Plan drift detection (Agent 1)

All 5 changed files verified MATCH against plan intent — no DRIFT, MISSING, or EXTRA:

- `src/lib/services/dogs.ts` — `renameDog` matches `setDefaultClassNumber` shape exactly, doc comment notes no-uniqueness-check deviation.
- `src/pages/api/dog/[id]/index.ts` — `PATCH` mirrors sibling `DELETE`/elements handlers; `dogNameSchema` duplicated per convention, not imported.
- `tests/unit/cross-account-authorization.test.ts` — cross-account test added exactly as specified.
- `src/components/dogs/RenameDogDialog.tsx` — structurally mirrors `RenameElementDialog.tsx`; only deviation is the documented `reload()` vs `onRenamed` callback.
- `src/pages/dogs/[id]/dashboard.astro` — placeholder/island swap wiring mirrors `DeleteDogModal` pattern exactly; no swap-logic duplication in the `.astro` file.

## Safety, quality & pattern compliance (Agent 2)

No CRITICAL or WARNING findings. Confirmed: auth check precedes mutation, `id` validated via `z.uuid()`, zod-validated body, `prerender = false` present, uppercase named exports, `@/*` import alias used, if-braces convention followed, 401-redirect ordered before generic toast handling (matches project's hard rule), hydration handled via `useLayoutEffect` DOM-swap (correct per the documented placeholder-island exception, not `useMounted()`), `/dogs/[id]/dashboard` already covered by `PROTECTED_ROUTES` (no new page route added).
