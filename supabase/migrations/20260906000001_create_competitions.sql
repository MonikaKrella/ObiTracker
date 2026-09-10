-- Migration: create competitions table
-- One row per (dog, class, date) competition entry. Add-only this slice — no
-- edit path exists (competed_on is immutable, no UPDATE policy), and no
-- delete UI/API route exists either.
--
-- account_id is denormalized from dogs.account_id, mirroring training_logs:
--   1. Enables the (account_id, dog_id, class_number, competed_on) composite
--      index the window-filtered averaging/highlighting read path needs.
--   2. Allows an O(1) RLS check on SELECT/DELETE instead of a multi-hop JOIN.
-- App code must always populate dog_id, class_number, and account_id consistently.
--
-- DELETE policy/grant are included now (CLAUDE.md's one-policy-per-operation
-- convention), even though no delete UI/API route exists this slice. This is
-- a live, direct-API-only capability until roadmap slice S-07 adds a
-- confirmation UX around it — user-confirmed accepted risk (see
-- context/changes/competition-results-core/plan.md, "What We're NOT Doing").

CREATE TABLE competitions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id      uuid        NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  class_number smallint   NOT NULL CHECK (class_number IN (1, 2, 3)),
  account_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competed_on date        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT competitions_dog_class_date_unique UNIQUE (dog_id, class_number, competed_on)
);

-- Enable row-level security
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;

-- RLS policies (one per operation, role: authenticated — no UPDATE by design,
-- a competition's date is immutable in this slice, no edit path exists).
-- (select auth.uid()) is evaluated once per statement, not once per row.
CREATE POLICY competitions_select_authenticated
  ON competitions FOR SELECT TO authenticated
  USING ((select auth.uid()) = account_id);

-- INSERT verifies account ownership and dog_id ownership, mirroring
-- training_logs_insert_authenticated's ownership-consistency check.
CREATE POLICY competitions_insert_authenticated
  ON competitions FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = account_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = dog_id
        AND dogs.account_id = (select auth.uid())
    )
  );

CREATE POLICY competitions_delete_authenticated
  ON competitions FOR DELETE TO authenticated
  USING ((select auth.uid()) = account_id);

-- Revoke anon SELECT so the table is not visible in the GraphQL schema without sign-in.
REVOKE SELECT ON TABLE competitions FROM anon;

-- Explicit grants for authenticated and service_role, inline in the creation
-- migration (per [[supabase_grants_service_role]] — do not retrofit later).
GRANT SELECT, INSERT, DELETE ON TABLE competitions TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE competitions TO service_role;

-- Composite index: covers the window-filtered query (competitions per dog+class within a date range)
CREATE INDEX competitions_account_dog_class_date_idx
  ON competitions (account_id, dog_id, class_number, competed_on);

-- Rollback (execute in order to undo this migration):
-- DROP INDEX  IF EXISTS competitions_account_dog_class_date_idx;
-- REVOKE SELECT, INSERT, DELETE ON TABLE competitions FROM service_role;
-- REVOKE SELECT, INSERT, DELETE ON TABLE competitions FROM authenticated;
-- GRANT SELECT ON TABLE competitions TO anon;
-- DROP POLICY IF EXISTS competitions_delete_authenticated ON competitions;
-- DROP POLICY IF EXISTS competitions_insert_authenticated ON competitions;
-- DROP POLICY IF EXISTS competitions_select_authenticated ON competitions;
-- DROP TABLE  IF EXISTS competitions;
