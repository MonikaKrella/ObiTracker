import { TickCell } from "@/components/training-grid/TickCell";
import { STICKY_BG } from "@/components/training-grid/sticky-colors";
import { cn } from "@/lib/utils";
import type { TrainingElement } from "@/types";

interface Props {
  element: TrainingElement;
  dates: string[];
  highlight: "green" | "red" | null;
  ticks: Set<string>;
  onToggle: (elementId: string, date: string, next: boolean) => Promise<void>;
  onOptimisticTick: (elementId: string, date: string, next: boolean) => void;
}

/**
 * One element row: sticky name cell carrying the highlight background
 * (mirrors `ElementRow.tsx`'s `cn()` pattern), plus one `TickCell` per
 * visible date. `dates` is always the already-windowed (7/14/30) slice the
 * parent renders — `today` is therefore just its last entry.
 */
export function TrainingGridRow({ element, dates, highlight, ticks, onToggle, onOptimisticTick }: Props) {
  const today = dates[dates.length - 1];

  return (
    <tr
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
      {dates.map((date) => (
        <TickCell
          key={date}
          elementId={element.id}
          elementName={element.name}
          date={date}
          checked={ticks.has(date)}
          isToday={date === today}
          onToggle={onToggle}
          onOptimisticTick={onOptimisticTick}
        />
      ))}
    </tr>
  );
}
