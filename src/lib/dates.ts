/**
 * SSR-deterministic, testable date-window math shared by the training grid's
 * Astro page and the toggle API route's date guard.
 *
 * All dates are UTC calendar dates as "YYYY-MM-DD" strings (no per-user
 * timezone handling — see context/changes/training-grid/research.md Q4).
 */

/**
 * Returns the ISO date bounds for a rolling window ending at `today` (inclusive).
 * Accepts `today` as a parameter for SSR determinism and testability.
 */
export function getTrainingWindow(
  windowDays: number,
  today: Date = new Date(),
): { startDate: string; endDate: string } {
  const endDate = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

/**
 * Generates the ascending list of "YYYY-MM-DD" dates in a rolling window
 * ending at `today` (inclusive). Index 0 is the oldest date, the last index
 * is `today`.
 */
export function generateDateRange(windowDays: number, today: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${today}T00:00:00Z`);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Returns true when `dateStr` is strictly later than the request-time UTC
 * "today" — pure lexical string comparison, no `Date` parsing needed, since
 * "YYYY-MM-DD" strings compare correctly with `<=`/`>`.
 */
export function isFutureUtcDate(dateStr: string, today: Date = new Date()): boolean {
  const todayStr = today.toISOString().slice(0, 10);
  return dateStr > todayStr;
}

/**
 * Formats a "YYYY-MM-DD" string as "DD.MM" for column headers
 * (e.g. "2026-05-21" → "21.05"). Pure string slicing, no `Date` parsing.
 */
export function formatHeaderDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}.${month}`;
}
