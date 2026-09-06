# Post-V2 Features

1. Global error page — the app has no custom error page today; an unhandled SSR exception falls
   through to Astro/Cloudflare Workers' default error response rather than anything on-brand.
   Surfaced during the training-board-refactor plan review (F3): `grid.astro`'s new try/catch
   degrades pre-existing Supabase fetch failures to the app's own "service unavailable" overlay
   instead, which is an improvement for that one page, but a proper global/custom error page would
   close this gap application-wide instead of route-by-route.

2. Cross-device-safe password-reset link — the password-reset flow (`password-reset` change) rides
   Supabase's default PKCE `code` flow via `/api/auth/confirm`, whose code verifier is stored in a
   cookie on the device that requested the link. A handler who opens the reset email on a different
   device/browser than the one they requested it from hits `AuthPKCECodeVerifierMissingError`, shown
   today as a generic "try again" message rather than a fix. Surfaced during the password-reset plan
   review (F2): switching the Supabase "Reset Password" email template to the `token_hash`+`type`
   flow (`confirm.ts` already implements this branch, used today only by the OTP path) would
   eliminate the failure mode at the root instead of just wording around it — deferred because it
   requires a Supabase-dashboard email-template change beyond this change's code-only scope.
