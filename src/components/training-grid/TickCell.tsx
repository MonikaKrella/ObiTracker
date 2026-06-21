import { useOptimistic, startTransition, useRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  elementId: string;
  elementName: string;
  date: string;
  checked: boolean;
  isToday: boolean;
  onToggle: (elementId: string, date: string, next: boolean) => Promise<void>;
  onOptimisticTick: (elementId: string, date: string, next: boolean) => void;
}

/**
 * Single optimistic tick cell (research.md Section 4). Tapping flips the
 * checkbox immediately via `useOptimistic`; `onToggle` (backed by
 * `useTrainingGrid`) persists the change. If the underlying transition ends
 * without the `checked` prop catching up to the optimistic value (i.e. the
 * save failed), `useOptimistic` reverts the visual state on its own.
 *
 * The `AbortController` ref doesn't cancel a network request directly — it
 * marks a tap as superseded so a stale failure from an earlier tap on this
 * same cell doesn't pop a retry toast after a later tap has already moved
 * the cell on.
 */
export function TickCell({ elementId, elementName, date, checked, isToday, onToggle, onOptimisticTick }: Props) {
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(checked, (_prev: boolean, next: boolean) => next);
  // Not a real cancellation token — useTrainingGrid's fetch isn't abortable.
  // Only `.signal.aborted` is read (as a "superseded by a newer tap" flag);
  // `AbortController` is reused here purely for its built-in superseded-flag
  // semantics, not to cancel anything in flight (see the class-level comment
  // above for the full rationale).
  const abortRef = useRef<AbortController | null>(null);

  function handleChange() {
    const next = !optimisticChecked;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Applied synchronously, before the transition starts, so the row's
    // highlight recomputes in lockstep with the tap instead of being
    // deferred behind the pending network call (see TrainingGrid.tsx).
    onOptimisticTick(elementId, date, next);

    startTransition(async () => {
      setOptimisticChecked(next);
      try {
        await onToggle(elementId, date, next);
      } catch {
        if (controller.signal.aborted) return; // a newer tap already superseded this one
        toast.error("Could not save — tap to retry.");
      }
    });
  }

  return (
    <td role="gridcell" className={cn("p-1 text-center", isToday && "border-l-2 border-l-purple-400 bg-white/5")}>
      <label className="relative mx-auto flex size-11 cursor-pointer touch-manipulation items-center justify-center select-none">
        {/* Full-size invisible overlay, not Tailwind's `sr-only` (clip to 1x1px) —
            a focusable element collapsed to 1px inside this horizontally-scrollable
            grid is what triggers mobile WebKit/Blink's "scroll/zoom focused element
            into view" heuristic into computing an extreme zoom, blanking the page.
            Keeping the input's bounding box the same size as the visible touch
            target avoids that while staying just as invisible (opacity-0). */}
        <input
          type="checkbox"
          checked={optimisticChecked}
          onChange={handleChange}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={`${elementName} on ${date}`}
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 items-center justify-center rounded-sm border-2 transition-colors",
            optimisticChecked ? "border-emerald-500 bg-emerald-500 text-white" : "border-white/30 bg-transparent",
          )}
        >
          {optimisticChecked && "✓"}
        </span>
      </label>
    </td>
  );
}
