-- Migration: create competition reference data (exercises)
--
-- Fixed, non-user-editable rulebook data (FR-005, FR-006). Unlike every other table in
-- this app, this data is NOT account/dog-scoped: every authenticated user reads the same
-- 29 exercises. A rulebook revision is a manual, out-of-band migration — no in-app admin
-- editing exists or is planned for this data.
--
-- `class_number` (1/2/3, CHECK-validated) is the class linkage directly on this table —
-- there is no separate `competition_classes` lookup table. Class display metadata
-- (name, sort_position) lives in application code (`src/const.ts`), not the database,
-- since it's identical across every environment and never written by the app.

CREATE TABLE exercises (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_number  smallint    NOT NULL CHECK (class_number IN (1, 2, 3)),
  name          text        NOT NULL,
  shortcut      text        NOT NULL,
  multiplier    smallint    NOT NULL CHECK (multiplier > 0),
  sort_position smallint    NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT exercises_class_number_name_unique UNIQUE (class_number, name),
  CONSTRAINT exercises_class_number_sort_position_unique UNIQUE (class_number, sort_position)
);

-- Enable row-level security
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- RLS policy: SELECT-only, for authenticated. This data is global (not account-scoped),
-- so every authenticated user reads every row. No INSERT/UPDATE/DELETE policy exists for
-- any role — RLS's default-deny makes those operations impossible in-app, matching
-- FR-005's "not user-editable" requirement.
CREATE POLICY exercises_select_authenticated
  ON exercises FOR SELECT TO authenticated
  USING (true);

-- Revoke anon SELECT so the table is not visible in the GraphQL schema without sign-in.
REVOKE SELECT ON TABLE exercises FROM anon;

-- Explicit grants for authenticated and service_role (SELECT only — nothing in the app
-- ever writes these rows; only this migration does). GRANT USAGE ON SCHEMA public is
-- already in place for both roles from 20260718000001_explicit_grants.sql /
-- 20260719000001_service_role_table_grants.sql.
GRANT SELECT ON TABLE exercises TO authenticated;
GRANT SELECT ON TABLE exercises TO service_role;

-- ---------------------------------------------------------------------------
-- Seed data — canonical, user-confirmed rulebook dataset (context/foundation/
-- post-mvp-features.md:11-44). Not admin-editable in-app; a rulebook revision
-- requires a new migration.
-- ---------------------------------------------------------------------------

INSERT INTO exercises (class_number, name, shortcut, multiplier, sort_position) VALUES
  (1, 'Sitting in a group', 'Group', 3, 1),
  (1, 'Heelwork', 'Heelwork', 4, 2),
  (1, 'Position under march', 'In march', 3, 3),
  (1, 'Recall', 'Recall', 4, 4),
  (1, 'Sending to box', 'Box', 4, 5),
  (1, 'Distance control', 'Dist.contr.', 4, 6),
  (1, 'Retrieve and jumping over a hurdle', 'Retrieve', 4, 7),
  (1, 'Go around cones', 'Cones', 4, 8),
  (1, 'General impression', 'Impression', 2, 9);

INSERT INTO exercises (class_number, name, shortcut, multiplier, sort_position) VALUES
  (2, 'Lying in a group', 'Group', 3, 1),
  (2, 'Heelwork', 'Heelwork', 4, 2),
  (2, 'Positions under march', 'In march', 3, 3),
  (2, 'Recall with stop', 'Recall', 3, 4),
  (2, 'Sending to box', 'Box', 4, 5),
  (2, 'Directed retrieve', 'Dir.Retrieve', 3, 6),
  (2, 'Scent discrimination', 'Scent', 3, 7),
  (2, 'Distance control', 'Dist.contr.', 4, 8),
  (2, 'Send around cones, stop and jump', '3.8', 3, 9),
  (2, 'General impression', 'Impression', 2, 10);

INSERT INTO exercises (class_number, name, shortcut, multiplier, sort_position) VALUES
  (3, 'Sitting in a group', 'Group-sit', 2, 1),
  (3, 'Lying in a group and recall', 'Group-down', 2, 2),
  (3, 'Heelwork', 'Heelwork', 4, 3),
  (3, 'Positions under march', 'In march', 3, 4),
  (3, 'Recall', 'Recall', 3, 5),
  (3, 'Sending to box', 'Box', 4, 6),
  (3, 'Directed retrieve', 'Dir.Retreive', 3, 7),
  (3, 'Send around cones, stop, retrieve and jump', '3.8', 4, 8),
  (3, 'Scent discrimination', 'Scent', 3, 9),
  (3, 'Distance control', 'Dist.contr.', 4, 10);

-- Rollback (execute in order to undo this migration):
-- DELETE FROM exercises;
-- REVOKE SELECT ON TABLE exercises FROM service_role;
-- REVOKE SELECT ON TABLE exercises FROM authenticated;
-- GRANT  SELECT ON TABLE exercises TO anon;
-- DROP POLICY IF EXISTS exercises_select_authenticated ON exercises;
-- DROP TABLE IF EXISTS exercises;
