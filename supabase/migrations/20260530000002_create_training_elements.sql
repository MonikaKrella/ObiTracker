-- Migration: create training_elements table
-- Training elements belong to a dog. They have no account_id column;
-- ownership is resolved via an EXISTS subquery on dogs in every RLS policy.

CREATE TABLE training_elements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id        uuid        NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  sort_position integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT training_elements_dog_id_name_unique UNIQUE (dog_id, name)
);

-- Enable row-level security
ALTER TABLE training_elements ENABLE ROW LEVEL SECURITY;

-- RLS policies (one per operation, role: authenticated)
-- Ownership check: element's dog must belong to the current user.
-- (select auth.uid()) is evaluated once per statement, not once per row.
CREATE POLICY training_elements_select_authenticated
  ON training_elements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM dogs
    WHERE dogs.id = dog_id
      AND dogs.account_id = (select auth.uid())
  ));

CREATE POLICY training_elements_insert_authenticated
  ON training_elements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM dogs
    WHERE dogs.id = dog_id
      AND dogs.account_id = (select auth.uid())
  ));

CREATE POLICY training_elements_update_authenticated
  ON training_elements FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM dogs
    WHERE dogs.id = dog_id
      AND dogs.account_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM dogs
    WHERE dogs.id = dog_id
      AND dogs.account_id = (select auth.uid())
  ));

CREATE POLICY training_elements_delete_authenticated
  ON training_elements FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM dogs
    WHERE dogs.id = dog_id
      AND dogs.account_id = (select auth.uid())
  ));

-- Revoke anon SELECT so the table is not visible in the GraphQL schema without sign-in.
REVOKE SELECT ON TABLE training_elements FROM anon;

-- Rollback (execute in order to undo this migration):
-- DROP POLICY IF EXISTS training_elements_delete_authenticated ON training_elements;
-- DROP POLICY IF EXISTS training_elements_update_authenticated ON training_elements;
-- DROP POLICY IF EXISTS training_elements_insert_authenticated ON training_elements;
-- DROP POLICY IF EXISTS training_elements_select_authenticated ON training_elements;
-- GRANT SELECT ON TABLE training_elements TO anon;
-- DROP TABLE  IF EXISTS training_elements;
