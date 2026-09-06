# Password Reset — Plan Brief

> Full plan: `context/changes/password-reset/plan.md`

## What & Why

Add a password-reset flow so a handler who forgets their password can request a reset link by email, click it, and set a new password — closing the last gap in an otherwise-complete email + password auth scaffold. This is roadmap slice S-05 (FR-001, FR-002), flagged as "ready" with no prerequisites.

## Starting Point

Signup, signin, signout, and email confirmation already work end-to-end (`src/pages/auth/`, `src/pages/api/auth/{signin,signup,signout,confirm}.ts`). Nothing touches password reset today. Two pieces of prior work make this smaller than a from-scratch auth feature: reusable form components (`FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`) already implement the exact double-password-entry UI FR-002 needs, and `confirm.ts`'s OTP-type allowlist already includes `"recovery"` — unused until now.

## Desired End State

A handler clicks "Forgot password?" on the sign-in page, enters their email, and always sees the same "check your email" confirmation regardless of whether that email has an account. Clicking the emailed link lands them on a dedicated "set new password" page (not the dashboard); submitting a new password there signs them fully into the app. An expired or reused link sends them back to sign-in with a clear, actionable message.

## Key Decisions Made

| Decision                                | Choice                                                                                  | Why (1 sentence)                                                                                                                                            | Source |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `confirm.ts` routing for recovery links | Branch on a `flow=recovery` marker we add to the `redirectTo` URL                       | Supabase's PKCE flow doesn't otherwise expose which action produced the code; reusing one callback avoids duplicating the token-exchange logic              | Plan   |
| Email enumeration                       | Always show the identical generic success message                                       | Prevents probing which emails are registered; matches Supabase's own default anti-enumeration behavior                                                      | Plan   |
| Expired/invalid link                    | Redirect to `/auth/signin` with a specific "expired, request a new one" message         | Reuses the existing error-redirect pattern; sign-in now carries the "Forgot password?" entry point                                                          | Plan   |
| Post-reset session                      | Land signed-in on `/dashboard`, no re-signin required                                   | The recovery session is already valid; matches this codebase's existing zero-friction signup→auto-signin pattern                                            | Plan   |
| Resend cooldown                         | 60s disabled control on the confirmation page, no client-side rate-limit UI beyond that | Matches the low-traffic scale of this app while avoiding accidental double-submits                                                                          | Plan   |
| New-password validation                 | Same rule as signup (min 6 chars, no reuse-of-old-password check)                       | Matches FR-002's own Socrates resolution — the handler already proved email ownership via the link                                                          | Plan   |
| Reset-link expiry window                | Supabase project (dashboard) default, verified manually — not a code-level setting      | `resetPasswordForEmail` exposes no per-call expiry parameter                                                                                                | Plan   |
| Testing approach                        | Vitest unit tests for the two new zod schemas + manual E2E verification                 | Matches how this codebase already tested the structurally identical email-confirmation flow; no prior art for mocking Supabase email delivery in Playwright | Plan   |

## Scope

**In scope:**

- Request-link page, form, and API route (`/auth/forgot-password`)
- Confirmation page with resend cooldown (`/auth/reset-link-sent`)
- `confirm.ts` routing fork for recovery links
- Set-new-password page, form, and API route (`/auth/reset-password`)
- Middleware route registration, sign-in page link

**Out of scope:**

- Any new Supabase migration or table — Supabase Auth owns reset-token state
- Code-level control of the link expiry window
- New-password-differs-from-old validation
- Playwright E2E coverage of the email round-trip
- OAuth/social recovery

## Architecture / Approach

Both new pages reuse the existing auth-page shell and form primitives exactly as signup/signin do — native `<form method="POST">` submissions, zod validation mirrored client- and server-side, redirect-with-query-param error passing. The one architectural addition is a routing fork inside the existing `confirm.ts` callback, keyed off a marker this change controls (`flow=recovery`) rather than anything Supabase's OTP `type` param exposes for the PKCE flow.

## Phases at a Glance

| Phase                               | What it delivers                                                                                             | Key risk                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Request password-reset link      | Forgot-password form → generic "check your email" confirmation with resend cooldown                          | Supabase's Redirect URL allowlist matching mode for the appended `?flow=recovery` query param is unverified until manually tested                         |
| 2. Verify link and set new password | `confirm.ts` routes recovery links to a dedicated set-password page; success lands signed-in on `/dashboard` | A mistake in the `flow` branch could silently break the existing signup→dashboard redirect — Phase 2's manual verification explicitly re-checks that flow |

**Prerequisites:** None — Supabase project accessible, env vars already configured (existing auth flow depends on the same ones).
**Estimated effort:** ~1 session across 2 phases (6 new files, 2 modified files — matches the roadmap's "low risk" / "~0.5 week" estimate).

## Open Risks & Assumptions

- Whether appending `?flow=recovery` to the already-allowlisted `/api/auth/confirm` redirect URL still passes Supabase's allowlist check is unverified from the codebase alone — flagged as a manual verification step in Phase 1.
- Supabase's rate-limit error shape (`error.code`/`error.status`) for `resetPasswordForEmail` is assumed stable per current `@supabase/supabase-js` (`^2.99.1`) behavior; not independently verified against Supabase's changelog.

## Success Criteria (Summary)

- A handler who forgets their password can regain account access entirely through the UI, without any manual/support intervention.
- No signal is ever exposed (via UI or timing) about whether a given email has an account.
- The existing signup → confirm-email → dashboard flow is provably unregressed after `confirm.ts`'s routing change.
