# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

No test suite is configured — do not add one unless asked.

## Project: ObiTracker

A competitive dog obedience training tracker. The core product value: one glance at a training grid tells the handler *what to train next* — green rows are the 3 most-trained elements, red rows are the 3 least-trained, within a configurable 7/14/30-day rolling window. Custom training elements per dog (not a fixed exercise list) are the differentiating feature.

See `context/foundation/prd.md` for the full requirements. Key scoping decisions:
- Competition results (scores, rankings) are explicitly **v2 only**.
- No session notes or comments — the grid records presence only (tick/untick).
- No OAuth; email + password auth only.
- No sharing, no multi-user access to a dog's data.

**Green/red highlight business rule (non-obvious):** top 3 and bottom 3 by tick count within the selected window. Ties at rank 1 (or last) expand the highlighted set — all tied rows are shown. Ties at rank 2 or 3 do *not* expand it.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui. Deployed to Cloudflare Workers.

All pages are server-rendered (`output: "server"` in `astro.config.mjs`). React components are used only for interactive islands. API routes must export `const prerender = false`.

### Auth & session flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. `SUPABASE_URL` and `SUPABASE_KEY` come from `astro:env/server` (declared in `astro.config.mjs`). Returns `null` when env vars are missing — all callers must handle null.
- `src/middleware.ts` — runs on every request, resolves the current user via `supabase.auth.getUser()`, attaches to `context.locals.user`. Routes listed in `PROTECTED_ROUTES` redirect to `/auth/signin` when unauthenticated. Add new protected paths there.
- API routes: `src/pages/api/auth/{signin,signup,signout}.ts` — handle form submissions, redirect on error via query param `?error=`.

### Key conventions

- **Path alias**: `@/*` → `./src/*` (tsconfig paths).
- **Class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Never concatenate Tailwind class strings manually.
- **shadcn/ui**: components in `src/components/ui/`, "new-york" style. Add new components with `npx shadcn@latest add [name]`.
- **API routes**: uppercase named exports (`GET`, `POST`); validate input with zod.
- **Services/helpers**: `src/lib/` or `src/lib/services/` for extracted business logic.
- **Shared types** (entities, DTOs): `src/types.ts`.
- **React hooks**: extract to `src/components/hooks/`.
- **No Next.js directives** — no `"use client"` etc.
- **Supabase migrations**: `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables. Write one policy per operation (SELECT, INSERT, UPDATE, DELETE) per role (authenticated, anon). Never use a single catch-all policy. Only `auth.users` is used currently — no custom tables yet.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
