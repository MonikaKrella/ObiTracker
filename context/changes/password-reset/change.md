---
change_id: password-reset
title: Password reset
status: impl_reviewed
created: 2026-09-05
updated: 2026-09-06
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Manual production Supabase setup (out-of-band, not in git)

- [x] Redirect URL allowlist — added `.../api/auth/confirm*` wildcard entry — applied 2026-09-06
- [x] Site URL — confirmed points at the real prod domain — applied 2026-09-06
- [ ] Reset-link expiry window — verify dashboard default is acceptable
- [ ] Custom SMTP configured for prod (built-in email sender's rate limit is too low for real traffic)
- [x] Email template sanity check — "Reset Password" template still uses `{{ .ConfirmationURL }}` — applied 2026-09-06
