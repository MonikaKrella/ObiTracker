/**
 * Competition class display metadata — fixed rulebook data (FR-005/FR-006),
 * never written by the app. `class_number` is the DB's direct, CHECK-validated
 * linkage on `exercises`/`competitions`; this array is the only place name/
 * sort_position live — there is no DB-backed classes lookup table.
 */
export const COMPETITION_CLASSES = [
  { class_number: 1, name: "Class 1", sort_position: 1 },
  { class_number: 2, name: "Class 2", sort_position: 2 },
  { class_number: 3, name: "Class 3", sort_position: 3 },
] as const;

export type CompetitionClassNumber = (typeof COMPETITION_CLASSES)[number]["class_number"];
