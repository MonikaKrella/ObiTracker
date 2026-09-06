<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Password Reset Implementation Plan

- **Plan**: context/changes/password-reset/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-09-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Non-rate-limit Supabase errors are silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/forgot-password.ts:29-39
- **Detail**: `resetPasswordForEmail` errors that aren't a rate-limit code fall through to the identical "check your email" redirect with no server-side log. Correct for anti-enumeration (the plan explicitly wants this), but it means an SMTP outage or Supabase misconfiguration in production would be invisible to ops — every failure looks like success from the logs.
- **Fix**: Add a `console.error` (or the project's logger, if one exists) for the swallowed `error` immediately before the generic redirect, without changing the response the client sees.
- **Decision**: FIXED

### F2 — ResendCooldown's timer logic isn't extracted to `src/components/hooks/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/ResendCooldown.tsx:5-18
- **Detail**: CLAUDE.md states "React hooks: extract to `src/components/hooks/`," and existing non-trivial stateful UI logic (e.g. `useTrainingGrid.ts`) follows that. `ResendCooldown` inlines a `setInterval`-driven countdown directly in the component instead of a `useCountdown(seconds)` hook. It's single-use today, which is the case for keeping it inline too.
- **Fix A ⭐ Recommended**: Extract the countdown into `src/components/hooks/useCountdown.ts` returning `secondsLeft`, matching the project's stated convention for hook logic.
  - Strength: Matches the documented rule and existing precedent (`useTrainingGrid`, `useMounted`); makes the countdown reusable if another cooldown UI shows up later.
  - Tradeoff: One more file for logic that's currently used in exactly one place.
  - Confidence: MED — the convention is explicit in CLAUDE.md, but its intent (cross-cutting reuse) is debatable for a single-use timer.
  - Blind spot: Haven't confirmed whether the project's hook-extraction rule was meant to apply to every `useEffect`+`useState` pair or only to genuinely reusable logic.
- **Fix B**: Leave it inline — it's simple, self-contained, and used by exactly one component.
  - Strength: No extra indirection for one-off logic; matches how `SignUpForm`/`SignInForm` keep their local `useState` inline.
  - Tradeoff: Diverges from the letter of the CLAUDE.md rule and from `useTrainingGrid`'s precedent for timer/interval-style logic.
  - Confidence: MED — reasonable if the rule is read narrowly.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — kept inline; single-use countdown doesn't warrant extraction.

### F3 — Double-submit guard added to only one of four native-POST auth forms

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/components/auth/SubmitButton.tsx (new `disabled` prop), src/components/auth/ForgotPasswordForm.tsx:14,41
- **Detail**: Not in the plan's contract for either phase. `ForgotPasswordForm` layers its own `submitting` state on top of `SubmitButton`'s existing `useFormStatus().pending` disable, to guard against double-submission during the slower Supabase round trip. `SignUpForm`, `SignInForm`, and `SetNewPasswordForm` all rely on `pending` alone for the same native-POST pattern. The addition itself is small and backward-compatible (optional prop), but it's an unplanned, non-uniform behavior change.
- **Fix A ⭐ Recommended**: Keep the extra guard scoped to `ForgotPasswordForm` only, and note the rationale (this form's server action is more failure/timeout prone than a straightforward signup/signin round trip since it always redirects, never renders errors as fast) as a one-line comment.
  - Strength: No churn to three working, already-verified forms; the guard exists where the original implementer judged it mattered most.
  - Tradeoff: Leaves an inconsistency a future reader might trip on ("why does only this form do this?").
  - Confidence: MED — `pending` already prevents double-submission in the other three forms in practice; the marginal risk window this closes is narrow.
  - Blind spot: Haven't measured whether `pending` alone ever produces an observable double-submit window in this app.
- **Fix B**: Apply the same `submitting` guard to all four forms for uniformity.
  - Strength: Consistent behavior across every auth form.
  - Tradeoff: Touches three files that already passed their own phase's manual verification, for a guard whose marginal benefit over `pending` alone is unproven.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B (user-modified) — applied the `submitting` guard to `SignUpForm`, `SignInForm`, and `SetNewPasswordForm` too, using `SubmitButton`'s existing optional `disabled` prop so each form opts in independently.

### F4 — ResendCooldown recreates its interval every second

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/ResendCooldown.tsx:8-18
- **Detail**: The effect depends on `secondsLeft`, so `setInterval`/`clearInterval` run 60 times over the countdown instead of once. Cleanup is present, so this isn't a leak — just unnecessary churn.
- **Fix**: Use a single interval with a functional update (`setSecondsLeft((s) => Math.max(0, s - 1))`) and an empty dependency array.
- **Decision**: FIXED

### F5 — Resend cooldown always restarts at 60s on page reload

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/ResendCooldown.tsx; src/pages/auth/reset-link-sent.astro
- **Detail**: The countdown is purely client-side and resets on every mount, so refreshing `/auth/reset-link-sent` re-arms the full 60s regardless of when the email was actually sent. Cosmetic only — Supabase's own rate limit (`config.toml`, 2 emails/hour) is the real enforcement point.
- **Fix**: No action needed unless UX precision matters; if it does, persist a send timestamp (query param or `localStorage`) and compute `secondsLeft` from elapsed time.
- **Decision**: SKIPPED

### F6 — reset-password.ts accepts any authenticated session, not specifically a recovery session

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/api/auth/reset-password.ts:6-12
- **Detail**: Any signed-in user (not just one who arrived via a recovery link) can POST here and change their password without re-entering the old one. This matches the plan's explicit, confirmed decision ("the recovery session `updateUser` operates on is already a valid session — no separate sign-in step") — flagging only for visibility, not as a defect.
- **Fix**: No action needed — behavior is intentional per the plan.
- **Decision**: SKIPPED (intentional per plan)
