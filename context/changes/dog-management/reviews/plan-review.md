<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Dog Management Implementation Plan

- **Plan**: context/changes/dog-management/plan.md
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE (borderline SOUND — both WARNINGs are LOW impact; all fixes are one-liners)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓, 3/3 symbols ✓, brief↔plan ✓

Paths verified: `supabase/migrations/20260530000001_create_dogs.sql`, `src/types.ts`, `src/middleware.ts`, `src/env.d.ts`, `src/components/Topbar.astro`, `src/pages/api/auth/signin.ts`, `src/pages/dashboard.astro`.

Symbols verified: `PROTECTED_ROUTES` (middleware.ts:4), `createClient` (middleware.ts:2), `Dog` interface (types.ts:9).

## Findings

### F1 — isDogNameTaken: case-insensitive query method not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Dog service contract for `isDogNameTaken`
- **Detail**: The service contract says "case-insensitive check for a live dog with the same name" but doesn't specify the Supabase client method. The natural reach-for is `.ilike('name', name)`, which is correct for typical dog names — but `.ilike()` maps directly to PostgreSQL ILIKE, where `%` and `_` in the input string are interpreted as SQL wildcards. A dog named "Rex" could be blocked by an existing dog named "Re_" (underscore matches any single character). Edge case for MVP, but the correct approach costs nothing to specify now.
- **Fix**: Update the `isDogNameTaken` contract to specify the query: use `.filter('name', 'ilike', escapedName)` where `escapedName = name.replace(/%/g, '\\%').replace(/_/g, '\\_')` — or note that for MVP the risk is accepted and the check uses plain `.ilike('name', name)`.
- **Decision**: FIXED — added ILIKE escaping contract to `isDogNameTaken` in Phase 1 dog service

### F2 — Middleware dog-route guard may not catch /api/dogs/* mutations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Middleware contract / Phase 1 API route contracts
- **Detail**: The plan adds `"/dogs"` to `PROTECTED_ROUTES`, which covers `/dogs/*` pages. However API routes live under `/api/dogs/*`, not `/dogs/*`. The plan correctly handles this — each API route performs its own `context.locals.user` null check. The gap: the plan doesn't call out anywhere that `/api/dogs/*` routes are intentionally NOT covered by `PROTECTED_ROUTES` and rely on in-route auth checks instead. An implementer adding a third API route in this slice might not realize they need to add the auth guard manually.
- **Fix**: Add one sentence to the middleware contract or API route section noting: "API routes under `/api/dogs/*` are not covered by `PROTECTED_ROUTES`; each route is responsible for its own 401/redirect guard (pattern: check `context.locals.user`, redirect or return 401 if null)."
- **Decision**: FIXED — added note to Phase 2 middleware contract clarifying `/api/dogs/*` is not covered by PROTECTED_ROUTES

### F3 — softDeleteDog returns void — 0-row update is silent

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `softDeleteDog` service + DELETE API route
- **Detail**: When `softDeleteDog(supabase, dogId)` is called for a dog the caller doesn't own (or that's already deleted), the RLS UPDATE policy correctly blocks / no-ops the query — but Supabase returns `{ data: [], error: null }`, not an error. The API route would return `{ success: true }` and the modal would redirect to `/dashboard` as if the delete worked. In practice this path is unreachable through the app (DeleteDogModal only renders for the user's own visible dogs). Acceptable for MVP; worth noting for future hardening.
- **Fix**: Add a row-count check in the service or API route: if `count === 0`, return a 404 JSON response instead of `{ success: true }`.
- **Decision**: FIXED — `softDeleteDog` contract updated to return `Promise<boolean>` with `{ count: 'exact' }`; DELETE API route updated to return 404 when `false` is returned

### F4 — Delete dialog "permanently removed" is technically inaccurate

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — `DeleteDogModal` dialog body
- **Detail**: The plan says the confirmation dialog warns "all training history will be permanently removed." Soft delete does not remove data from the DB — training elements and logs are orphaned but intact (plan-brief explicitly notes this). From the user's perspective the data is inaccessible and there is no undelete, so the phrasing is functionally honest. However, it could create tension with future GDPR right-to-erasure tooling.
- **Fix**: Rephrase to: "All training history will be hidden and cannot be recovered." Leaves the door open for future cleanup tooling without making a promise the DB doesn't keep.
- **Decision**: FIXED — dialog body updated to "Are you sure you want to delete [dog name]?" per user direction
