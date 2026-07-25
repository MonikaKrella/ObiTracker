# Main Page Implementation Plan

## Overview

Update the Welcome (`/`) page — bigger title, a new hero image, bigger CTA buttons, and no Topbar on this page — and stop showing the Welcome page to already-authenticated users by redirecting them straight to `/dashboard`, the same way `/auth/signin` and `/auth/signup` already behave.

## Current State Analysis

- `src/components/Welcome.astro` renders the hero (title, subtitle, Sign In/Sign Up buttons, feature cards) and unconditionally includes `<Topbar />` at the top (`src/components/Welcome.astro:2,28`), which shows different content depending on login state.
- `src/layouts/AuthLayout.astro:19` already renders `<Topbar />` on every authenticated page (dashboard, `/dogs/*`), so "Topbar visible for logged-in users on all pages" is already satisfied everywhere except the Welcome page.
- `src/middleware.ts:6` defines `UNAUTHENTICATED_ONLY_ROUTES = ["/auth/signin", "/auth/signup"]`; when a logged-in user hits one of these, they're redirected to `/dashboard` (`src/middleware.ts:31-39`). `/` is not in this list, so a logged-in user visiting `/` currently still sees the Welcome page.
- `public/aport-circle.png` exists on disk (added by the user) but is not referenced anywhere in code yet. It's a circular, purple-toned dog photo that already visually matches the page's cosmic theme (glow, dark background) — no extra framing needed.
- `public/aport.png` is separately staged for deletion in the working tree; it's unused in code and out of scope for this change.

## Desired End State

- Logged-out visitors to `/` see: gradient title (one size step bigger than today), subtitle, the new hero image, then the (bigger) Sign In / Sign Up buttons, then the three feature cards — with no Topbar anywhere on the page.
- Logged-in visitors to `/` are redirected server-side to `/dashboard` before any Welcome content renders — mirroring the existing `/auth/signin` → `/dashboard` redirect.
- `/auth/signin`, `/auth/signup`, and all authenticated pages are unaffected — they already have no Topbar / always have Topbar, respectively.

**Verification**: `npm run build` succeeds, `npm run lint` passes, and manual browser check of `/` (logged out and logged in) confirms the visual and redirect behavior.

### Key Discoveries:

- `UNAUTHENTICATED_ONLY_ROUTES` matching is `pathname === route || pathname.startsWith(route + "/")` (`src/middleware.ts:31-34`). Adding `"/"` to this array is safe: `"/"` will exact-match the index route, and `startsWith("/" + "/")` (`"//"​`) won't accidentally match any other real route.

## What We're NOT Doing

- Not touching `public/aport.png` deletion or `public/favicon.png` — already staged/modified independently of this change.
- Not changing the feature cards section (icons/copy) — out of scope, notes only mention title, image, buttons, and Topbar.
- Not adding a loading state or client-side redirect for logged-in users on `/` — this is a plain SSR middleware redirect, consistent with the existing pattern.
- Not changing `Layout.astro` or `Topbar.astro` themselves — only how/whether `Welcome.astro` uses `Topbar`.

## Implementation Approach

Two independent, small changes, each touching one file:

1. Visual updates to `Welcome.astro` (title size, image insertion, button size, Topbar removal).
2. One-line addition to `middleware.ts`'s existing unauthenticated-only redirect list.

Both follow patterns already established elsewhere in the codebase (Tailwind size scales used elsewhere on the page; the redirect mechanism already used for `/auth/signin` and `/auth/signup`).

## Phase 1: Welcome page visual updates

### Overview

Make the Welcome page's hero section match the requested look: bigger title, hero image between subtitle and buttons, bigger buttons, and no Topbar.

### Changes Required:

#### 1. Remove Topbar from the Welcome page

**File**: `src/components/Welcome.astro`

**Intent**: The Welcome page should never show a Topbar (logged-out or logged-in) — Topbar is reserved for authenticated pages via `AuthLayout`. Remove the `Topbar` import (`src/components/Welcome.astro:2`) and its usage (`src/components/Welcome.astro:28`).

**Contract**: No `Topbar` import or `<Topbar />` element remains in this file. The `<div class="relative z-10 p-4 sm:p-8">` wrapper stays, just without the Topbar as its first child.

#### 2. Bump the title one size step

**File**: `src/components/Welcome.astro`

**Intent**: Make "ObiTracker" bigger, per the request.

**Contract**: On the `<h1>` (`src/components/Welcome.astro:32-36`), change the responsive size classes from `text-5xl sm:text-6xl lg:text-7xl` to `text-6xl sm:text-7xl lg:text-8xl`. Leave all other classes (gradient, weight, leading) unchanged.

#### 3. Insert the hero image between subtitle and buttons

**File**: `src/components/Welcome.astro`

**Intent**: Place `/aport-circle.png` as a standalone visual between the subtitle paragraph and the Sign In/Sign Up button row, sized as a medium accent (not a dominant hero graphic), bare — no card-style border/backdrop-blur wrapper, since the image already has its own circular frame and glow baked in.

**Contract**: A new `<img>` element referencing `/aport-circle.png`, placed between the closing `</p>` of the subtitle (`src/components/Welcome.astro:37`) and the buttons `<div class="flex flex-col gap-4 sm:flex-row">` (`src/components/Welcome.astro:38`). Responsive width roughly 240px→320px (e.g. `w-60 sm:w-72 lg:w-80`), centered (`mx-auto`), with bottom margin matching the surrounding rhythm (`mb-10`), height auto to preserve aspect ratio. Alt text should be descriptive of the image content (a dog mid-jump during training), not decorative/empty, since it's meaningful page content.

#### 4. Enlarge the Sign In / Sign Up buttons

**File**: `src/components/Welcome.astro`

**Intent**: Make both CTA buttons bigger per the request, using a moderate size bump.

**Contract**: On both `<a>` elements (`src/components/Welcome.astro:39-50`), change `px-6 py-3 text-base` to `px-8 py-4 text-lg`. Keep all other classes (colors, hover states, rounding) unchanged on both buttons.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Lint passes: `npm run lint`
- Format check passes: `npm run format`

#### Manual Verification:

- Visiting `/` while logged out shows: title (visibly bigger), subtitle, hero image (centered, no card border, roughly 240-320px wide), bigger buttons, feature cards — with no Topbar anywhere on the page.
- Page looks correct at mobile (`sm`), tablet, and desktop (`lg`) widths — image and title don't overflow or look oversized on small screens.
- Image has appropriate alt text (verify via browser dev tools / accessibility inspector).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Redirect logged-in users off `/`

### Overview

Stop showing the Welcome page to already-authenticated users — send them straight to `/dashboard`, using the same mechanism already applied to `/auth/signin` and `/auth/signup`.

### Changes Required:

#### 1. Add `/` to the unauthenticated-only route list

**File**: `src/middleware.ts`

**Intent**: A logged-in user visiting `/` should be redirected to `/dashboard`, exactly like visiting `/auth/signin` or `/auth/signup` while logged in already does.

**Contract**: Add `"/"` as an entry in `UNAUTHENTICATED_ONLY_ROUTES` (`src/middleware.ts:6`). No other logic changes — the existing redirect block (`src/middleware.ts:31-39`) already handles any route in this array.

### Success Criteria:

#### Automated Verification:

- Build succeeds: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- While logged in, visiting `/` redirects to `/dashboard` (no flash of Welcome content).
- While logged out, visiting `/` still shows the Welcome page normally (no unintended redirect).
- `/auth/signin` and `/auth/signup` redirect behavior is unchanged when logged in.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test suite is configured in this project (per `CLAUDE.md`); do not add one.

### Integration Tests:

- None.

### Manual Testing Steps:

1. Start the dev server (`npm run dev`), visit `/` logged out — verify title size, image placement/size, button size, and absence of Topbar.
2. Resize the browser (mobile/tablet/desktop) to confirm the hero section (title, image, buttons) remains readable and doesn't overflow.
3. Sign in, then navigate to `/` directly (e.g. type the URL) — verify immediate redirect to `/dashboard` with no Welcome content flash.
4. Sign out, confirm `/` shows the Welcome page again.
5. Confirm `/auth/signin` and `/auth/signup` still behave as before (no Topbar when logged out, redirect to `/dashboard` when logged in).

## Performance Considerations

None beyond normal image handling — `aport-circle.png` is a static asset served from `public/`; no optimization pipeline changes needed.

## Migration Notes

Not applicable — no data or schema changes.

## References

- Change notes: `context/changes/main-page/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Welcome page visual updates

#### Automated

- [x] 1.1 Build succeeds: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Format check passes: `npm run format`

#### Manual

- [x] 1.4 Welcome page shows bigger title, hero image, bigger buttons, no Topbar
- [x] 1.5 Responsive check at mobile/tablet/desktop widths
- [x] 1.6 Image has appropriate alt text

### Phase 2: Redirect logged-in users off `/`

#### Automated

- [x] 2.1 Build succeeds: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`

#### Manual

- [x] 2.3 Logged-in visit to `/` redirects to `/dashboard`
- [x] 2.4 Logged-out visit to `/` still shows Welcome page
- [x] 2.5 `/auth/signin` and `/auth/signup` redirect behavior unchanged
