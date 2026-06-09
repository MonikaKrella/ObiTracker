-- Migration: add soft-delete columns to dogs and tighten SELECT RLS policy
-- Adds is_deleted and deleted_at to support soft delete (S-02).
-- The existing SELECT policy is dropped and recreated to filter out deleted dogs
-- at the RLS level so soft-deleted rows are invisible to all authenticated queries.

ALTER TABLE dogs ADD COLUMN is_deleted boolean NOT NULL DEFAULT FALSE;
ALTER TABLE dogs ADD COLUMN deleted_at timestamptz NULL;

-- Drop the old SELECT policy (no is_deleted filter) and replace it.
DROP POLICY dogs_select_authenticated ON dogs;

-- (select auth.uid()) is evaluated once per statement, not once per row.
CREATE POLICY dogs_select_authenticated
  ON dogs FOR SELECT TO authenticated
  USING ((select auth.uid()) = account_id AND is_deleted = FALSE);

-- Rollback (execute in order to undo this migration):
-- DROP POLICY   IF EXISTS dogs_select_authenticated ON dogs;
-- CREATE POLICY dogs_select_authenticated
--   ON dogs FOR SELECT TO authenticated
--   USING ((select auth.uid()) = account_id);
-- ALTER TABLE dogs DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE dogs DROP COLUMN IF EXISTS is_deleted;
