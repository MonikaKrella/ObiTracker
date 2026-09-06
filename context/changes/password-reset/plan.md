# Password Reset Implementation Plan

## Overview

Add a password-reset flow so a handler who forgets their password can request a reset link by email, click it, and set a new password. This closes FR-001 and FR-002 from `context/foundation/prd-v2.md` (roadmap slice S-05, `context/foundation/roadmap.md`), the only gap in an otherwise-complete email + password auth scaffold (signup, signin, signout, and an email-confirmation callback already exist and work).

## Current State Analysis

The auth scaffold (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/api/auth/{signin,signup,signout,confirm}.ts`) is complete for signup → email confirmation → signin → protected routes → signout, per the archived `context/archive/2026-05-31-auth-flow/` change. Nothing in the codebase touches password reset — `grep` for reset-related routes returns nothing (confirmed in `context/foundation/roadmap.md`'s Baseline section).

Two things make this a smaller lift than a from-scratch auth feature would be:

- **Reusable form primitives already exist**: `FormField`, `PasswordToggle`, `SubmitButton`, `ServerError` (`src/components/auth/`) — `SignUpForm.tsx` already implements the exact "two password fields, each with an independent hide/show toggle, hidden by default" pattern FR-002 asks for.
- **`src/pages/api/auth/confirm.ts` already anticipates recovery links**: its `otpTypeSchema` allowlist already includes `"recovery"` as a valid OTP type, even though nothing generates a recovery link today. The route currently redirects every successful verification (signup confirmation or otherwise) straight to `/dashboard` — this plan gives recovery links a different destination.

## Desired End State

A handler on `/auth/signin` can click "Forgot password?", land on `/auth/forgot-password`, submit their email, and land on `/auth/reset-link-sent` (a "check your email" page, mirroring `confirm-email.astro`) regardless of whether that email has an account. Clicking the emailed link exchanges the token via the existing `/api/auth/confirm` route, which now recognizes the link as a recovery link and redirects to `/auth/reset-password` instead of `/dashboard`. There the handler enters a new password twice (hidden by default, independently toggleable) and submits; on success they land signed-in on `/dashboard` with the new password active. An expired or already-used link redirects to `/auth/signin` with a specific, actionable error message.

**Verification**: manually run the full loop against a real (or local Supabase dev) email inbox per each phase's Manual Verification steps; `npm run test`, `npm run lint`, `npm run build` all pass.

### Key Discoveries:

- `src/pages/api/auth/confirm.ts:17-58` already handles both Supabase token-exchange shapes (PKCE `code` and OTP `token_hash`+`type`) — the reset flow rides the same route, no new callback needed.
- `src/middleware.ts:5-6` — `PROTECTED_ROUTES` and `UNAUTHENTICATED_ONLY_ROUTES` are the two lists that gate page access; `context/foundation/lessons.md` ("Always register authenticated page routes in PROTECTED_ROUTES") applies directly to the new `/auth/reset-password` page.
- `src/pages/auth/confirm-email.astro` is the precedent for a "check your email, here's what to do next" page — `/auth/reset-link-sent` follows the same shape.
- `src/components/auth/SignUpForm.tsx:81-125` is the precedent for the exact two-password-field UI FR-002 needs.
- Whether `resetPasswordForEmail` itself distinguishes an unknown email server-side is unverified — its SDK doc comment says nothing on this, unlike `signInWithPassword`/`signInWithOtp`, which explicitly document non-distinguishing behavior. This doesn't matter for the "always show the same generic success message" decision: the new route's own handling (treat any non-rate-limit error as success) enforces anti-enumeration regardless of what Supabase does server-side.
- API routes under `/api/auth/` are **not** covered by `middleware.ts`'s `PROTECTED_ROUTES` matching (it only matches page paths, e.g. `/dashboard`, `/dogs`) — `POST /api/auth/reset-password.ts` must check `context.locals.user` itself.

## What We're NOT Doing

- No new Supabase migration or table — reset tokens are handled entirely by Supabase Auth.
- No admin/manual override of the reset-link expiry window in code — it's a Supabase project (dashboard) setting, verified manually, not a per-call option (`resetPasswordForEmail` exposes no expiry parameter).
- No check that the new password differs from the old one — matches FR-002's Socrates resolution ("kept as written — matches existing signup flow's pattern").
- No Playwright E2E coverage for the email round-trip — no prior art in `tests/e2e/` for fabricating a Supabase recovery session, and the archived auth-flow change verified its structurally identical email-confirmation flow manually, not via E2E.
- No OAuth/social recovery — out of scope per the PRD's "No OAuth / social login in v1" non-goal.

## Implementation Approach

Ride the existing `confirm.ts` callback rather than building a parallel one: extend it with a routing fork keyed off a marker we control (`flow=recovery` on the `redirectTo` URL we pass to `resetPasswordForEmail`), since Supabase's default PKCE flow doesn't otherwise expose which action (signup vs. recovery) produced the code. Everything else — forms, validation, middleware route registration — follows the exact conventions the signup/signin flow already established.

## Critical Implementation Details

### Timing & lifecycle: `confirm.ts` must branch on a marker _we_ add, not on Supabase's `type` param

Supabase's `type` query param (used today by the OTP `token_hash` branch) is only present for the non-PKCE OTP flow. `@supabase/ssr`'s default PKCE flow (the `code`-only branch `confirm.ts` already prefers) does not surface which Supabase Auth action produced the code. Since `forgot-password.ts` controls the `redirectTo` value passed to `resetPasswordForEmail`, set it to `${origin}/api/auth/confirm?flow=recovery` — Supabase appends its own `code=` (or `token_hash=`/`type=`) after this, preserving `flow=recovery`. `confirm.ts` reads `context.url.searchParams.get("flow")` once, independently of which of the two existing branches (`code` or `token_hash`) fires, and redirects to `/auth/reset-password` when it equals `"recovery"`, `/dashboard` otherwise. Signup's `emailRedirectTo` stays unchanged (`${origin}/api/auth/confirm`, no `flow` param), so existing behavior is untouched by omission, not by branching on absence.

Because this flow rides Supabase's default PKCE `code` exchange, opening the reset-link email on a different device/browser than the one that requested it fails with `AuthPKCECodeVerifierMissingError` (the code verifier cookie isn't present) — indistinguishable, from this route's perspective, from a genuinely expired or reused link. The recovery-specific error message (below) is worded to cover both causes rather than asserting the link itself is invalid. A cross-device-safe fix (switching the reset email to Supabase's `token_hash`+`type` flow, which `confirm.ts` already implements) is tracked in `context/foundation/post-v2.md` as a deferred follow-up, not part of this change.

### Debug & observability: verify the redirect-URL allowlist manually, don't assume

Supabase's Auth "Redirect URLs" allowlist already permits `${origin}/api/auth/confirm` (used by signup today). Whether appending `?flow=recovery` to that same path still matches the allowlist entry depends on the project's matching mode (exact vs. prefix/wildcard) and isn't verifiable from the codebase alone. Treat this as a manual verification step in Phase 1 before relying on the production flow — if the reset link redirect fails with a Supabase "requested path is invalid" error, the allowlist entry needs a wildcard (e.g. `${origin}/api/auth/confirm*`), matching how the archived auth-flow change treated its own Redirect URL allowlist update as an out-of-band manual step.

---

## Phase 1: Request password-reset link (FR-001)

### Overview

A handler who forgot their password reaches a "forgot password" form from the sign-in page, submits their email, and always sees the same "check your email" confirmation — whether or not that email has an account — with a resend option that's disabled for 60 seconds after landing on the confirmation page.

### Changes Required:

#### 1. Request form page and component

**File**: `src/pages/auth/forgot-password.astro`

**Intent**: New page mirroring `signin.astro`'s shell (same `Layout`, same card styling, same `serverError` query-param passthrough) hosting the email-only request form, with a link back to `/auth/signin`.

**Contract**: Renders `<ForgotPasswordForm client:load serverError={error} />` inside the existing `.bg-cosmic` card shell. No new layout variant needed.

**File**: `src/components/auth/ForgotPasswordForm.tsx`

**Intent**: Client-side email form matching `SignUpForm.tsx`'s structure (client-side required/format validation before submit, mirrored server-side by zod) — single `FormField` for email, `ServerError`, `SubmitButton`.

**Contract**: `<form method="POST" action="/api/auth/forgot-password">`, one `FormField` (`id="email"`, `type="email"`, `Mail` icon), submits via native form POST (matches `SignUpForm`/`SignInForm` — no `fetch`, no `preventDefault` except on client-validation failure).

#### 2. Shared auth zod schemas

**File**: `src/lib/schemas/auth.ts`

**Intent**: Home for the new request/reset zod schemas, kept free of any side-effecting import (no `@/lib/supabase`, no Astro-specific modules) so unit tests can import the real schema directly without pulling in `astro:env/server` — a virtual module `vitest.config.ts` deliberately does not resolve (per its own comment: existing tested modules only ever use `import type` for `@/...` imports). This is a new, narrower pattern than `signUpSchema`/`signInSchema`, which stay module-private inline in their route files — those aren't imported by any test today, so the constraint never applied to them.

**Contract**: `export const forgotPasswordSchema = z.object({ email: z.email(...) })` (added in this phase; `resetPasswordSchema` is added to the same file in Phase 2). Only `zod` is imported.

#### 3. Request API route

**File**: `src/pages/api/auth/forgot-password.ts`

**Intent**: Validate the submitted email, call `supabase.auth.resetPasswordForEmail`, and redirect to the confirmation page — always with the same success outcome regardless of whether the email is registered, per the anti-enumeration decision.

**Contract**: `export const POST: APIRoute`. Validates against `forgotPasswordSchema` imported from `src/lib/schemas/auth.ts`. On zod failure or missing Supabase client, redirect to `/auth/forgot-password?error=...` exactly like `signup.ts` does today. Call `resetPasswordForEmail(email, { redirectTo: `${origin}/api/auth/confirm?flow=recovery` })`. On success **or** on any error that is not a rate-limit error (check `error.code`/`error.status` for Supabase's rate-limit signal), redirect to `/auth/reset-link-sent` — do not surface arbitrary Supabase error text here, since `resetPasswordForEmail` failing for "no such user" is indistinguishable from other failures and either must not leak which case occurred. Only a rate-limit error gets its own message ("Too many requests — please wait a moment and try again.") redirecting back to `/auth/forgot-password?error=...`.

#### 4. Confirmation page with resend cooldown

**File**: `src/pages/auth/reset-link-sent.astro`

**Intent**: "Check your email" page, structurally identical to `confirm-email.astro`'s non-dev branch (emoji, heading, description), plus a resend affordance.

**Contract**: Static content + `<ResendCooldown client:load />` rendering a disabled-looking "Resend link" control that counts down from 60 seconds after mount, then becomes a plain link to `/auth/forgot-password` (the handler retypes their email — no email is round-tripped through the URL).

**File**: `src/components/auth/ResendCooldown.tsx`

**Intent**: Small self-contained countdown island — no server state, no relation to whether a request actually succeeded (the page is reached only via the success redirect).

**Contract**: `useState`/`useEffect` countdown from 60 to 0 (one-second interval, cleared on unmount); renders disabled text while counting, an `<a href="/auth/forgot-password">` once it reaches 0. No `useMounted` needed — this isn't an SSR hydration-guard case, it's a client-only countdown with no server-rendered placeholder to swap.

#### 5. Route wiring

**File**: `src/middleware.ts`

**Intent**: A logged-in handler has no reason to visit the "forgot password" form — same reasoning already applied to `/auth/signin` and `/auth/signup`.

**Contract**: Add `"/auth/forgot-password"` to `UNAUTHENTICATED_ONLY_ROUTES` (line 6). Do **not** add `/auth/reset-link-sent` — `confirm-email.astro` (the precedent) isn't in either list, and there's no harm in a logged-in handler seeing a static confirmation page.

**File**: `src/pages/auth/signin.astro`

**Intent**: Give handlers a discoverable entry point into the new flow.

**Contract**: Add a `<a href="/auth/forgot-password" class="text-sm text-purple-300 hover:underline">Forgot password?</a>` near the existing "Don't have an account? Sign up" line (same styling class).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test` (new `tests/unit/forgot-password-schema.test.ts` importing `forgotPasswordSchema` from `src/lib/schemas/auth.ts`: valid email accepted, empty/malformed rejected)
- Type checking passes: `npm run build` (Astro's build includes type-checking via `astro check` per this project's existing CI)
- Linting passes: `npm run lint`

#### Manual Verification:

- Submitting a registered email on `/auth/forgot-password` lands on `/auth/reset-link-sent` and a reset email arrives (dev inbox or real inbox per environment)
- Submitting an unregistered email produces the identical `/auth/reset-link-sent` outcome — no distinguishable error
- Submitting an invalid email format shows the client-side and (with JS disabled) server-side validation error, staying on `/auth/forgot-password`
- The "Resend link" control is disabled/counting down immediately after landing on `/auth/reset-link-sent`, and becomes a working link back to `/auth/forgot-password` after 60 seconds
- A logged-in handler visiting `/auth/forgot-password` directly is redirected to `/dashboard`
- The "Forgot password?" link is visible and functional on `/auth/signin`

---

## Phase 2: Verify link and set new password (FR-002)

### Overview

Clicking the emailed reset link authenticates the handler into a recovery session and lands them on a dedicated "set new password" page (not `/dashboard`); submitting a new password there signs them fully into the app with the new password active. An expired or already-used link sends them to sign-in with a specific, actionable message.

### Changes Required:

#### 1. Recovery routing in the existing confirm callback

**File**: `src/pages/api/auth/confirm.ts`

**Intent**: Give a verified recovery link a different destination than a verified signup-confirmation link, and give an expired/invalid recovery link a more specific error than the current generic "Invalid confirmation link".

**Contract**: Read `const flow = context.url.searchParams.get("flow");` once at the top of the handler. After each successful exchange (`exchangeCodeForSession` success at line 36, `verifyOtp` success at line 50), redirect to `flow === "recovery" ? "/auth/reset-password" : "/dashboard"` instead of the current hardcoded `"/dashboard"`. On each corresponding error branch (lines 37-39, 51-53), use `flow === "recovery" ? "This reset link didn't work — it may have expired, already been used, or only works on the device/browser you requested it from. Request a new one from the sign-in page." : error.message` as the redirect error message (worded to cover the cross-device PKCE failure mode alongside genuine expiry/reuse, per the plan review's F2 finding), still redirecting to `/auth/signin` in both cases (per the confirmed decision — sign-in already carries the new "Forgot password?" link from Phase 1). The final fallback branch (line 57, no `code`/`token_hash`+`type`) is unaffected — it's unreachable via a well-formed recovery link.

#### 2. Set-new-password page and component

**File**: `src/pages/auth/reset-password.astro`

**Intent**: New page, same shell as `signup.astro`/`signin.astro`, hosting the two-password-field form. Reachable only with a valid recovery session (enforced by middleware, not by this page).

**Contract**: Renders `<SetNewPasswordForm client:load serverError={error} />`.

**File**: `src/components/auth/SetNewPasswordForm.tsx`

**Intent**: Copy `SignUpForm.tsx`'s password + confirmPassword portion (both `FormField`s with independent `PasswordToggle`s, min-6-chars hint, matching-passwords validation) without the email field — same `MIN_PASSWORD_LENGTH = 6` constant, same validation shape.

**Contract**: `<form method="POST" action="/api/auth/reset-password">`, two `FormField`s (`id="password"`, `id="confirmPassword"`), `SubmitButton` with `pendingText="Setting new password..."`.

#### 3. Set-new-password API route

**File**: `src/pages/api/auth/reset-password.ts`

**Intent**: Apply the new password to the already-authenticated (recovery-session) handler and land them signed-in on `/dashboard`.

**Contract**: `export const POST: APIRoute`. Add `export const resetPasswordSchema = z.object({ password: z.string().min(6, ...), confirmPassword: z.string() }).refine(passwords match, ...)` to `src/lib/schemas/auth.ts` (from Phase 1 §2), imported here — same reasoning as Phase 1's route: keeps the schema free of `astro:env/server` so tests can import it directly. If `!context.locals.user` (recovery session expired or route hit directly without one), redirect to `/auth/signin?error=${encodeURIComponent("Your reset link has expired. Request a new one.")}` — this route sits outside `middleware.ts`'s `PROTECTED_ROUTES` matching (that only covers page paths), so the check is local to this handler, not inherited. On zod failure, redirect to `/auth/reset-password?error=...`. On success, call `supabase.auth.updateUser({ password })`; on a Supabase error, redirect to `/auth/reset-password?error=${error.message}`; on success, redirect to `/dashboard` (the recovery session `updateUser` operates on is already a valid session — no separate sign-in step, per the confirmed decision).

#### 4. Route wiring

**File**: `src/middleware.ts`

**Intent**: `/auth/reset-password` requires a signed-in (recovery) session — apply the same rule `context/foundation/lessons.md` already states for every authenticated page route.

**Contract**: Add `"/auth/reset-password"` to `PROTECTED_ROUTES` (line 5).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test` (new `tests/unit/reset-password-schema.test.ts` importing `resetPasswordSchema` from `src/lib/schemas/auth.ts`: valid matching passwords accepted, too-short rejected, mismatched `confirmPassword` rejected)
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Clicking a freshly requested reset link lands on `/auth/reset-password` (not `/dashboard`), signed into a recovery session
- Submitting a new password (twice, matching, ≥6 chars) redirects to `/dashboard`, already signed in
- Signing out and signing back in with the new password succeeds
- Clicking an already-used or artificially expired reset link redirects to `/auth/signin` with the specific "This reset link didn't work..." message
- Visiting `/auth/reset-password` directly while signed out redirects to `/auth/signin` (via `PROTECTED_ROUTES`)
- Submitting mismatched or too-short passwords on `/auth/reset-password` shows the client-side validation error and, with JS disabled, the server-side equivalent
- The existing signup → confirm-email → dashboard flow (Phase 1's `confirm.ts` change) still works unchanged — no `flow` param present, still redirects to `/dashboard`

---

## Testing Strategy

### Unit Tests:

- `forgotPasswordSchema` (`src/lib/schemas/auth.ts`, Phase 1): valid email passes; empty/malformed email fails with the expected message.
- `resetPasswordSchema` (`src/lib/schemas/auth.ts`, Phase 2): valid matching ≥6-char passwords pass; too-short password fails; mismatched confirmation fails.

### Integration Tests:

- None added — no new database tables or RLS policies are introduced by this change (Supabase Auth owns all reset-token state internally), so the existing `tests/unit/data-integrity.test.ts`-style Supabase-integration harness has nothing new to exercise.

### Manual Testing Steps:

1. Request a reset link for a registered email → confirm arrival and content of the email.
2. Request a reset link for an unregistered email → confirm identical UI outcome (no distinguishable signal).
3. Click the link → confirm landing on `/auth/reset-password`, not `/dashboard`.
4. Set a new password → confirm redirect to `/dashboard`, signed in.
5. Sign out, sign back in with the new password → confirm success.
6. Re-click the same (now-used) link → confirm the specific expired-link message on `/auth/signin`.
7. Re-run the existing signup → confirm-email → dashboard flow end-to-end → confirm no regression.

## Performance Considerations

None — this is a low-QP, small-scale feature (per the PRD's `target_scale`) with no new data model, no new query paths, and no change to any existing hot path (training grid, dashboard).

## Migration Notes

No data migration. No new Supabase migration file — this change is entirely application-layer plus a Supabase Auth (dashboard) configuration check (the Redirect URL allowlist verification called out in Critical Implementation Details).

## References

- Roadmap slice: `context/foundation/roadmap.md` §S-05 (Password reset)
- PRD: `context/foundation/prd-v2.md` FR-001, FR-002
- Precedent change: `context/archive/2026-05-31-auth-flow/plan.md`, `context/archive/2026-05-31-auth-flow/plan-brief.md`
- Existing OTP/PKCE callback: `src/pages/api/auth/confirm.ts`
- Existing password-field pattern: `src/components/auth/SignUpForm.tsx`
- Lesson applied: `context/foundation/lessons.md` §"Always register authenticated page routes in PROTECTED_ROUTES"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Request password-reset link

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — aeefad7
- [x] 1.2 Type checking passes: `npm run build` — aeefad7
- [x] 1.3 Linting passes: `npm run lint` — aeefad7

#### Manual

- [x] 1.4 Registered email → reset-link-sent page → email arrives — aeefad7
- [x] 1.5 Unregistered email → identical outcome, no distinguishable error — aeefad7
- [x] 1.6 Invalid email format → validation error, stays on forgot-password — aeefad7
- [x] 1.7 Resend cooldown disabled then becomes a working link after 60s — aeefad7
- [x] 1.8 Logged-in handler visiting /auth/forgot-password redirects to /dashboard — aeefad7
- [x] 1.9 "Forgot password?" link visible and functional on /auth/signin — aeefad7

### Phase 2: Verify link and set new password

#### Automated

- [x] 2.1 Unit tests pass: `npm run test`
- [x] 2.2 Type checking passes: `npm run build`
- [x] 2.3 Linting passes: `npm run lint`

#### Manual

- [x] 2.4 Fresh reset link lands on /auth/reset-password with a recovery session
- [x] 2.5 Setting new password redirects to /dashboard, signed in
- [x] 2.6 Sign out + sign back in with new password succeeds
- [x] 2.7 Reused/expired link redirects to /auth/signin with specific message
- [x] 2.8 Direct visit to /auth/reset-password while signed out redirects to /auth/signin
- [x] 2.9 Mismatched/too-short password shows validation error
- [x] 2.10 Existing signup → confirm-email → dashboard flow unregressed
