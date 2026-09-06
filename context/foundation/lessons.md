# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use (select auth.uid()) in RLS policies, not auth.uid() directly

- **Context**: Any Supabase migration that defines RLS policies
- **Problem**: Using `auth.uid()` directly causes it to be evaluated once per row and triggers Supabase linter DB warnings about non-optimal policy expressions.
- **Rule**: Use `(select auth.uid())` in RLS policy expressions instead of `auth.uid()` directly. The subquery form is evaluated once per statement, not once per row, eliminating the linter warning and improving performance.
- **Applies to**: plan, implement, impl-review

## Use `useMounted` (useSyncExternalStore) instead of `useState + useEffect` for SSR hydration guards

- **Context**: Any React island that needs to suppress or swap SSR-rendered content until the client has hydrated (e.g. Radix UI dropdowns, dialogs, tooltips rendered with `client:load`)
- **Problem**: The classic `useState(false) + useEffect(() => setMounted(true), [])` pattern triggers the `react-compiler/react-compiler` lint rule ("Calling setState synchronously within an effect can trigger cascading renders") and causes an extra render cycle on every mount.
- **Rule**: Use the `useMounted()` hook from `src/components/hooks/useMounted.ts` instead. It is backed by `useSyncExternalStore` with a no-op subscribe, a client snapshot of `true`, and a server snapshot of `false`. React integrates this directly into its rendering lifecycle — no extra render cycle, no lint violation, SSR-safe.
- **Alternative for DOM-swap patterns**: If the server already renders a placeholder element and the island needs to remove it before the first paint, `useLayoutEffect` with DOM manipulation (no state) is also compiler-clean.
- **Applies to**: plan, implement, impl-review

## Revoke anon SELECT on every new public table

- **Context**: Any Supabase migration that creates a table in the public schema
- **Problem**: Supabase grants `SELECT` to the `anon` role on public tables by default. Even with RLS enabled and no anon policies (which blocks rows), the table structure remains visible in the GraphQL schema to anyone using the public anon key — a schema-discoverability leak flagged by Supabase's security linter.
- **Rule**: After enabling RLS on a new table, immediately add `REVOKE SELECT ON TABLE <table> FROM anon;`. Add the corresponding `GRANT SELECT ON TABLE <table> TO anon;` to the rollback comment.
- **Applies to**: plan, implement, impl-review

## Every client handler for a mutating action must redirect to /auth/signin on 401

- **Context**: Any React component/island that calls a mutating API route (POST/PATCH/DELETE for create, rename, delete, reorder, etc.)
- **Problem**: API routes correctly return `401 { error: "Unauthorized" }` when `context.locals.user` is null (expired session). It's easy to spec the "primary" action's dialog (e.g. an Add or Rename dialog) with explicit `401 → window.location.href = "/auth/signin"` handling, then under-specify a sibling action (e.g. a Delete confirmation dialog or a "Save order" button) with only a generic `error → toast.error(...)` branch. The result: an expired session on that one action shows a confusing toast (often literally "Unauthorized") instead of sending the user to sign in, silently breaking any "any action redirects to /auth/signin on 401" success criterion.
- **Rule**: For every mutating action handler in a feature, check `res.status === 401` first and respond with `window.location.href = "/auth/signin"` — before any toast-based 400/409/500 handling. Apply this uniformly to _all_ action handlers (including destructive/confirmation-dialog actions and bulk/reorder actions), not just the first one written. When reviewing a plan, grep every fetch-based handler's contract for a `401 →` bullet and flag any that are missing one.
- **Exception**: A modal dialog that is only reachable from within an already-loaded, already-protected page — not a standalone route, not deep-linkable (e.g. an "Add X" dialog opened by a button click) — may fall through to its generic toast-based error handling on 401 instead of redirecting. The user is already on a protected page; the modal's own failure doesn't need to interrupt them with a navigation. This exception does **not** extend to inline handlers that are the primary way a user interacts with page content (e.g. a grid cell's per-cell edit or toggle) — those still redirect. (User-confirmed on `competition-results-core` plan review, finding F1 — `AddCompetitionDialog.tsx`.)
- **Applies to**: plan, implement, impl-review

## Explicitly revoke EXECUTE from `anon` on RPC functions meant for `authenticated` only

- **Context**: Any Supabase migration that defines an RPC function intended to be callable only by `authenticated` users (e.g. `soft_delete_dog`, `reorder_training_elements`)
- **Problem**: `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;` only removes the implicit PUBLIC-role grant. Postgres' default privileges (`pg_default_acl`) on the `public` schema separately grant `EXECUTE` to `anon`, `authenticated`, and `service_role` on every new function at creation time — so `anon` retains EXECUTE despite the revoke. Verified on both `soft_delete_dog` and `reorder_training_elements`: `anon_can_exec = true` after the standard `REVOKE ... FROM PUBLIC; GRANT ... TO authenticated;` pair.
- **Rule**: When an RPC is meant to be `authenticated`-only, add an explicit `REVOKE EXECUTE ON FUNCTION ... FROM anon;` alongside the `FROM PUBLIC` revoke (and from `service_role` too, unless service-role access is intended). Verify with `select has_function_privilege('anon', '<fn>(<args>)', 'EXECUTE')` — it should return `false`. This is defense-in-depth: RLS on the underlying tables usually makes an anon call a safe no-op anyway, but the misleading grant shouldn't be left in place, especially for `SECURITY DEFINER` functions where the EXECUTE grant is the primary boundary.
- **Applies to**: plan, implement, impl-review

## Always use braces for if-statements, with the body on its own line

- **Context**: Any if-statement, in any file (TS/TSX/Astro), across the codebase.
- **Problem**: Braceless if-statements or bodies written on the same line as the condition (`if (x) doThing();`) are easy to misread, error-prone when a second statement is later added inside the block, and produce noisy diffs.
- **Rule**: Always wrap if-statement bodies in braces `{ }`, and always place the body on a separate line from the `if (...)` condition — never `if (x) doThing();` on one line, even for single statements.
- **Applies to**: implement, impl-review

## Always register authenticated page routes in PROTECTED_ROUTES

- **Context**: Any new Astro page route for authenticated users (`src/pages/`)
- **Problem**: Without a central list, each new page has to self-guard instead of relying on the middleware's common redirect — easy to forget, and the omission is silent (the route just becomes publicly accessible).
- **Rule**: Always add new Astro page routes that require a logged-in user to `PROTECTED_ROUTES` in `src/middleware.ts`. The middleware's centralized redirect to `/auth/signin` only fires for paths explicitly listed there.
- **Applies to**: plan, implement, impl-review

## Ask before triaging — never self-classify a finding as "obvious" and decide alone

- **Context**: Triage of any findings list — any planning or review skill triaging multiple findings/decisions from a structured review (e.g. /10x-plan-review, /10x-impl-review) or any task with several open items to resolve.
- **Problem**: The assistant labeled some findings "low-impact/obvious" using the review's own severity tags and silently applied its own fix without asking — but the user disagreed with one of those classifications and had to stop and correct it after the fact, after downstream files were already touched.
- **Rule**: If there are any pending questions, unresolved issues, or gaps, or missing information / decisions — ask, and do not make your own decisions.
- **Applies to**: all
