-- Migration: add class_number to competition_classes
--
-- Dedicated rulebook class-number column, distinct from sort_position (display
-- order). Backfilled to match sort_position for the existing 3 seeded rows,
-- since today the rulebook class number and the display order are the same
-- (Class 1/2/3 -> 1/2/3), but the two are conceptually independent.

ALTER TABLE competition_classes ADD COLUMN class_number smallint;

UPDATE competition_classes SET class_number = sort_position;

ALTER TABLE competition_classes ALTER COLUMN class_number SET NOT NULL;
ALTER TABLE competition_classes
  ADD CONSTRAINT competition_classes_class_number_unique UNIQUE (class_number);

-- Rollback (execute in order to undo this migration):
-- ALTER TABLE competition_classes DROP CONSTRAINT IF EXISTS competition_classes_class_number_unique;
-- ALTER TABLE competition_classes DROP COLUMN IF EXISTS class_number;
