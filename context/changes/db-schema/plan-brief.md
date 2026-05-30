# Database Schema — Plan Brief

> Full plan: `context/changes/db-schema/plan.md`

## What & Why

Create the three core Supabase tables (`dogs`, `training_elements`, `training_logs`) with row-level
security, constraints, an index, and matching TypeScript types. This is foundation slice F-01 —
nothing in S-02 (dog management), S-03 (training elements), or S-04 (training grid) can start
until these tables exist and the RLS is verified correct.

## Starting Point

No custom migrations exist yet. Only `auth.users` (Supabase built-in) is in use. `src/lib/supabase.ts`
already creates an SSR client; it just has no custom tables to query.

## Desired End State

Running `npx supabase db reset` applies three migrations cleanly. Supabase Studio shows all three
tables with correct columns and policies. `src/types.ts` exports typed interfaces downstream slices
can import immediately. The schema is the single source of truth for the data model going forward.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Naming convention | snake_case for tables + columns | Postgres default; no quoting needed anywhere | Plan |
| Tick data model | Presence-only rows (insert = tick, delete = untick) | Matches FR-006 ("records presence only"); simplest read path (`COUNT(*)`) | Plan |
| `training_logs.account_id` | Denormalized from `dogs.account_id` | Enables direct RLS check + `(account_id, dog_id, trained_on)` index without a JOIN | Plan |
| Index on `training_logs` | `(account_id, dog_id, trained_on)` | Covers the highlight-algorithm query: all tick counts for a dog within a date window | Plan |
| Element ordering | `sort_position integer` column | Handler can reorder elements; reorder UI/API lands in S-03 | Plan |
| Element name uniqueness | `UNIQUE(dog_id, name)` | Prevents two identically named rows confusing the grid | Plan |
| anon role policies | Implicit deny (no policies written) | RLS-on + no policy = deny; explicit DENY boilerplate adds zero security | Plan |
| TypeScript types | Hand-written in `src/types.ts` | No CLI step, no generated file; fits small-scale project | Plan |
| Rollback SQL | Commented block at bottom of each file | Documents revert intent without adding CLI complexity | Plan |
| Scope boundary | Migrations + TS types only (no service layer) | Service functions belong to S-02/S-03/S-04 which define the call patterns | Plan |

## Scope

**In scope:**
- `supabase/migrations/` directory with 3 SQL files
- RLS enabled + 4 policies on `dogs`, 4 on `training_elements`, 3 on `training_logs`
- `(account_id, dog_id, trained_on)` index on `training_logs`
- `src/types.ts` — entity interfaces + DTO types
- `supabase/seed.sql` — commented placeholder

**Out of scope:**
- Service layer (`src/lib/services/`) — downstream slices
- `updated_at` trigger — app code updates it on rename
- User-orderable reorder API — S-03
- Competition results tables — v2
- `anon` role explicit deny policies — implicit deny is sufficient

## Architecture / Approach

Three tables in dependency order: `dogs` (root of ownership chain, carries `account_id`) →
`training_elements` (FK to `dogs`, `sort_position` for future reorder) → `training_logs`
(FKs to both + denormalized `account_id` for efficient index + RLS). All tables have RLS on.
`dogs` and `training_logs` RLS checks `account_id = auth.uid()` directly; `training_elements`
checks via `EXISTS (SELECT 1 FROM dogs WHERE …)`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database migrations | 3 SQL files, RLS live, index present | Misconfigured RLS policy silently allows cross-account reads — caught by the two-user spot-check in manual verification |
| 2. TypeScript types + seed | `src/types.ts` importable, `seed.sql` placeholder | Types drifting from schema if a future migration isn't reflected here |

**Prerequisites:** Local Supabase CLI installed and `npx supabase start` able to run  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- `training_logs.account_id` must always match `dogs.account_id` for the same dog — no FK between the two enforces this; app code (INSERT path in S-04) is the only guard.
- `sort_position DEFAULT 0` means all initial elements share the same sort value; S-03 must assign unique positions on creation to make ordering deterministic from day one.

## Success Criteria (Summary)

- `npx supabase db reset` applies cleanly; Studio shows 3 tables with correct schema and 4 / 4 / 3 policies
- Two-user RLS spot-check confirms cross-account isolation
- `npm run build` passes with `src/types.ts` in place
