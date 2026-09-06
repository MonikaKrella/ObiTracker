<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Password Reset Implementation Plan

- **Plan**: `context/changes/password-reset/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-05
- **Verdict**: REVISE (all findings triaged and fixed in-plan — see Decisions below)
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths verified (`src/pages/api/auth/confirm.ts`, `src/middleware.ts`, `src/components/auth/SignUpForm.tsx`, `src/pages/auth/confirm-email.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/lib/supabase.ts`) ✓, 4/4 symbols ✓ (`PROTECTED_ROUTES`, `UNAUTHENTICATED_ONLY_ROUTES`, `otpTypeSchema`, `astro:env/server` import chain), brief↔plan ✓

## Findings

### F1 — Planned unit tests will fail to import: astro:env/server is unresolvable under vitest.config.ts

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2, Phase 2 §3 (route Contracts) + both phases' Automated Verification
- **Detail**: The plan exported `forgotPasswordSchema`/`resetPasswordSchema` directly from the route files so unit tests could import the real schema. Those route files transitively import `astro:env/server` (via `@/lib/supabase`), a virtual module `vitest.config.ts` deliberately can't resolve (its own comment documents why: existing tested modules only use `import type` for `@/...` imports). A test importing the route file directly would fail at module load, before any test body runs — the plan's own "Unit tests pass: npm run test" criterion would not actually pass as specified.
- **Fix A ⭐ Recommended**: Move the two schemas into a new side-effect-free `src/lib/schemas/auth.ts`, imported by both route files and tests.
  - Strength: Zero test-infra changes; mirrors this codebase's existing pure-logic/side-effecting separation; respects `vitest.config.ts`'s own documented rationale.
  - Tradeoff: A third schema-placement pattern alongside inline `signUpSchema`/`signInSchema`.
  - Confidence: HIGH — grounded directly in `vitest.config.ts`'s comment and the actual import chain in `src/lib/supabase.ts`.
  - Blind spot: None significant.
- **Fix B**: Add Astro's Vite integration (`getViteConfig`) to `vitest.config.ts`.
  - Strength: Route files stay as originally planned.
  - Tradeoff: Changes test infrastructure for every test, reverses a documented decision in `vitest.config.ts`.
  - Confidence: MEDIUM.
  - Blind spot: Blast radius on existing tests' Node-environment assumptions unverified.
- **Decision**: FIXED (Fix A) — schemas extracted to `src/lib/schemas/auth.ts`; both route Contracts and both phases' unit-test descriptions and the Testing Strategy section updated in `plan.md`.

### F2 — Cross-device reset-link click throws a PKCE error the plan's new error message actively misdiagnoses

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details ("Timing & lifecycle"); Phase 2 §1
- **Detail**: Verified against installed `@supabase/ssr`/`@supabase/auth-js` source: the PKCE code verifier lives in a cookie on the device that calls `resetPasswordForEmail`, read back by `exchangeCodeForSession` from that same cookie jar. Opening the reset-link email on a different device/browser — plausible for exactly this feature — throws `AuthPKCECodeVerifierMissingError` (its own message: "This can happen if the auth flow was initiated in a different browser or device"). The plan's original recovery-specific error text ("Invalid or expired reset link") would misdiagnose this case — the link is fine, a new one would fail identically. The SDK's own doc comment recommends the `token_hash` flow (already implemented in `confirm.ts`) specifically for this.
- **Fix A ⭐ Recommended**: Configure the Supabase "Reset Password" email template to use `{{ .TokenHash }}`+`type=recovery` instead of the default PKCE link — `confirm.ts`'s existing `token_hash` branch already handles it.
  - Strength: Eliminates the failure mode at the root, using the SDK's own recommended SSR pattern.
  - Tradeoff: Another manual Supabase-dashboard step.
  - Confidence: HIGH on mechanics, MEDIUM on dashboard-UI specifics.
  - Blind spot: Dashboard email-template editing capability not independently verified this session.
- **Fix B**: Keep PKCE as-is, improve the recovery error message to name the actual likely cause.
  - Strength: Zero dashboard changes, ships with the rest of the plan.
  - Tradeoff: Doesn't fix the underlying failure for a handler without access to their original device.
  - Confidence: HIGH — trivial, low-risk copy change.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B) — `confirm.ts`'s recovery error message reworded in `plan.md` to cover the cross-device cause alongside genuine expiry/reuse, and the corresponding Phase 2 manual-verification bullet updated. Fix A (switch the reset email to `token_hash` flow) added as a tracked follow-up in `context/foundation/post-v2.md` (item 2), per user request — deferred because it requires a Supabase-dashboard change beyond this change's code-only scope.

### F3 — Key Discoveries overstates certainty on resetPasswordForEmail's anti-enumeration behavior

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries, bullet 5
- **Detail**: The plan claimed Supabase's non-erroring-for-unknown-emails behavior was "confirmed by Supabase Auth's documented anti-enumeration behavior." `signInWithPassword`/`signInWithOtp` do document non-distinguishing behavior explicitly; `resetPasswordForEmail`'s doc comment does not — unverifiable from the SDK alone. Doesn't threaten the design (the route's own error handling already enforces anti-enumeration regardless), but the wording overstated the evidence.
- **Fix**: Reword the bullet to note this is an assumption the route's own error handling covers, not a confirmed Supabase guarantee.
- **Decision**: FIXED — Key Discoveries bullet reworded in `plan.md`.
