# Auth Flow — Plan Brief

> Full plan: `context/changes/auth-flow/plan.md`

## What & Why

Close three gaps in the existing email + password auth scaffold so the complete round-trip — sign-up → email confirmation → sign-in → protected route → sign-out — works correctly end-to-end. The scaffold is ~80% complete; the remaining gaps are a misrouted redirect, no auth-page guard, missing server-side validation, and a broken production confirmation flow.

## Starting Point

All auth pages (`signin.astro`, `signup.astro`, `confirm-email.astro`), API routes (`signin.ts`, `signup.ts`, `signout.ts`), the Supabase client factory (`supabase.ts`), and the middleware protection for `/dashboard` already exist and largely work. The silent failure is that clicking a Supabase confirmation email in production has no corresponding route to exchange the token for a session — invisible in dev (Supabase auto-confirms) but broken in production.

## Desired End State

A handler can sign up, receive and click the confirmation email, land on `/dashboard` already signed in, navigate the app, and sign out. Visiting an auth page while already signed in bounces to `/dashboard`. Submitting a form with invalid input or an unconfirmed email produces a clear, actionable error message — no raw Supabase strings.

## Key Decisions Made

| Decision                | Choice                                              | Why (1 sentence)                                                                                               | Source |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Post-confirmation UX    | Auto-sign-in → `/dashboard`                         | Zero-friction; token exchange via `verifyOtp` sets session cookies automatically before the redirect fires     | Plan   |
| Auth-page guard         | Redirect authenticated users to `/dashboard`        | Prevents the confusing "sign in again" state; mirrors the existing `PROTECTED_ROUTES` pattern                  | Plan   |
| Zod validation scope    | Mirror client-side rules (email format, 6-char min) | Client and server agree — bypassed forms can't produce opaque Supabase 422s                                    | Plan   |
| Unconfirmed email error | Custom friendly message                             | "Please confirm your email first — check your inbox." gives the user an action; Supabase's raw string does not | Plan   |
| Post-sign-in redirect   | `/dashboard`                                        | Authenticated users belong on the app, not the welcome page                                                    | Plan   |

## Scope

**In scope:**

- `src/middleware.ts` — add outbound guard for `/auth/signin` and `/auth/signup`
- `src/pages/api/auth/signin.ts` — fix redirect + add zod + friendly unconfirmed error
- `src/pages/api/auth/signup.ts` — add zod validation
- `src/pages/api/auth/confirm.ts` — new GET route for email confirmation callback
- Supabase dashboard: update Redirect URLs allowlist (manual step)

**Out of scope:**

- No UI changes to any `.astro` auth pages
- No password reset / forgot-password flow
- No resend-confirmation-email feature
- No `?next=` deep-link redirect parameter
- No changes to session lifetime or cookie options

## Architecture / Approach

All changes are in the API/middleware layer — no new UI components. The `@supabase/ssr` cookie handling in `createClient` already manages session cookies; the confirm route just calls `verifyOtp` and the session is set automatically. Work proceeds inward-to-outward: middleware routing first, then existing-route hardening, then the new callback route.

## Phases at a Glance

| Phase                          | What it delivers                                                                | Key risk                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Auth redirects + guard      | Sign-in lands on `/dashboard`; authenticated users can't visit auth pages       | Regression: protected-route guard must still work after adding outbound guard                                                            |
| 2. API route hardening         | Zod validation + friendly "email not confirmed" error                           | Supabase error string matching — if Supabase changes wording, friendly message stops matching (falls back to raw string, still readable) |
| 3. Email confirmation callback | Complete production sign-up flow; `/api/auth/confirm` exchanges token → session | Supabase dashboard config (manual step) must be done before production testing can pass                                                  |

**Prerequisites:** Supabase project is accessible; `SUPABASE_URL` and `SUPABASE_KEY` env vars are set locally and in the Cloudflare Workers secret store.  
**Estimated effort:** ~1 session across 3 phases (small, targeted changes; 3 files edited, 1 file created)

## Open Risks & Assumptions

- Supabase's `"Email not confirmed"` error string is matched by `includes()` — a future Supabase wording change will fall back to the raw string (still readable, not broken)
- The Supabase dashboard Redirect URL allowlist must be updated before Phase 3 manual verification can pass; this is a manual step outside the code changes
- `import.meta.env.DEV` in `confirm-email.astro` correctly resolves to `false` in production Cloudflare builds — verified by Astro/Vite build behaviour

## Success Criteria (Summary)

- Sign up → confirm email → land on `/dashboard` signed in (production flow, end-to-end)
- Sign in with correct credentials → `/dashboard`; sign out → `/`; visit protected route signed out → sign-in page
- Unconfirmed-email sign-in shows "Please confirm your email first — check your inbox."
