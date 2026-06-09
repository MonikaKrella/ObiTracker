<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dog Management (S-02)

- **Plan**: context/changes/dog-management/plan.md
- **Scope**: All phases (1, 2, 3)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  3 observations  *(F1 fixed, F3 fixed, F6 fixed — F2 skipped, F4 skipped, F5 skipped — all triaged)*

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 — Lint failure: React Compiler errors in DeleteDogModal and DogSwitcher

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/components/dogs/DeleteDogModal.tsx:27, src/components/dogs/DogSwitcher.tsx:24
- **Detail**: eslint-plugin-react-compiler (added in this change's p3 commit with severity "error") flags `setMounted(true)` inside `useEffect` as "Calling setState synchronously within an effect can trigger cascading renders." This is the standard SSR/Radix hydration guard — intentional by design. But the React Compiler plugin considers it a violation because it causes an extra re-render on every mount. `npm run lint` exits non-zero. Plan checkboxes 1.2, 2.2, 3.2 were rubber-stamped. Note: 1,386 of the 1,388 lint errors are pre-existing project-wide CRLF errors on Windows (not introduced by this change); only the 2 React Compiler errors are new.
- **Fix A ⭐ Recommended**: Add `// eslint-disable-next-line react-compiler/react-compiler` before each `setMounted(true)` call with a one-line comment explaining the Radix hydration guard rationale.
  - Strength: Surgical — one line per component; preserves SSR rendering (user sees disabled placeholder before JS loads).
  - Tradeoff: Suppresses the rule at two sites; must be accompanied by a comment.
  - Confidence: HIGH — mounted pattern is well-established for Radix/SSR; rule is a false positive here.
  - Blind spot: None significant.
- **Fix B**: Change `client:load` to `client:only="react"` for both islands — eliminates SSR pass, no mounted guard needed.
  - Strength: No lint rule to suppress; cleaner component code.
  - Tradeoff: No SSR placeholder — flash of absence instead of disabled button on slow connections.
  - Confidence: MEDIUM — depends on whether SSR placeholder UX matters.
  - Blind spot: Haven't measured JS bundle load time in production.
- **Decision**: FIXED — `useLayoutEffect` + DOM swap already in place (no `setState` in effect, compiler rule does not fire); `useMounted` hook added at `src/components/hooks/useMounted.ts` as the canonical pattern for future JSX-level hydration guards

---

### F2 — Unplanned SECURITY DEFINER RPC for soft delete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline / Plan Adherence
- **Location**: src/lib/services/dogs.ts (softDeleteDog), supabase/migrations/20260531000002_soft_delete_dog_fn.sql
- **Detail**: Plan specified direct `.update({...}, { count: 'exact' })`. Actual implementation calls `supabase.rpc("soft_delete_dog", { p_dog_id: dogId })` — a SECURITY DEFINER function added in an unplanned migration. Reason: PostgREST validates updated rows against the SELECT RLS policy (WITH CHECK OPTION), so setting `is_deleted = TRUE` makes the row fail its own `is_deleted = FALSE` filter, raising "new row violates row-level security policy". The function is correctly secured (explicit ownership WHERE clause, REVOKE EXECUTE FROM PUBLIC, GRANT EXECUTE TO authenticated, uses `(SELECT auth.uid())`). Observable `Promise<boolean>` contract preserved.
- **Fix A ⭐ Recommended**: Document as a plan addendum and record the PostgREST WITH CHECK OPTION behaviour as a `/10x-lesson` for future soft-delete or status-change UPDATEs.
  - Strength: Preserves correct implementation; updates source of truth; prevents the same surprise on future slices.
  - Tradeoff: Plan becomes slightly wider than originally scoped.
  - Confidence: HIGH — this will recur for any UPDATE that moves a row outside the SELECT policy filter.
  - Blind spot: None significant.
- **Fix B**: Replace RPC with service-role client for this call.
  - Strength: No SECURITY DEFINER in the schema.
  - Tradeoff: Service role key must live in env vars and never be exposed; more secrets management overhead. RPC is the standard Supabase recommendation for this scenario.
  - Confidence: LOW — service role adds complexity; RPC is better here.
  - Blind spot: Service role key not currently in the codebase.
- **Decision**: SKIPPED — RPC implementation is correct and well-secured; scope deviation was a necessary workaround for PostgREST WITH CHECK OPTION behaviour, not negligence

---

### F3 — DELETE route accepts unvalidated string as dog ID

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/dog/[id]/index.ts:12
- **Detail**: `context.params.id` is passed directly to `softDeleteDog` without UUID format validation. A non-UUID string causes Postgres to throw "invalid input syntax for type uuid" → 500 response. The POST route already validates with zod; DELETE should match.
- **Fix**: Add `const parsed = z.string().uuid().safeParse(context.params.id); if (!parsed.success) return Response.json({ error: "Not found" }, { status: 404 });` before the service call. Import `z` from `"zod"`.
- **Decision**: FIXED — added zod UUID guard + `z` import

---

### F4 — PostgREST WITH CHECK OPTION pattern warrants a recurring lesson

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/dogs.ts
- **Detail**: PostgREST WITH CHECK OPTION causes any UPDATE that makes a row invisible to the SELECT RLS policy to fail — even without RETURNING. This will recur for any future soft-delete or status-change UPDATE when a column used in the UPDATE is also referenced in the SELECT policy filter.
- **Fix**: Record as `/10x-lesson`.
- **Decision**: SKIPPED — covered by the existing PostgREST lesson captured during this review cycle; no additional action needed

---

### F5 — isDogNameTaken doesn't escape backslashes in ilike pattern

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/dogs.ts:36
- **Detail**: Escaping covers `%` and `_` but not `\`. A dog name containing a backslash (e.g., `Rex\`) produces an incorrect ilike pattern, causing a false negative — no duplicate found — allowing duplicate names with `\` in them.
- **Fix**: Escape backslashes first: `name.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")`.
- **Decision**: SKIPPED

---

### F6 — FlashToast trusts sessionStorage content without runtime type guard

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/FlashToast.tsx:14
- **Detail**: The `{ type }` field is TypeScript-asserted but not checked at runtime. If sessionStorage.flash is written with an unexpected `type` value, `toast[type]()` either throws or calls an unintended method.
- **Fix**: Add `if (type !== "success" && type !== "error") return;` before calling `toast[type](message)`.
- **Decision**: FIXED — added runtime type guard before toast call
