-- Migration: create competition_scores table
-- One row per (competition, exercise) score, present only when that exercise
-- has been scored for that competition. An unscored exercise is the absence
-- of a row, not a NULL score — mirrors training_logs' presence-only model.
-- Unlike training_logs, scores are editable in place via upsert, so this
-- table (unlike any other dog-scoped table) needs an UPDATE policy and the
-- shared set_updated_at() trigger.
--
-- account_id is denormalized from the parent competition's account_id, for
-- the same O(1)-RLS-check + composite-index reasons as competitions itself.

CREATE TABLE competition_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid        NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  exercise_id    uuid        NOT NULL REFERENCES exercises(id),
  account_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score          numeric(4,2) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT competition_scores_competition_exercise_unique UNIQUE (competition_id, exercise_id),
  CONSTRAINT competition_scores_score_range_check
    CHECK (score >= 0 AND score <= 10 AND score * 4 = floor(score * 4))
);

-- Reuse the shared set_updated_at() trigger (defined in the dogs migration)
-- since scores are overwritten in place, unlike any other dog-scoped table.
CREATE TRIGGER competition_scores_set_updated_at
  BEFORE UPDATE ON competition_scores
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Enable row-level security
ALTER TABLE competition_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies (one per operation, role: authenticated). An upsert via
-- onConflict can take either the INSERT or UPDATE path, and DELETE supports
-- clearing a cell back to unscored.
-- (select auth.uid()) is evaluated once per statement, not once per row.
CREATE POLICY competition_scores_select_authenticated
  ON competition_scores FOR SELECT TO authenticated
  USING ((select auth.uid()) = account_id);

-- INSERT/UPDATE verify: account ownership, ownership of the parent
-- competition, and cross-FK consistency that exercise_id belongs to the same
-- class as the parent competition — the direct analog of training_logs'
-- "element's dog_id must match the row's own dog_id" check, preventing a
-- forged exerciseId from a different class corrupting an average.
CREATE POLICY competition_scores_insert_authenticated
  ON competition_scores FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = account_id
    AND EXISTS (
      SELECT 1 FROM competitions
      WHERE competitions.id = competition_id
        AND competitions.account_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM exercises
      JOIN competitions ON competitions.id = competition_id
      WHERE exercises.id = exercise_id
        AND exercises.class_number = competitions.class_number
    )
  );

CREATE POLICY competition_scores_update_authenticated
  ON competition_scores FOR UPDATE TO authenticated
  USING ((select auth.uid()) = account_id)
  WITH CHECK (
    (select auth.uid()) = account_id
    AND EXISTS (
      SELECT 1 FROM competitions
      WHERE competitions.id = competition_id
        AND competitions.account_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM exercises
      JOIN competitions ON competitions.id = competition_id
      WHERE exercises.id = exercise_id
        AND exercises.class_number = competitions.class_number
    )
  );

CREATE POLICY competition_scores_delete_authenticated
  ON competition_scores FOR DELETE TO authenticated
  USING ((select auth.uid()) = account_id);

-- Revoke anon SELECT so the table is not visible in the GraphQL schema without sign-in.
REVOKE SELECT ON TABLE competition_scores FROM anon;

-- Explicit grants for authenticated and service_role, inline in the creation
-- migration (per [[supabase_grants_service_role]] — do not retrofit later).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE competition_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE competition_scores TO service_role;

-- Composite index: covers the score-fetch-by-competition-ids query
CREATE INDEX competition_scores_account_competition_idx
  ON competition_scores (account_id, competition_id);

-- Rollback (execute in order to undo this migration):
-- DROP INDEX  IF EXISTS competition_scores_account_competition_idx;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE competition_scores FROM service_role;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE competition_scores FROM authenticated;
-- GRANT SELECT ON TABLE competition_scores TO anon;
-- DROP POLICY IF EXISTS competition_scores_delete_authenticated ON competition_scores;
-- DROP POLICY IF EXISTS competition_scores_update_authenticated ON competition_scores;
-- DROP POLICY IF EXISTS competition_scores_insert_authenticated ON competition_scores;
-- DROP POLICY IF EXISTS competition_scores_select_authenticated ON competition_scores;
-- DROP TRIGGER IF EXISTS competition_scores_set_updated_at ON competition_scores;
-- NOTE: set_updated_at() is a shared utility (CREATE OR REPLACE). Only drop it if no other
--       table's trigger references it.
-- DROP TABLE  IF EXISTS competition_scores;
