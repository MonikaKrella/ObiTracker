<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Database Schema Implementation Plan (F-01)

- **Plan**: `context/changes/db-schema/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-30
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

7/7 paths ✓, 3/3 symbols ✓, brief↔plan ✓

`supabase/config.toml` ✓ (sql_paths + enabled = true confirmed), `supabase/migrations/` absent ✓, `src/lib/supabase.ts` null-return confirmed at line 6, `src/env.d.ts` ✓ (Locals-only; no conflict), `src/types.ts` absent ✓, `supabase/seed.sql` absent ✓, `context/foundation/roadmap.md` F-01 ✓. Blast-radius check on `@/types` imports: zero existing consumers. CLI v2.101.0 source-verified: missing seed file prints `WARN:` to stderr and exits 0 — Phase 1→Phase 2 ordering is safe.

## Findings

### F1 — training_logs INSERT policy doesn't verify dog_id ownership

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Schema Reference → training_logs RLS policies
- **Detail**: The INSERT policy is `WITH CHECK (account_id = auth.uid())`. This prevents writing rows on behalf of another user but does NOT verify that `dog_id` belongs to `auth.uid()`. A user who knows a foreign dog's UUID (not guessable via the API since dogs SELECT is also RLS-restricted) could insert a training_log with their own account_id pointing to a foreign dog_id. The row passes the INSERT check, would appear in their SELECT results, and creates inconsistent denormalized data. Risk is low in practice (UUID opacity; no sharing UI; no enumeration path), but the integrity guarantee is weaker than it could be. The plan chose the direct `account_id = auth.uid()` check deliberately for O(1) RLS performance on SELECT and DELETE; adding the ownership check only to INSERT closes the hole while keeping hot-path checks fast.
- **Fix**: Extend the INSERT `WITH CHECK` to:
  ```sql
  WITH CHECK (
    account_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = dog_id
        AND dogs.account_id = auth.uid()
    )
  )
  ```
  SELECT and DELETE policies stay as-is. INSERT fires rarely relative to SELECT, so the one correlated subquery there is negligible.
- **Decision**: FIXED — extended INSERT WITH CHECK to validate dog_id ownership via EXISTS subquery on dogs
