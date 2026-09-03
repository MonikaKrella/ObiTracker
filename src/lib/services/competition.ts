import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompetitionClass, Exercise } from "@/types";

/**
 * Returns all competition classes, ordered by their fixed rulebook position.
 */
export async function getCompetitionClasses(supabase: SupabaseClient): Promise<CompetitionClass[]> {
  const result = await supabase.from("competition_classes").select("*").order("sort_position", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return (result.data as CompetitionClass[] | null) ?? [];
}

/**
 * Returns all exercises for a competition class, ordered by their fixed rulebook position.
 */
export async function getExercisesForClass(supabase: SupabaseClient, classId: string): Promise<Exercise[]> {
  const result = await supabase
    .from("exercises")
    .select("*")
    .eq("class_id", classId)
    .order("sort_position", { ascending: true });

  if (result.error) {
    throw result.error;
  }

  return (result.data as Exercise[] | null) ?? [];
}

/**
 * Returns all exercises for a competition class, looked up by its rulebook
 * class_number (1/2/3) rather than its internal id.
 */
export async function getExercisesForClassNumber(supabase: SupabaseClient, classNumber: number): Promise<Exercise[]> {
  const classResult = await supabase
    .from("competition_classes")
    .select("id")
    .eq("class_number", classNumber)
    .single<{ id: string }>();

  if (classResult.error) {
    throw classResult.error;
  }

  return getExercisesForClass(supabase, classResult.data.id);
}
