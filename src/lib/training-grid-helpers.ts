import type { TrainingElement, TrainingLog } from "@/types";
import type { TickRecord } from "@/lib/domain/training-board";

/**
 * Initialises a tick map from SSR-fetched training log rows.
 * Every element in the `elements` list gets an empty Set; ticks
 * for element IDs not in the list are silently ignored (optional-chain guard).
 */
export function buildTicksByElement(
  elements: TrainingElement[],
  initialTicks: Pick<TrainingLog, "element_id" | "trained_on">[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>(elements.map((e) => [e.id, new Set<string>()]));
  for (const tick of initialTicks) {
    map.get(tick.element_id)?.add(tick.trained_on);
  }
  return map;
}

/**
 * Returns a new Map with the given tick toggled on or off.
 * Immutable pattern: the returned map is always a new reference,
 * safe to use as a React state setter argument.
 */
export function applyTick(
  prev: Map<string, Set<string>>,
  elementId: string,
  date: string,
  checked: boolean,
): Map<string, Set<string>> {
  const next = new Map(prev);
  const set = new Set(next.get(elementId) ?? []);
  if (checked) {
    set.add(date);
  } else {
    set.delete(date);
  }
  next.set(elementId, set);
  return next;
}

/**
 * Returns a map of element ID → total tick count across ALL dates in the
 * ticks Set (never filtered by the display window). This is intentional:
 * highlight ranking must be window-agnostic so that switching between 7/14/30d
 * columns never changes which rows are highlighted green or red.
 */
export function buildTickCounts(elements: TrainingElement[], ticks: Map<string, Set<string>>): Map<string, number> {
  const counts = new Map<string, number>(elements.map((e) => [e.id, 0]));
  for (const [elementId, dateSet] of ticks) {
    if (counts.has(elementId)) {
      counts.set(elementId, dateSet.size);
    }
  }
  return counts;
}

/**
 * Maps raw persisted log rows to the TickRecord[] shape TrainingBoard.create()
 * expects.
 */
export function logsToTickRecords(logs: Pick<TrainingLog, "element_id" | "trained_on">[]): TickRecord[] {
  return logs.map((log) => ({ elementId: log.element_id, trainedOn: log.trained_on }));
}
