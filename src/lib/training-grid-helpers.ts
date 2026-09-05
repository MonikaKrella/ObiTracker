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
 * Maps raw persisted log rows to the TickRecord[] shape TrainingBoard.create()
 * expects.
 */
export function logsToTickRecords(logs: Pick<TrainingLog, "element_id" | "trained_on">[]): TickRecord[] {
  return logs.map((log) => ({ elementId: log.element_id, trainedOn: log.trained_on }));
}

/**
 * Flattens the client's tick state (Map<elementId, Set<date>>) into one
 * TickRecord per ticked date — the shape TrainingBoard.create() expects.
 */
export function ticksMapToTickRecords(ticks: Map<string, Set<string>>): TickRecord[] {
  const records: TickRecord[] = [];
  for (const [elementId, dates] of ticks) {
    for (const trainedOn of dates) {
      records.push({ elementId, trainedOn });
    }
  }
  return records;
}
