# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use (select auth.uid()) in RLS policies, not auth.uid() directly

- **Context**: Any Supabase migration that defines RLS policies
- **Problem**: Using `auth.uid()` directly causes it to be evaluated once per row and triggers Supabase linter DB warnings about non-optimal policy expressions.
- **Rule**: Use `(select auth.uid())` in RLS policy expressions instead of `auth.uid()` directly. The subquery form is evaluated once per statement, not once per row, eliminating the linter warning and improving performance.
- **Applies to**: plan, implement, impl-review

## Revoke anon SELECT on every new public table

- **Context**: Any Supabase migration that creates a table in the public schema
- **Problem**: Supabase grants `SELECT` to the `anon` role on public tables by default. Even with RLS enabled and no anon policies (which blocks rows), the table structure remains visible in the GraphQL schema to anyone using the public anon key — a schema-discoverability leak flagged by Supabase's security linter.
- **Rule**: After enabling RLS on a new table, immediately add `REVOKE SELECT ON TABLE <table> FROM anon;`. Add the corresponding `GRANT SELECT ON TABLE <table> TO anon;` to the rollback comment.
- **Applies to**: plan, implement, impl-review
