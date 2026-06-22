/**
 * The 7/14/30-day display-window selector's shared constants. Imported by
 * both `grid.astro` (to resolve the SSR-rendered initial window from the
 * persisted cookie) and `TrainingGrid.tsx` (to render the selector and
 * persist a new choice) — kept in one place so the two never drift.
 *
 * Persisted as a cookie (not `localStorage`) specifically so SSR can read it
 * and render the correct column count on the very first paint — avoids the
 * "30 columns flash, then resize" hydration flicker a client-only
 * (localStorage) source would otherwise cause.
 */
export const WINDOW_OPTIONS = [7, 14, 30] as const;
export type WindowDays = (typeof WINDOW_OPTIONS)[number];

export const WINDOW_COOKIE_NAME = "trainingGridWindow";
/** 1 year — effectively indefinite, matching the previous localStorage persistence. */
export const WINDOW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isWindowDays(value: number): value is WindowDays {
  return WINDOW_OPTIONS.includes(value as WindowDays);
}
