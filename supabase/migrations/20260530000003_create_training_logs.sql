-- Migration: create training_logs table
-- Presence-only model: a row = one tick (element trained on a given day).
-- Insert = tick, delete = untick. No UPDATE policy.
--
-- account_id is denormalized from dogs.account_id for two reasons:
--   1. Enables the (account_id, dog_id, trained_on) composite index the
--      highlight algorithm depends on.
--   2. Allows an O(1) RLS check on SELECT/DELETE instead of a multi-hop JOIN.
-- App code must always populate element_id, dog_id, and account_id consistently.

CREATE TABLE training_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id uuid NOT NULL REFERENCES training_elements(id) ON DELETE CASCADE,
  dog_id     uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trained_on date NOT NULL,
  CONSTRAINT training_logs_element_id_trained_on_unique UNIQUE (element_id, trained_on)
);

-- Enable row-level security
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies (one per operation, role: authenticated — no UPDATE by design)
-- (select auth.uid()) is evaluated once per statement, not once per row.
CREATE POLICY training_logs_select_authenticated
  ON training_logs FOR SELECT TO authenticated
  USING ((select auth.uid()) = account_id);

-- INSERT verifies account ownership, dog_id ownership, and element-to-dog consistency.
-- The third clause ensures element_id actually belongs to the dog referenced by dog_id,
-- preventing intra-account data corruption (e.g. a log row whose element belongs to dog A
-- but dog_id points to dog B, which would silently corrupt per-dog training counts).
CREATE POLICY training_logs_insert_authenticated
  ON training_logs FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = account_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = dog_id
        AND dogs.account_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM training_elements
      WHERE training_elements.id = element_id
        AND training_elements.dog_id = dog_id
    )
  );

CREATE POLICY training_logs_delete_authenticated
  ON training_logs FOR DELETE TO authenticated
  USING ((select auth.uid()) = account_id);

-- Revoke anon SELECT so the table is not visible in the GraphQL schema without sign-in.
REVOKE SELECT ON TABLE training_logs FROM anon;

-- Composite index: covers the highlight-algorithm query (tick counts per dog within a date window)
CREATE INDEX training_logs_account_dog_date_idx
  ON training_logs (account_id, dog_id, trained_on);

-- Rollback (execute in order to undo this migration):
-- DROP INDEX  IF EXISTS training_logs_account_dog_date_idx;
-- DROP POLICY IF EXISTS training_logs_delete_authenticated ON training_logs;
-- DROP POLICY IF EXISTS training_logs_insert_authenticated ON training_logs;
-- DROP POLICY IF EXISTS training_logs_select_authenticated ON training_logs;
-- GRANT SELECT ON TABLE training_logs TO anon;
-- DROP TABLE  IF EXISTS training_logs;
