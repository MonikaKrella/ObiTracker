-- Migration: explicit table grants for authenticated role
--
-- Supabase's hosted platform automatically grants table access to the
-- authenticated and anon roles. The local CLI (supabase start) applies
-- these same defaults at startup — but only from its own initialisation
-- scripts, not from migrations. In a fresh CI environment those scripts
-- may not run, leaving authenticated with no GRANT on any table, so every
-- query fails with "permission denied" before even reaching an RLS check.
--
-- Declaring the grants explicitly here makes the migration set self-contained
-- and deterministic across local dev, CI, and hosted environments.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dogs               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE training_elements  TO authenticated;
GRANT SELECT, INSERT,         DELETE ON TABLE training_logs      TO authenticated;

-- Rollback:
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE dogs              FROM authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE training_elements FROM authenticated;
-- REVOKE SELECT, INSERT,         DELETE ON TABLE training_logs     FROM authenticated;
-- REVOKE USAGE ON SCHEMA public FROM authenticated;
