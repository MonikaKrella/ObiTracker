# Auth Flow: Complete and Verify Email + Password Auth End-to-End

## Overview

Verify and harden the existing email + password auth scaffold so the complete round-trip — sign-up → email confirmation → sign-in → protected route → sign-out — works correctly on both phone and laptop, in both dev and production. Three targeted gaps to close: a broken redirect after sign-in, missing middleware guard for auth pages, no server-side input validation, and no email confirmation callback route.

## Current State Analysis

The auth scaffold is ~80% complete. Key pieces already in place:
- `src/lib/supabase.ts` — `createClient()` factory using `@supabase/ssr` with cookie-based sessions; returns `null` when env vars are missing (all callers handle null)
- `src/middleware.ts` — resolves `context.locals.user` on every request; `PROTECTED_ROUTES = ["/dashboard"]` redirects unauthenticated users to `/auth/signin`
- `src/pages/api/auth/{signin,signup,signout}.ts` — POST handlers wired to Supabase auth; error redirects via `?error=` query param
- `src/pages/auth/{signin,signup,confirm-email}.astro` — pages exist; `confirm-email.astro` correctly branches on `import.meta.env.DEV`
- `src/components/auth/{SignInForm,SignUpForm}.tsx` — React islands with client-side validation (email format, 6-char min password, confirm-password match)

**Gaps:**
- `signin.ts:19` redirects to `/` (the welcome page) after successful sign-in — should be `/dashboard`
- No guard preventing an authenticated user from visiting `/auth/signin` or `/auth/signup`
- No server-side zod validation on API routes (CLAUDE.md requirement)
- No email confirmation callback route — clicking the Supabase confirmation link in production cannot establish a session because there is no route to exchange the `token_hash`. This is invisible in dev (Supabase auto-confirms), but the flow is broken in production.

## Desired End State

A handler can complete every auth action without hitting a dead end:
1. Sign up → see "check your email" screen
2. Click confirmation link in email → session established → land on `/dashboard`
3. Sign in → land on `/dashboard`
4. Sign out → land on `/`
5. Visit a protected route while signed out → redirect to `/auth/signin`
6. Visit `/auth/signin` or `/auth/signup` while already signed in → redirect to `/dashboard`
7. Submit a sign-in form with an unconfirmed email → see a clear, actionable error message

### Key Discoveries

- `signin.ts:19` — `context.redirect("/")` is the sign-in success redirect; needs to be `/dashboard`
- `middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; no corresponding list for auth-only pages
- No `src/pages/api/auth/confirm.ts` exists — this file must be created
- `@supabase/ssr` `createClient` wires `setAll` to `cookies.set()`; calling `supabase.auth.verifyOtp()` inside a GET handler will automatically write session cookies to the response before the redirect fires
- Supabase's error message for a pre-confirmation sign-in attempt is the string `"Email not confirmed"` — match on this string to produce a friendlier message
- `output: "server"` is set globally in `astro.config.mjs`; `prerender = false` exports are not required on individual API routes

## What We're NOT Doing

- No UI changes to auth pages — `signin.astro`, `signup.astro`, and `confirm-email.astro` are not touched
- No resend-confirmation-email feature (out of scope for S-01)
- No password reset / forgot-password flow (not in FR-001 or PRD v1)
- No `?next=` redirect parameter for deep-linking through sign-in
- No changes to `signout.ts` — it already redirects to `/` which is correct
- No changes to session lifetime, cookie options, or Supabase auth settings beyond the redirect URL allowlist

## Implementation Approach

Work inward-to-outward: fix the middleware first (routing layer), then harden the existing API routes (no new files), then add the one missing route (confirm callback). Each phase is independently deployable.

## Critical Implementation Details

**Cookie write timing in the confirm callback:** `supabase.auth.verifyOtp()` triggers `setAll` on the `@supabase/ssr` client, which calls `cookies.set()` on Astro's cookie jar. Astro SSR flushes Set-Cookie headers before the redirect body is written, so calling `verifyOtp` and then `context.redirect()` in the same handler is the correct pattern — no manual cookie manipulation needed.

**Supabase "Email not confirmed" string:** Supabase returns this exact message. Match on it with a case-insensitive check or `includes()` so a future Supabase wording change doesn't silently revert to the raw string — instead, the custom message will stop matching and fall back to the raw error, which is still readable.

---

## Phase 1: Auth Redirects + Middleware Guard

### Overview

Fix the sign-in success redirect and add the outbound guard that bounces authenticated users away from auth pages. No new files — two small edits.

### Changes Required:

#### 1. Middleware — outbound auth-page guard

**File:** `src/middleware.ts`

**Intent:** Prevent an authenticated user from seeing the sign-in or sign-up page. Add a list of routes that are only for unauthenticated users (the mirror of `PROTECTED_ROUTES`) and redirect any authenticated visitor to `/dashboard`.

**Contract:** Add a second constant — e.g. `UNAUTHENTICATED_ONLY_ROUTES = ["/auth/signin", "/auth/signup"]` — and check it after the user is resolved. If the user is authenticated and the current path starts with one of those prefixes, return `context.redirect("/dashboard")` before calling `next()`.

#### 2. Sign-in API route — fix success redirect

**File:** `src/pages/api/auth/signin.ts`

**Intent:** Land an authenticated user on the correct screen after sign-in.

**Contract:** Change the `context.redirect("/")` on the success path to `context.redirect("/dashboard")`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Sign in with valid credentials → browser lands on `/dashboard`
- While signed in, navigate to `/auth/signin` → redirects to `/dashboard`
- While signed in, navigate to `/auth/signup` → redirects to `/dashboard`
- While signed out, navigate to `/dashboard` → still redirects to `/auth/signin` (regression check)

**Implementation Note:** After this phase passes manual verification, pause and confirm before proceeding to Phase 2.

---

## Phase 2: API Route Hardening

### Overview

Add zod validation schemas to the sign-in and sign-up routes, and return a friendlier message when a user tries to sign in before confirming their email.

### Changes Required:

#### 1. Sign-in route — zod validation + "email not confirmed" friendly error

**File:** `src/pages/api/auth/signin.ts`

**Intent:** Reject structurally invalid requests before they reach Supabase, and surface an actionable message for the most common new-user failure (unconfirmed email).

**Contract:**
- Parse the form body with a zod schema: `email` must be a non-empty valid email; `password` must be a non-empty string.
- On zod parse failure, redirect back to `/auth/signin?error=<message>` (same error-redirect pattern already used for Supabase errors).
- After `signInWithPassword` returns an error, check whether `error.message` includes `"Email not confirmed"` (case-insensitive). If so, replace the raw Supabase message with: `"Please confirm your email first — check your inbox."` before redirecting.

#### 2. Sign-up route — zod validation

**File:** `src/pages/api/auth/signup.ts`

**Intent:** Validate input server-side so a bypassed or malformed client request cannot produce an opaque Supabase 422 error.

**Contract:**
- Parse the form body with a zod schema mirroring the client-side rules: `email` must be a valid email; `password` must be at least 6 characters.
- `confirmPassword` is a client-side UX field only — do not validate it server-side (it's not a security control).
- On zod failure, redirect to `/auth/signup?error=<message>`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- POST directly to `/api/auth/signin` with an empty email → response redirects to `/auth/signin?error=...` with a readable validation message (not a Supabase 422)
- Sign in with an account whose email is not yet confirmed → sign-in page shows `"Please confirm your email first — check your inbox."`
- Sign in with valid confirmed credentials → `/dashboard` (regression)
- POST directly to `/api/auth/signup` with a 3-character password → redirected to `/auth/signup?error=...` with a readable zod message

**Implementation Note:** After this phase passes manual verification, pause and confirm before proceeding to Phase 3.

---

## Phase 3: Email Confirmation Callback

### Overview

Add the missing GET route that Supabase redirects to after a user clicks the confirmation link. The route exchanges the `token_hash` for a live session and redirects to `/dashboard`. Also documents the Supabase dashboard configuration step required for the route to receive traffic.

### Changes Required:

#### 1. Email confirmation callback route

**File:** `src/pages/api/auth/confirm.ts` *(new file)*

**Intent:** Complete the last leg of the sign-up flow — exchange the Supabase OTP token embedded in the confirmation email for a valid session cookie, then land the user on the app's first authenticated screen.

**Contract:**
- Export a `GET` handler.
- Read `token_hash` and `type` from `context.url.searchParams`.
- If either is missing, redirect to `/auth/signin?error=Invalid+confirmation+link`.
- Create a Supabase client via `createClient`. If null (missing env vars), redirect to `/auth/signin?error=Configuration+error`.
- Call `supabase.auth.verifyOtp({ token_hash, type })`. The `@supabase/ssr` cookie handler writes the session cookies automatically before the redirect fires — no manual cookie manipulation needed.
- On success: `context.redirect("/dashboard")`.
- On error: `context.redirect("/auth/signin?error=" + encodeURIComponent(error.message))`.

#### 2. Supabase dashboard configuration *(manual step — required before production)*

**Where:** Supabase dashboard → Authentication → URL Configuration

**Intent:** Tell Supabase which URLs are allowed as confirmation-link redirect targets, and where to send users after confirmation.

**Contract:** Two settings to update:
- **Site URL:** the production domain (e.g. `https://obitracker.example.com`) — used as the default base for confirmation links
- **Redirect URLs:** add the following entries so Supabase accepts redirects to the callback route:
  - `http://localhost:4321/api/auth/confirm` (local dev)
  - `https://<production-domain>/api/auth/confirm`

Without these entries, Supabase refuses to redirect to the callback URL and the confirmation link silently fails.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Supabase Redirect URLs are updated in the dashboard ✓
- Sign up with a real email address in a production-like environment → receive confirmation email → click link → browser lands on `/dashboard`, session is active (user email visible)
- Visit `/api/auth/confirm` with no query params → redirect to `/auth/signin` with error message (no crash)
- Visit `/api/auth/confirm` with a tampered/expired `token_hash` → redirect to `/auth/signin` with the Supabase error message

**Implementation Note:** After Phase 3 passes manual verification, run the full end-to-end checklist in the Testing Strategy section below.

---

## Testing Strategy

### Manual Testing Checklist (full end-to-end, run after Phase 3):

1. **Fresh sign-up (production with email confirmation):**
   - Sign up → see `confirm-email.astro` "Check your email" screen
   - Click confirmation link → land on `/dashboard`, session active
   - Sign out → land on `/`

2. **Fresh sign-up (dev with auto-confirm):**
   - Sign up → see `confirm-email.astro` "Registration successful" screen
   - Click "Go to sign in" → sign-in page
   - Sign in → land on `/dashboard`

3. **Sign-in happy path:**
   - Sign in with correct credentials → `/dashboard`, user email shown
   - Sign out → `/`

4. **Sign-in error paths:**
   - Wrong password → sign-in page with Supabase error
   - Unconfirmed email → sign-in page with `"Please confirm your email first — check your inbox."`
   - Submit form with blank email → sign-in page with zod error

5. **Auth-page guard:**
   - While signed in, visit `/auth/signin` → redirect to `/dashboard`
   - While signed in, visit `/auth/signup` → redirect to `/dashboard`

6. **Route protection (regression):**
   - Visit `/dashboard` while signed out → redirect to `/auth/signin`

7. **Confirmation callback error handling:**
   - Visit `/api/auth/confirm` with no params → redirect to `/auth/signin?error=Invalid+confirmation+link`

### Performance Considerations

N/A — no hot paths; all auth routes are infrequently called by nature.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- Roadmap suggestions: `context/foundation/roadmap-suggestions.md` (S-01 notes)
- PRD: `context/foundation/prd.md` (FR-001)
- Supabase SSR docs: https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=astro
- Supabase `verifyOtp` API: https://supabase.com/docs/reference/javascript/auth-verifyotp
- Existing middleware: `src/middleware.ts`
- Supabase client factory: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth Redirects + Middleware Guard

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — e314dcb
- [x] 1.2 Build succeeds: `npm run build` — e314dcb

#### Manual

- [x] 1.3 Sign in with valid credentials → browser lands on `/dashboard` — e314dcb
- [x] 1.4 While signed in, navigate to `/auth/signin` → redirects to `/dashboard` — e314dcb
- [x] 1.5 While signed in, navigate to `/auth/signup` → redirects to `/dashboard` — e314dcb
- [x] 1.6 While signed out, navigate to `/dashboard` → still redirects to `/auth/signin` (regression check) — e314dcb

### Phase 2: API Route Hardening

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Build succeeds: `npm run build`

#### Manual

- [x] 2.3 POST directly to `/api/auth/signin` with empty email → redirects with readable validation message
- [x] 2.4 Sign in with unconfirmed account → sign-in page shows "Please confirm your email first — check your inbox."
- [x] 2.5 Sign in with valid confirmed credentials → `/dashboard` (regression)
- [x] 2.6 POST directly to `/api/auth/signup` with 3-char password → redirects with readable zod message

### Phase 3: Email Confirmation Callback

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Build succeeds: `npm run build`

#### Manual

- [ ] 3.3 Supabase Redirect URLs updated in dashboard
- [ ] 3.4 Sign up with real email → click confirmation link → land on `/dashboard` with active session
- [ ] 3.5 Visit `/api/auth/confirm` with no query params → redirect to `/auth/signin` with error message
- [ ] 3.6 Visit `/api/auth/confirm` with tampered token → redirect to `/auth/signin` with Supabase error message
- [ ] 3.7 Full end-to-end checklist from Testing Strategy passes
