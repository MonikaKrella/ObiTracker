-- Migration: create competition reference data (competition_classes, exercises)
--
-- Fixed, non-user-editable rulebook data (FR-005, FR-006). Unlike every other table in
-- this app, this data is NOT account/dog-scoped: every authenticated user reads the same
-- 3 classes and 29 exercises. A rulebook revision is a manual, out-of-band migration —
-- no in-app admin editing exists or is planned for this data.

CREATE TABLE competition_classes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  sort_position smallint    NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT competition_classes_name_unique UNIQUE (name),
  CONSTRAINT competition_classes_sort_position_unique UNIQUE (sort_position)
);

CREATE TABLE exercises (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      uuid        NOT NULL REFERENCES competition_classes(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  shortcut      text        NOT NULL,
  multiplier    smallint    NOT NULL CHECK (multiplier > 0),
  sort_position smallint    NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT exercises_class_id_name_unique UNIQUE (class_id, name),
  CONSTRAINT exercises_class_id_sort_position_unique UNIQUE (class_id, sort_position)
);

-- Enable row-level security
ALTER TABLE competition_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises            ENABLE ROW LEVEL SECURITY;

-- RLS policies: SELECT-only, for authenticated. This data is global (not account-scoped),
-- so every authenticated user reads every row. No INSERT/UPDATE/DELETE policy exists for
-- any role — RLS's default-deny makes those operations impossible in-app, matching
-- FR-005's "not user-editable" requirement.
CREATE POLICY competition_classes_select_authenticated
  ON competition_classes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY exercises_select_authenticated
  ON exercises FOR SELECT TO authenticated
  USING (true);

-- Revoke anon SELECT so the tables are not visible in the GraphQL schema without sign-in.
REVOKE SELECT ON TABLE competition_classes FROM anon;
REVOKE SELECT ON TABLE exercises            FROM anon;

-- Explicit grants for authenticated and service_role (SELECT only — nothing in the app
-- ever writes these rows; only this migration does). GRANT USAGE ON SCHEMA public is
-- already in place for both roles from 20260718000001_explicit_grants.sql /
-- 20260719000001_service_role_table_grants.sql.
GRANT SELECT ON TABLE competition_classes TO authenticated;
GRANT SELECT ON TABLE exercises            TO authenticated;
GRANT SELECT ON TABLE competition_classes TO service_role;
GRANT SELECT ON TABLE exercises            TO service_role;

-- ---------------------------------------------------------------------------
-- Seed data — canonical, user-confirmed rulebook dataset (context/foundation/
-- post-mvp-features.md:11-44). Not admin-editable in-app; a rulebook revision
-- requires a new migration.
-- ---------------------------------------------------------------------------

INSERT INTO competition_classes (name, sort_position) VALUES
  ('Class 1', 1),
  ('Class 2', 2),
  ('Class 3', 3);

INSERT INTO exercises (class_id, name, shortcut, multiplier, sort_position)
SELECT competition_classes.id, v.name, v.shortcut, v.multiplier, v.sort_position
FROM competition_classes,
  (VALUES
    ('Sitting in a group', 'Group', 3, 1),
    ('Heelwork', 'Heelwork', 4, 2),
    ('Position under march', 'In march', 3, 3),
    ('Recall', 'Recall', 4, 4),
    ('Square', 'Box', 4, 5),
    ('Distance control', 'Dist.contr.', 4, 6),
    ('Retrieve and jumping over a hurdle', 'Retrieve', 4, 7),
    ('Go around cones', 'Cones', 4, 8),
    ('General impression', 'Impression', 2, 9)
  ) AS v(name, shortcut, multiplier, sort_position)
WHERE competition_classes.name = 'Class 1';

INSERT INTO exercises (class_id, name, shortcut, multiplier, sort_position)
SELECT competition_classes.id, v.name, v.shortcut, v.multiplier, v.sort_position
FROM competition_classes,
  (VALUES
    ('Lying in a group', 'Group', 3, 1),
    ('Heelwork', 'Heelwork', 4, 2),
    ('Positions under march', 'In march', 3, 3),
    ('Recall with stop', 'Recall', 3, 4),
    ('Square', 'Box', 4, 5),
    ('Directed retrieve', 'Dir.Retrieve', 3, 6),
    ('Scent discrimination', 'Scent', 3, 7),
    ('Distance control', 'Dist.contr.', 4, 8),
    ('Send around cones, stop and jump', '3.8', 3, 9),
    ('General impression', 'Impression', 2, 10)
  ) AS v(name, shortcut, multiplier, sort_position)
WHERE competition_classes.name = 'Class 2';

INSERT INTO exercises (class_id, name, shortcut, multiplier, sort_position)
SELECT competition_classes.id, v.name, v.shortcut, v.multiplier, v.sort_position
FROM competition_classes,
  (VALUES
    ('Sitting in a group', 'Group-sit', 2, 1),
    ('Lying in a group and recall', 'Group-down', 2, 2),
    ('Heelwork', 'Heelwork', 4, 3),
    ('Positions under march', 'In march', 3, 4),
    ('Recall', 'Recall', 3, 5),
    ('Square', 'Box', 4, 6),
    ('Directed retrieve', 'Dir.Retreive', 3, 7),
    ('Send around cones, stop, retrieve and jump', '3.8', 4, 8),
    ('Scent discrimination', 'Scent', 3, 9),
    ('Distance control', 'Dist.contr.', 4, 10)
  ) AS v(name, shortcut, multiplier, sort_position)
WHERE competition_classes.name = 'Class 3';

-- Rollback (execute in order to undo this migration):
-- DELETE FROM exercises;
-- DELETE FROM competition_classes;
-- REVOKE SELECT ON TABLE competition_classes FROM service_role;
-- REVOKE SELECT ON TABLE exercises            FROM service_role;
-- REVOKE SELECT ON TABLE competition_classes FROM authenticated;
-- REVOKE SELECT ON TABLE exercises            FROM authenticated;
-- GRANT  SELECT ON TABLE competition_classes TO anon;
-- GRANT  SELECT ON TABLE exercises            TO anon;
-- DROP POLICY IF EXISTS exercises_select_authenticated            ON exercises;
-- DROP POLICY IF EXISTS competition_classes_select_authenticated ON competition_classes;
-- DROP TABLE IF EXISTS exercises;
-- DROP TABLE IF EXISTS competition_classes;
