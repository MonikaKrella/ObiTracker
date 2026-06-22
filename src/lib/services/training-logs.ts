import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingLog } from "@/types";

/**
 * Fetches training log entries for a dog within a date window (inclusive).
 * Only `element_id` and `trained_on` are selected — the grid render needs
 * nothing else. RLS scopes the query to the session account; the explicit
 * `dog_id` filter lets the query use the `training_logs_account_dog_date_idx`
 * composite index. Returns logs ordered by `trained_on` ASC, `[]` on no rows,
 * throws on error.
 */
export async function getTrainingLogs(
  supabase: SupabaseClient,
  dogId: string,
  startDate: string,
  endDate: string,
): Promise<Pick<TrainingLog, "element_id" | "trained_on">[]> {
  const result = await supabase
    .from("training_logs")
    .select("element_id, trained_on")
    .eq("dog_id", dogId)
    .gte("trained_on", startDate)
    .lte("trained_on", endDate)
    .order("trained_on", { ascending: true });

  if (result.error) throw result.error;
  return result.data;
}

/**
 * Toggles a single tick: INSERT if absent (tick), DELETE if present (untick).
 * The `training_logs_element_id_trained_on_unique` constraint serializes
 * concurrent toggles — an INSERT that collides with it fails with Postgres
 * error code 23505, which is the only signal we trust to fall through to a
 * DELETE. Any other error (e.g. an RLS violation from a forged ownership
 * mismatch) is rethrown rather than silently treated as "untick".
 * `accountId` is always sourced from the session by the caller, never from
 * request input.
 */
export async function toggleTrainingLog(
  supabase: SupabaseClient,
  dogId: string,
  elementId: string,
  accountId: string,
  trainedOn: string,
): Promise<"ticked" | "unticked"> {
  const insertResult = await supabase.from("training_logs").insert({
    element_id: elementId,
    dog_id: dogId,
    account_id: accountId,
    trained_on: trainedOn,
  });

  if (!insertResult.error) {
    return "ticked";
  }

  const uniqueViolationErrorCode = "23505"; // Postgres unique violation
  if (insertResult.error.code !== uniqueViolationErrorCode) {
    throw insertResult.error;
  }

  const deleteResult = await supabase
    .from("training_logs")
    .delete()
    .eq("element_id", elementId)
    .eq("dog_id", dogId)
    .eq("trained_on", trainedOn);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  return "unticked";
}
