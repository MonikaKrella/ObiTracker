import { computeHighlights } from "@/lib/highlight";
import { formatHeaderDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TrainingElement, TrainingLog } from "@/types";

interface Props {
  dogId: string;
  dogName: string;
  elements: TrainingElement[];
  initialTicks: Pick<TrainingLog, "element_id" | "trained_on">[];
  dates: string[];
  today: string;
  serviceUnavailable: boolean;
}

/**
 * Opaque background colors for every sticky cell (corner, sticky header row,
 * sticky name column). Sticky cells MUST be fully opaque, not a translucent
 * `bg-white/10` — translucent stickies let the date columns scrolling
 * underneath show through (see research.md "iOS Safari critical
 * requirements"). Each shade is a hand-picked opaque approximation of the
 * card's actual translucent look (`bg-cosmic` page gradient + `bg-white/5`
 * card overlay, optionally tinted by `bg-emerald-500/15`/`bg-rose-500/15`)
 * so the sticky name column still visibly carries its highlight color while
 * scrolled, without ever being see-through.
 */
const STICKY_BG = new Map<"green" | "red" | null, string>([
  [null, "bg-[#181c2b]"],
  ["green", "bg-[#173438]"],
  ["red", "bg-[#392133]"],
]);

/** Opaque, slightly-lighter variant of `STICKY_BG`'s neutral shade, used only
 * on today's sticky date header so the column reads as "lighter" without
 * reintroducing the translucent-sticky bleed-through bug. */
const TODAY_HEADER_BG = "bg-[#262b3e]";

/**
 * Server-rendered, read-only training grid. Renders the sticky-header /
 * sticky-name-column table structure and the three render states
 * (error/empty/populated) — no interactivity yet (no `client:` directive on
 * the Astro side, no tick handlers here). Phase 4 layers `useMounted`, the
 * window selector, and tick interactivity on top of this exact markup.
 *
 * `tickCounts`/`highlights` always cover the full 30-day `initialTicks`
 * fetch — there is no window selector yet to narrow this in Phase 3.
 */
export function TrainingGrid({ dogId, dogName, elements, initialTicks, dates, today, serviceUnavailable }: Props) {
  if (serviceUnavailable) {
    return <ServiceUnavailableGrid dates={dates} />;
  }

  if (elements.length === 0) {
    return <EmptyElementsGrid dogId={dogId} dates={dates} />;
  }

  const ticksByElement = new Map<string, Set<string>>(elements.map((e) => [e.id, new Set<string>()]));
  const tickCounts = new Map<string, number>(elements.map((e) => [e.id, 0]));
  for (const tick of initialTicks) {
    ticksByElement.get(tick.element_id)?.add(tick.trained_on);
    if (tickCounts.has(tick.element_id)) {
      tickCounts.set(tick.element_id, (tickCounts.get(tick.element_id) ?? 0) + 1);
    }
  }
  const highlights = computeHighlights(elements, tickCounts);

  return (
    <div
      id="training-grid-scroll"
      className="overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5"
    >
      <table role="grid" aria-label={`Training log for ${dogName}`} className="table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th className={cn("sticky top-0 left-0 z-30 w-[28rem]", STICKY_BG.get(null))}></th>
            {dates.map((date) => {
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
            const ticks = ticksByElement.get(element.id) ?? new Set<string>();
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
                    "sticky left-0 z-20 w-[28rem] truncate px-3 py-2 text-left font-medium text-white",
                    STICKY_BG.get(highlight),
                  )}
                >
                  {element.name}
                </th>
                {dates.map((date) => {
                  const checked = ticks.has(date);
                  const isToday = date === today;
                  return (
                    <td
                      key={date}
                      role="gridcell"
                      className={cn("p-1 text-center", isToday && "border-l-2 border-l-purple-400 bg-white/5")}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mx-auto flex size-5 items-center justify-center rounded-sm border-2",
                          checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-white/30 bg-transparent",
                        )}
                      >
                        {checked && "✓"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
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
          <th className={cn("sticky top-0 left-0 z-30 w-[28rem]", STICKY_BG.get(null))}></th>
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
            <th className={cn("sticky left-0 z-20 w-[28rem] px-3 py-2", STICKY_BG.get(null))}>
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
    <div className="relative overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5">
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
    <div className="relative overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5">
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
