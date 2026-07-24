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

A competitive dog obedience training tracker. The core product value: one glance at a training grid tells the handler _what to train next_ — green rows are the 3 most-trained elements, red rows are the 3 least-trained, within a configurable 7/14/30-day rolling window. Custom training elements per dog (not a fixed exercise list) are the differentiating feature.

See `context/foundation/prd.md` for the full requirements. Key scoping decisions:

- Competition results (scores, rankings) are explicitly **v2 only**.
- No session notes or comments — the grid records presence only (tick/untick).
- No OAuth; email + password auth only.
- No sharing, no multi-user access to a dog's data.

**Green/red highlight business rule (non-obvious):** top 3 and bottom 3 by tick count within the selected window. Ties at rank 1 (or last) expand the highlighted set — all tied rows are shown. Ties at rank 2 or 3 do _not_ expand it.

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

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
