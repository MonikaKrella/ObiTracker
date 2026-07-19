-- Migration: explicit table grants for service_role
--
-- service_role has BYPASSRLS, which skips row-level security policies, but
-- Postgres still enforces ordinary table-level GRANTs independently of RLS.
-- Supabase's hosted platform grants service_role full table access as part
-- of its own project bootstrap; the local CLI applies the same defaults at
-- `supabase start` — but, as with the authenticated grants added in
-- 20260718000001_explicit_grants.sql, this appears to depend on state that
-- isn't guaranteed to exist in a freshly provisioned CI database, leaving
-- service_role with no GRANT on tables created by later migrations.
--
-- Declaring the grants explicitly here makes the migration set self-contained
-- and deterministic across local dev, CI, and hosted environments.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dogs               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE training_elements  TO service_role;
GRANT SELECT, INSERT,         DELETE ON TABLE training_logs      TO service_role;

-- Rollback:
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE dogs              FROM service_role;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE training_elements FROM service_role;
-- REVOKE SELECT, INSERT,         DELETE ON TABLE training_logs     FROM service_role;
-- REVOKE USAGE ON SCHEMA public FROM service_role;
