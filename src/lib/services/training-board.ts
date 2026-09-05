import type { SupabaseClient } from "@supabase/supabase-js";
import { TrainingBoard } from "@/lib/domain/training-board";
import { getTrainingElements } from "@/lib/services/training-elements";
import { getTrainingLogs } from "@/lib/services/training-logs";
import { getTrainingWindow } from "@/lib/dates";
import { logsToTickRecords } from "@/lib/training-grid-helpers";

/**
 * Fetches a dog's elements and ticks over the fixed 30-day window (the same
 * bound `grid.astro` uses, independent of the 7/14/30 display selector — see
 * plan.md "Critical Implementation Details") and hands back a validated
 * `TrainingBoard`.
 */
export async function loadTrainingBoard(supabase: SupabaseClient, dogId: string): Promise<TrainingBoard> {
  const { startDate, endDate } = getTrainingWindow(30);
  const [elements, logs] = await Promise.all([
    getTrainingElements(supabase, dogId),
    getTrainingLogs(supabase, dogId, startDate, endDate),
  ]);
  return TrainingBoard.create(elements, logsToTickRecords(logs));
}
