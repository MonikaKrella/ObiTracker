<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Flow — Complete and Verify Email + Password Auth End-to-End

- **Plan**: context/changes/auth-flow/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-05-31
- **Verdict**: ~~REJECTED~~ → APPROVED after triage (fc4f551)
- **Findings**: 1 critical · 2 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (2 unplanned files — supabase/config.toml and wrangler.jsonc — both in-scope support changes) |
| Safety & Quality | PASS (after triage fixes) |
| Architecture | PASS |
| Pattern Consistency | PASS (after triage fixes) |
| Success Criteria | PASS |

## Findings

### F1 — confirm.ts passes raw `type` param to Supabase without validation

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/pages/api/auth/confirm.ts:6, 27
- **Detail**: `type` is read from `searchParams.get("type")` and passed directly to `supabase.auth.verifyOtp({ token_hash, type })` without any validation. Every sibling route (signin.ts, signup.ts) validates all user input with Zod before touching Supabase — CLAUDE.md explicitly requires this. While Supabase server-side rejects invalid `type` values (no direct exploitability today), this is the only API route that skips the validate-first discipline.
- **Fix**: Add a Zod enum guard on `type` before the verifyOtp branch: `z.enum(["signup","recovery","invite","email","magiclink","sms","phone_change","email_change"])`. On failure redirect to `/auth/signin?error=Invalid+confirmation+link`.
  - Strength: Matches the validate-first pattern in all sibling routes; closes the type-safety gap in one declaration.
  - Tradeoff: Need to keep the enum in sync if Supabase adds OTP types — unlikely and easy to spot.
  - Confidence: HIGH — identical discipline applied in signin.ts/signup.ts.
  - Blind spot: None significant.
- **Decision**: FIXED — fc4f551

### F2 — code + token_hash both present: token_hash silently ignored

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/confirm.ts:14
- **Detail**: A crafted URL with both `?code=X&token_hash=Y` triggers only the `if (code)` branch; `token_hash` is silently ignored. The two flows are mutually exclusive by design but the code does not enforce it.
- **Fix**: Add an early guard before the supabase null-check: `if (code && token_hash) return context.redirect("/auth/signin?error=Invalid+confirmation+link")`.
- **Decision**: FIXED — fc4f551

### F3 — localhost vs 127.0.0.1 mismatch in supabase/config.toml

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/config.toml:154–156
- **Detail**: `site_url = "http://127.0.0.1:4321"` but `additional_redirect_urls = ["http://localhost:4321/api/auth/confirm"]`. Supabase does exact-string matching. `signup.ts` derives `emailRedirectTo` from the request origin, so accessing via 127.0.0.1 produces a redirect URL Supabase will block. Testing passed via localhost, but the mismatch silently breaks for 127.0.0.1 access.
- **Fix**: Add `"http://127.0.0.1:4321/api/auth/confirm"` to `additional_redirect_urls` alongside the localhost entry.
- **Decision**: FIXED — fc4f551

### F4 — confirm.ts uses hardcoded "+" instead of encodeURIComponent

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/confirm.ts:12
- **Detail**: `redirect("/auth/signin?error=Configuration+error")` hardcodes "+" as a space. All sibling routes use `encodeURIComponent()`. Safe today but diverges from the established pattern.
- **Fix**: Replace with `encodeURIComponent("Configuration error")`.
- **Decision**: FIXED — fc4f551

### F5 — middleware startsWith can over-match future route names

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:19, 26
- **Detail**: `"/dashboard"` matches `"/dashboard-public"`, `"/dashboardstats"` etc. Pre-existing pattern, not introduced by this change, but cheap to fix while the route list is still small.
- **Fix**: Use `pathname === route || pathname.startsWith(route + "/")`.
- **Decision**: FIXED — fc4f551

### F6 — confirm.ts is the only API route with no Zod import

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/confirm.ts (imports)
- **Detail**: Root cause of F1. Called out separately as a structural gap: the file doesn't import or use Zod at all, unlike all siblings. Resolved by fixing F1.
- **Fix**: Resolved by F1 fix.
- **Decision**: FIXED — fc4f551 (via F1)

### F7 — No .dev.vars.example or wrangler comment for SUPABASE_URL/KEY

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (developer experience)
- **Location**: wrangler.jsonc
- **Detail**: A developer picking this up fresh has no obvious path to the required env vars. The null-guard in createClient() produces a silent failure rather than a clear error.
- **Fix**: Add a `.dev.vars.example` file (gitignored real `.dev.vars`) or a comment in wrangler.jsonc pointing to `.dev.vars`.
- **Decision**: SKIPPED — deferred by user
