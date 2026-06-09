-- Migration: add soft_delete_dog RPC function
--
-- Why a SECURITY DEFINER function is required:
-- The SELECT RLS policy on `dogs` filters `is_deleted = FALSE`. PostgreSQL also
-- validates the *new* row values against the SELECT policy when an UPDATE is
-- executed via PostgREST. After setting is_deleted = TRUE the row fails that
-- filter, causing "new row violates row-level security policy".
-- SECURITY DEFINER bypasses this check; ownership is enforced explicitly in
-- the WHERE clause so no privilege is actually escalated.
--
-- auth.uid() reads from the JWT session variable (request.jwt.claims) which
-- is always set by Supabase regardless of the function's execution context.

CREATE OR REPLACE FUNCTION soft_delete_dog(p_dog_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.dogs
  SET
    is_deleted = TRUE,
    deleted_at = NOW()
  WHERE id          = p_dog_id
    AND account_id  = (SELECT auth.uid())
    AND is_deleted  = FALSE;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- Restrict execution to authenticated users only.
REVOKE EXECUTE ON FUNCTION soft_delete_dog(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION soft_delete_dog(uuid) TO authenticated;

-- Rollback:
-- REVOKE EXECUTE ON FUNCTION soft_delete_dog(uuid) FROM authenticated;
-- DROP FUNCTION IF EXISTS soft_delete_dog(uuid);
