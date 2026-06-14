-- Migration: add reorder_training_elements RPC function
--
-- Persists a full reordering of a dog's training elements in one atomic
-- round trip.
--
-- Unlike soft_delete_dog, this function does NOT need SECURITY DEFINER:
-- sort_position is not referenced by any training_elements RLS policy, so
-- the existing training_elements_update_authenticated USING/WITH CHECK
-- clauses (ownership via the dogs EXISTS check) scope the loop's UPDATEs
-- correctly on their own. A dog_id the caller doesn't own simply matches
-- zero rows — a safe no-op.

CREATE OR REPLACE FUNCTION reorder_training_elements(p_dog_id uuid, p_element_ids uuid[])
  RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE training_elements AS te
  SET sort_position = ord.idx - 1
  FROM unnest(p_element_ids) WITH ORDINALITY AS ord(id, idx)
  WHERE te.id = ord.id AND te.dog_id = p_dog_id;
END;
$$;

-- Restrict execution to authenticated users only.
REVOKE EXECUTE ON FUNCTION reorder_training_elements(uuid, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reorder_training_elements(uuid, uuid[]) TO authenticated;

-- Rollback:
-- REVOKE EXECUTE ON FUNCTION reorder_training_elements(uuid, uuid[]) FROM authenticated;
-- DROP FUNCTION IF EXISTS reorder_training_elements(uuid, uuid[]);
