import type { CompetitionTimeWindow } from "@/lib/dates";

/**
 * The all-time/last-year/last-6-months time-window selector's shared
 * constants. Imported by both `competition-results.astro` (to resolve the
 * SSR-rendered initial window from the persisted cookie) and
 * `CompetitionResultsGrid.tsx` (to render the selector and persist a new
 * choice) — kept in one place so the two never drift. Mirrors
 * `training-grid/window-options.ts`'s shape, but as a distinct cookie key
 * since this is a different selector on a different page.
 *
 * Persisted as a cookie (not `localStorage`) specifically so SSR can read it
 * and render the correct set of visible competition columns on the very
 * first paint.
 */
export const COMPETITION_WINDOW_OPTIONS: CompetitionTimeWindow[] = ["all-time", "last-year", "last-6-months"];

export const COMPETITION_WINDOW_COOKIE_NAME = "competitionResultsWindow";
/** 1 year — effectively indefinite, matching the training grid's window cookie. */
export const COMPETITION_WINDOW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isCompetitionTimeWindow(value: string): value is CompetitionTimeWindow {
  return (COMPETITION_WINDOW_OPTIONS as string[]).includes(value);
}
