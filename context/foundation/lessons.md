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
- **Rule**: For every mutating action handler in a feature, check `res.status === 401` first and respond with `window.location.href = "/auth/signin"` — before any toast-based 400/409/500 handling. Apply this uniformly to *all* action handlers (including destructive/confirmation-dialog actions and bulk/reorder actions), not just the first one written. When reviewing a plan, grep every fetch-based handler's contract for a `401 →` bullet and flag any that are missing one.
- **Applies to**: plan, implement, impl-review
