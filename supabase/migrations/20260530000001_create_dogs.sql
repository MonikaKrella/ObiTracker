-- Migration: create dogs table
-- Dogs are the root of the ownership chain. Every other table traces
-- its account_id lineage back through this table.

CREATE TABLE dogs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Enable row-level security
ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;

-- RLS policies (one per operation, role: authenticated)
-- (select auth.uid()) is evaluated once per statement, not once per row.
CREATE POLICY dogs_select_authenticated
  ON dogs FOR SELECT TO authenticated
  USING ((select auth.uid()) = account_id);

CREATE POLICY dogs_insert_authenticated
  ON dogs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = account_id);

CREATE POLICY dogs_update_authenticated
  ON dogs FOR UPDATE TO authenticated
  USING ((select auth.uid()) = account_id)
  WITH CHECK ((select auth.uid()) = account_id);

CREATE POLICY dogs_delete_authenticated
  ON dogs FOR DELETE TO authenticated
  USING ((select auth.uid()) = account_id);

-- Revoke anon SELECT so the table is not visible in the GraphQL schema without sign-in.
-- RLS-on + no anon policy already blocks rows; this removes schema discoverability too.
REVOKE SELECT ON TABLE dogs FROM anon;

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dogs_set_updated_at
  BEFORE UPDATE ON dogs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Rollback (execute in order to undo this migration):
-- DROP TRIGGER  IF EXISTS dogs_set_updated_at ON dogs;
-- NOTE: set_updated_at() is a shared utility (CREATE OR REPLACE). Only drop it if no other
--       table's trigger references it. If this is the last migration using it:
--       DROP FUNCTION IF EXISTS set_updated_at();
-- DROP POLICY   IF EXISTS dogs_delete_authenticated ON dogs;
-- DROP POLICY   IF EXISTS dogs_update_authenticated ON dogs;
-- DROP POLICY   IF EXISTS dogs_insert_authenticated ON dogs;
-- DROP POLICY   IF EXISTS dogs_select_authenticated ON dogs;
-- GRANT SELECT ON TABLE dogs TO anon;
-- DROP TABLE    IF EXISTS dogs;
