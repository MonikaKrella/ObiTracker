import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingElement } from "@/types";

/**
 * Returns all training elements for a dog, ordered by saved position.
 * `created_at` is a tiebreaker for any rows that share a `sort_position`
 * (e.g. from concurrent creates). RLS scopes the query to the session
 * account via the `dogs` ownership EXISTS check.
 */
export async function getTrainingElements(supabase: SupabaseClient, dogId: string): Promise<TrainingElement[]> {
  const result = await supabase
    .from("training_elements")
    .select("*")
    .eq("dog_id", dogId)
    .order("sort_position", { ascending: true })
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;
  return (result.data as TrainingElement[] | null) ?? [];
}

/**
 * Case-insensitive check: does this dog already have a live element with this name?
 * Special characters \, %, and _ are escaped (backslash first) so they are not
 * treated as SQL escape/wildcard characters in the `ilike` pattern.
 * Pass `excludeElementId` when renaming so an element doesn't collide with itself.
 */
export async function isElementNameTaken(
  supabase: SupabaseClient,
  dogId: string,
  name: string,
  excludeElementId?: string,
): Promise<boolean> {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

  let query = supabase.from("training_elements").select("id").eq("dog_id", dogId).ilike("name", escapedName);

  if (excludeElementId) {
    query = query.neq("id", excludeElementId);
  }

  const result = await query.maybeSingle();

  if (result.error) throw result.error;
  return result.data !== null;
}

/**
 * Creates a new training element for the dog at the end of the saved order.
 * `sort_position` is always `MAX(sort_position) + 1` for the dog (never the
 * column default of 0), keeping `ORDER BY sort_position` deterministic.
 */
export async function createTrainingElement(
  supabase: SupabaseClient,
  dogId: string,
  name: string,
): Promise<TrainingElement> {
  const maxResult = await supabase
    .from("training_elements")
    .select("sort_position")
    .eq("dog_id", dogId)
    .order("sort_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxResult.error) throw maxResult.error;

  const nextPosition = Number(maxResult.data?.sort_position ?? -1) + 1;

  const result = await supabase
    .from("training_elements")
    .insert({ dog_id: dogId, name, sort_position: nextPosition })
    .select()
    .single();

  if (result.error) throw result.error;
  return result.data as TrainingElement;
}

/**
 * Renames a training element, scoped to the given dog.
 * Returns the updated element, or null if no row matched (not found, wrong
 * dog, or not owned).
 */
export async function renameTrainingElement(
  supabase: SupabaseClient,
  dogId: string,
  elementId: string,
  name: string,
): Promise<TrainingElement | null> {
  const result = await supabase
    .from("training_elements")
    .update({ name })
    .eq("id", elementId)
    .eq("dog_id", dogId)
    .select()
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data as TrainingElement | null;
}

/**
 * Deletes a training element, scoped to the given dog.
 * Returns true if a row was deleted, false if no row matched (not found,
 * wrong dog, or not owned). The `training_logs_element_id_fkey ON DELETE
 * CASCADE` removes that element's tick history automatically.
 */
export async function deleteTrainingElement(
  supabase: SupabaseClient,
  dogId: string,
  elementId: string,
): Promise<boolean> {
  const result = await supabase
    .from("training_elements")
    .delete({ count: "exact" })
    .eq("id", elementId)
    .eq("dog_id", dogId);

  if (result.error) throw result.error;
  return (result.count ?? 0) > 0;
}
