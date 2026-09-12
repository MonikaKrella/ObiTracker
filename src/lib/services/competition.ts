import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise } from "@/types";

/**
 * Returns all exercises for a competition class, ordered by their fixed rulebook position.
 */
export async function getExercisesForClass(supabase: SupabaseClient, classNumber: number): Promise<Exercise[]> {
  const result = await supabase
    .from("exercises")
    .select("*")
    .eq("class_number", classNumber)
    .order("sort_position", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return (result.data as Exercise[] | null) ?? [];
}
