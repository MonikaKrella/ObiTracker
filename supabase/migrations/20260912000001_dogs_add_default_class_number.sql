-- Migration: add default_class_number to dogs
--
-- Stores which competition class (if any) is the handler's marked default for this dog
-- (FR-008). NULL means "never marked" — the application layer falls back to Class 3 in
-- that case; the DB does not default this to 3, since "unmarked" and "explicitly
-- defaulted to Class 3" are the same effective behavior but distinct write paths (only
-- the former is the column's initial state).
--
-- Same literal set as exercises.class_number / competitions.class_number
-- (20260903000001_create_competition_reference_data.sql) — no FK to a lookup table.
--
-- No RLS policy or grant changes: dogs_update_authenticated (20260530000001_create_dogs.sql)
-- and the service_role grant on dogs (20260719000001_service_role_table_grants.sql) already
-- cover UPDATE on this new column.

ALTER TABLE dogs
  ADD COLUMN default_class_number smallint NULL CHECK (default_class_number IS NULL OR default_class_number IN (1, 2, 3));

-- Rollback:
-- ALTER TABLE dogs DROP COLUMN IF EXISTS default_class_number;
