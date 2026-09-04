import { useEffect, useMemo, useRef, useState } from "react";
import { useMounted } from "@/components/hooks/useMounted";
import { useTrainingGrid } from "@/components/hooks/useTrainingGrid";
import { TrainingGridRow } from "@/components/training-grid/TrainingGridRow";
import { STICKY_BG, TODAY_HEADER_BG } from "@/components/training-grid/sticky-colors";
import {
  WINDOW_OPTIONS,
  WINDOW_COOKIE_NAME,
  WINDOW_COOKIE_MAX_AGE,
  type WindowDays,
} from "@/components/training-grid/window-options";
import { TrainingBoard } from "@/lib/domain/training-board";
import { formatHeaderDate } from "@/lib/dates";
import { applyTick, buildTicksByElement, ticksMapToTickRecords } from "@/lib/training-grid-helpers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TrainingElement, TrainingLog } from "@/types";

interface Props {
  dogId: string;
  dogName: string;
  elements: TrainingElement[];
  initialTicks: Pick<TrainingLog, "element_id" | "trained_on">[];
  dates: string[];
  today: string;
  serviceUnavailable: boolean;
  initialWindow: WindowDays;
}

// A plain function call (not an inline `document.cookie = ...` assignment
// inside the component) so the react-compiler lint rule doesn't flag this
// as "modifying a variable defined outside a component" — mirrors how
// `localStorage.setItem(...)` (a method call, not an assignment) was exempt
// from that same rule in the previous version of this component.
function setWindowCookie(days: WindowDays) {
  // `Secure` is conditional on protocol, not unconditional: dev (`npm run dev`)
  // serves over plain http://localhost, where a `Secure` cookie would silently
  // fail to round-trip, breaking window persistence in local development.
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${WINDOW_COOKIE_NAME}=${days}; path=/; max-age=${WINDOW_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Training grid island. The 7/14/30 display window is resolved server-side
 * from a cookie (`grid.astro` reads it and passes `initialWindow`), so the
 * selector buttons and column count are correct on the very first paint —
 * no client-only resolution, no post-hydration pop-in/resize. Only the tick
 * cells themselves stay gated behind `useMounted`: tapping needs JS
 * (`useOptimistic`, the toggle API), so pre-hydration each row renders as
 * plain non-interactive markup, swapping to `TrainingGridRow` once mounted —
 * mirrors the SSR→island swap pattern in `TrainingElementsManager.tsx:98-110`,
 * just scoped to the row level instead of the whole component.
 *
 * `highlights` always covers the full 30-day `dates`/ticks data — the window
 * selector only slices which date columns are rendered, never which ticks
 * feed the highlight algorithm (see plan.md "Critical Implementation
 * Details").
 */
export function TrainingGrid({
  dogId,
  dogName,
  elements,
  initialTicks,
  dates,
  today,
  serviceUnavailable,
  initialWindow,
}: Props) {
  const mounted = useMounted();
  const toggleTick = useTrainingGrid(dogId);

  const [ticks, setTicks] = useState(() => buildTicksByElement(elements, initialTicks));
  const [selectedWindow, setSelectedWindow] = useState<WindowDays>(initialWindow);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-runs on window change — switching from 30→7 days changes scrollWidth,
  // so a stale scrollLeft would otherwise persist. The wrapper's ref is
  // attached unconditionally now (both pre- and post-mount), so unlike the
  // earlier localStorage-based version this no longer needs `mounted` in
  // its dependency array.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [selectedWindow]);

  const highlights = useMemo(
    () => TrainingBoard.create(elements, ticksMapToTickRecords(ticks)).highlights(),
    [elements, ticks],
  );

  const visibleDates = useMemo(() => dates.slice(-selectedWindow), [dates, selectedWindow]);

  if (serviceUnavailable) {
    return <ServiceUnavailableGrid dates={visibleDates} />;
  }

  if (elements.length === 0) {
    return <EmptyElementsGrid dogId={dogId} dates={visibleDates} />;
  }

  // Called synchronously, outside of TickCell's `startTransition`, so the
  // highlight recompute commits in lockstep with the tap rather than being
  // deferred as a transition update (see `handleToggle`'s revert comment
  // below for why only the pre-await apply needs this).
  function applyOptimisticTick(elementId: string, date: string, next: boolean) {
    setTicks((prev) => applyTick(prev, elementId, date, next));
  }

  async function handleToggle(elementId: string, date: string, next: boolean) {
    try {
      await toggleTick(elementId, date, next);
    } catch (err) {
      // This runs after the awaited promise has already settled, so unlike
      // a pre-await update it's not deferred behind a pending transition —
      // it can use the plain setter and still commit immediately.
      applyOptimisticTick(elementId, date, !next);
      throw err;
    }
  }

  function handleWindowChange(days: WindowDays) {
    setSelectedWindow(days);
    setWindowCookie(days);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">
        {WINDOW_OPTIONS.map((days) => (
          <Button
            key={days}
            type="button"
            variant={selectedWindow === days ? "default" : "outline"}
            size="sm"
            disabled={!mounted}
            onClick={() => {
              handleWindowChange(days);
            }}
          >
            {days}d
          </Button>
        ))}
      </div>
      <div
        ref={scrollRef}
        className="mx-auto w-fit max-w-full overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5"
      >
        <table role="grid" aria-label={`Training log for ${dogName}`} className="table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn("sticky top-0 left-0 z-30 w-[15.625rem]", STICKY_BG.get(null))}></th>
              {visibleDates.map((date) => {
                const isToday = date === today;
                return (
                  <th
                    key={date}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-20 w-[3.5rem] border-l border-white/10 px-1.5 py-2 text-center text-xs font-semibold text-white/80",
                      isToday ? TODAY_HEADER_BG : STICKY_BG.get(null),
                      isToday && "border-l-2 border-l-purple-400 text-white",
                    )}
                  >
                    {formatHeaderDate(date)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {elements.map((element) => {
              const highlight = highlights.get(element.id) ?? null;
              const elementTicks = ticks.get(element.id) ?? new Set<string>();

              if (!mounted) {
                // Plain, non-interactive markup — tapping needs JS
                // (`useOptimistic`, the toggle API), so this mirrors
                // `TrainingGridRow`/`TickCell`'s visuals without handlers,
                // swapping in once mounted.
                return (
                  <tr
                    key={element.id}
                    className={cn(
                      "border-b border-white/10",
                      highlight === "green" && "bg-emerald-500/15",
                      highlight === "red" && "bg-rose-500/15",
                    )}
                  >
                    <th
                      scope="row"
                      role="rowheader"
                      className={cn(
                        "sticky left-0 z-20 w-[15.625rem] truncate px-3 py-2 text-left font-medium text-white",
                        STICKY_BG.get(highlight),
                      )}
                    >
                      {element.name}
                    </th>
                    {visibleDates.map((date) => {
                      const checked = elementTicks.has(date);
                      const isToday = date === today;
                      return (
                        <td
                          key={date}
                          role="gridcell"
                          className={cn("p-1 text-center", isToday && "border-l-2 border-l-purple-400 bg-white/5")}
                        >
                          {/* `size-11` wrapper matches TickCell's touch-target `<label>` sizing — without
                              it this cell's content box is smaller than the mounted version's, shrinking
                              row height pre-hydration. */}
                          <span className="mx-auto flex size-11 items-center justify-center">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex size-5 items-center justify-center rounded-sm border-2",
                                checked
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-white/30 bg-transparent",
                              )}
                            >
                              {checked && "✓"}
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              return (
                <TrainingGridRow
                  key={element.id}
                  element={element}
                  dates={visibleDates}
                  highlight={highlight}
                  ticks={elementTicks}
                  onToggle={handleToggle}
                  onOptimisticTick={applyOptimisticTick}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Skeleton table markup shared by `ServiceUnavailableGrid` and
 * `EmptyElementsGrid` — same header structure and column widths as the
 * populated grid, with `animate-pulse` placeholder cells in place of real
 * data. Each caller overlays its own centered message on top.
 */
function SkeletonGridTable({ dates }: { dates: string[] }) {
  return (
    <table aria-hidden="true" className="table-fixed border-collapse text-sm">
      <thead>
        <tr>
          <th className={cn("sticky top-0 left-0 z-30 w-[15.625rem]", STICKY_BG.get(null))}></th>
          {dates.map((date) => (
            <th
              key={date}
              className={cn("sticky top-0 z-20 w-[3.5rem] border-l border-white/10 px-1.5 py-2", STICKY_BG.get(null))}
            ></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <tr key={rowIndex} className="border-b border-white/10">
            <th className={cn("sticky left-0 z-20 w-[15.625rem] px-3 py-2", STICKY_BG.get(null))}>
              <div className="h-4 w-48 animate-pulse rounded bg-white/5" />
            </th>
            {dates.map((date) => (
              <td key={date} className="p-1">
                <div className="mx-auto size-5 animate-pulse rounded-sm bg-white/5" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Rendered when Supabase env vars are missing. Mirrors the populated table's
 * shell so a misconfiguration never looks like a silent empty grid.
 */
function ServiceUnavailableGrid({ dates }: { dates: string[] }) {
  return (
    <div className="relative mx-auto w-fit max-w-full overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5">
      <SkeletonGridTable dates={dates} />
      <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-black/40 text-center text-sm text-white/80">
        Something went wrong, please try later.
      </div>
    </div>
  );
}

/**
 * Rendered when the dog has no training elements yet. Same skeleton shell as
 * `ServiceUnavailableGrid`, with the centered message swapped for the empty
 * state's heading + link to add elements, per research Q3.
 */
function EmptyElementsGrid({ dogId, dates }: { dogId: string; dates: string[] }) {
  return (
    <div className="relative mx-auto w-fit max-w-full overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5">
      <SkeletonGridTable dates={dates} />
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/40 text-center">
        <p className="text-base text-white/80">No training elements yet</p>
        <a
          href={`/dogs/${dogId}/elements`}
          className="text-base text-purple-300 underline transition-colors hover:text-purple-100"
        >
          Add some to get started
        </a>
      </div>
    </div>
  );
}
