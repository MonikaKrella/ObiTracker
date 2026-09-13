# Main Page — Plan Brief

> Full plan: `context/changes/main-page/plan.md`

## What & Why

Refresh the Welcome (`/`) page's hero section — bigger title, a new hero image, bigger CTA buttons, no Topbar — and stop showing that page to already-authenticated users, sending them straight to `/dashboard` instead. The current page shows a generic starter-template Topbar to everyone (including logged-in users who land on `/`), and doesn't yet use the new `aport-circle.png` asset the user added.

## Starting Point

`Welcome.astro` already renders the hero (title, subtitle, buttons, feature cards) plus an unconditional `<Topbar />`. `AuthLayout.astro` already puts a `Topbar` on every authenticated page, so that requirement is already met everywhere except the Welcome page. `middleware.ts` already redirects logged-in users away from `/auth/signin` and `/auth/signup` to `/dashboard` — but not from `/`.

## Desired End State

Logged-out visitors see a punchier hero: bigger title, the new circular dog-photo image between the subtitle and buttons, bigger buttons, and no Topbar at all. Logged-in visitors never see this page — hitting `/` sends them straight to `/dashboard`, same as hitting the auth pages does today.

## Key Decisions Made

| Decision           | Choice                                            | Why (1 sentence)                                                                 | Source |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Image position     | Subtitle → image → buttons                        | Puts the strongest visual before the CTA, natural top-to-bottom flow             | Plan   |
| Image size         | Medium accent (~240-320px)                        | Noticeable without overwhelming title/CTA or mobile viewports                    | Plan   |
| Image framing      | Bare, no card-style wrapper                       | The PNG already has its own circular glow; an extra border would compete with it | Plan   |
| Title size         | One Tailwind step bigger                          | Directly addresses "bigger" with a simple, low-risk change                       | Plan   |
| Button size        | Moderate bump (px-8 py-4 text-lg)                 | Clearly bigger and more tappable without unbalancing the hero                    | Plan   |
| Logged-in redirect | Add `/` to existing `UNAUTHENTICATED_ONLY_ROUTES` | Reuses the exact mechanism already used for `/auth/signin` and `/auth/signup`    | Plan   |

## Scope

**In scope:**

- Welcome page hero: title size, image insertion, button size, Topbar removal
- Middleware redirect for logged-in users hitting `/`

**Out of scope:**

- Feature cards (icons/copy) — unchanged
- `public/aport.png` deletion, `public/favicon.png` change — already in progress independently
- Any client-side/loading-state redirect handling — plain SSR redirect only

## Architecture / Approach

Two small, independent file changes: (1) `Welcome.astro` gets its visual tweaks and loses its `Topbar`, (2) `middleware.ts` gains one entry (`"/"`) in an array it already has, reusing the existing redirect branch — no new logic.

## Phases at a Glance

| Phase                               | What it delivers                                         | Key risk                                                |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| 1. Welcome page visual updates      | Bigger title, hero image, bigger buttons, Topbar removed | Image/title sizing might need tuning on small screens   |
| 2. Redirect logged-in users off `/` | Logged-in visitors to `/` land on `/dashboard` instead   | None significant — mirrors an existing, working pattern |

**Prerequisites:** None — `aport-circle.png` is already on disk in `public/`.
**Estimated effort:** ~1 session, two small phases.

## Open Risks & Assumptions

- Assumes "medium accent" sizing (240-320px) reads well against the existing title/button sizes once bumped — may need a quick visual pass to fine-tune exact widths during implementation.

## Success Criteria (Summary)

- Welcome page (logged out) shows bigger title, hero image, bigger buttons, and no Topbar, at all viewport sizes.
- Logged-in users hitting `/` are redirected to `/dashboard` with no flash of Welcome content.
- No regressions to `/auth/signin`, `/auth/signup`, or authenticated pages.
