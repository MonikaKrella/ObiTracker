import type { SupabaseClient } from "@supabase/supabase-js";
import type { Competition, CompetitionScore } from "@/types";

/**
 * Returns competitions for a dog+class within a date window (inclusive),
 * ordered by `competed_on` ASC. `startDate === null` omits the lower bound
 * (the "all-time" window). RLS scopes the query to the session account; the
 * explicit filters let the query use the `competitions_account_dog_class_date_idx`
 * composite index.
 */
export async function getCompetitionsForDogClass(
  supabase: SupabaseClient,
  dogId: string,
  classId: string,
  startDate: string | null,
  endDate: string,
): Promise<Competition[]> {
  let query = supabase
    .from("competitions")
    .select("*")
    .eq("dog_id", dogId)
    .eq("class_id", classId)
    .lte("competed_on", endDate);

  if (startDate !== null) {
    query = query.gte("competed_on", startDate);
  }

  const result = await query.order("competed_on", { ascending: true });

  if (result.error) {
    throw result.error;
  }
  return (result.data as Competition[] | null) ?? [];
}

/**
 * Creates a new competition for the dog. `accountId` is always sourced from
 * the session by the caller, never from request input. Lets a `23505`
 * unique-violation (duplicate dog+class+date) propagate for the API layer to
 * map to 409.
 */
export async function createCompetition(
  supabase: SupabaseClient,
  dogId: string,
  classId: string,
  accountId: string,
  competedOn: string,
): Promise<Competition> {
  const result = await supabase
    .from("competitions")
    .insert({ dog_id: dogId, class_id: classId, account_id: accountId, competed_on: competedOn })
    .select()
    .single();

  if (result.error) {
    throw result.error;
  }
  return result.data as Competition;
}

/**
 * Returns the scores for a set of competitions. Only the columns the
 * averaging/highlighting read path needs are selected. Returns `[]` without
 * a round trip when `competitionIds` is empty.
 */
export async function getCompetitionScores(
  supabase: SupabaseClient,
  competitionIds: string[],
): Promise<Pick<CompetitionScore, "competition_id" | "exercise_id" | "score">[]> {
  if (competitionIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("competition_scores")
    .select("competition_id, exercise_id, score")
    .in("competition_id", competitionIds);

  if (result.error) {
    throw result.error;
  }
  return result.data;
}

/**
 * Upserts a single score cell (insert if unscored, overwrite if already
 * scored) via `onConflict` on the `(competition_id, exercise_id)` unique
 * constraint — the real-upsert analog to `training_logs`' insert/delete
 * toggle idiom, since a score is edited in place rather than toggled.
 * `accountId` is always sourced from the session by the caller, never from
 * request input.
 */
export async function upsertCompetitionScore(
  supabase: SupabaseClient,
  competitionId: string,
  exerciseId: string,
  accountId: string,
  score: number,
): Promise<void> {
  const result = await supabase
    .from("competition_scores")
    .upsert(
      { competition_id: competitionId, exercise_id: exerciseId, account_id: accountId, score },
      { onConflict: "competition_id,exercise_id" },
    );

  if (result.error) {
    throw result.error;
  }
}

/**
 * Clears a score cell back to unscored (row removal, per the "partial scores
 * are row absence" rule — not an UPDATE ... SET score = NULL).
 */
export async function deleteCompetitionScore(
  supabase: SupabaseClient,
  competitionId: string,
  exerciseId: string,
): Promise<void> {
  const result = await supabase
    .from("competition_scores")
    .delete()
    .eq("competition_id", competitionId)
    .eq("exercise_id", exerciseId);

  if (result.error) {
    throw result.error;
  }
}

/**
 * Checks whether a competition belongs to the given dog. Used as an
 * app-level ownership guard before writing a dependent `competition_scores`
 * row — defense in depth alongside the RLS `WITH CHECK` clause, mirroring
 * `elementBelongsToDog`'s usage in the training-elements service.
 */
export async function competitionBelongsToDog(
  supabase: SupabaseClient,
  dogId: string,
  competitionId: string,
): Promise<boolean> {
  const result = await supabase
    .from("competitions")
    .select("id")
    .eq("id", competitionId)
    .eq("dog_id", dogId)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }
  return result.data !== null;
}

/**
 * Checks whether an exercise belongs to the same class as the given
 * competition. Used as an app-level guard before writing a dependent
 * `competition_scores` row — defense in depth alongside the RLS `WITH CHECK`
 * clause's identical cross-FK check — so a mismatch 404s cleanly instead of
 * surfacing as a raw RLS-violation 500.
 */
export async function exerciseBelongsToClass(
  supabase: SupabaseClient,
  competitionId: string,
  exerciseId: string,
): Promise<boolean> {
  const competitionResult = await supabase
    .from("competitions")
    .select("class_id")
    .eq("id", competitionId)
    .maybeSingle();

  if (competitionResult.error) {
    throw competitionResult.error;
  }
  if (competitionResult.data === null) {
    return false;
  }

  const exerciseResult = await supabase
    .from("exercises")
    .select("id")
    .eq("id", exerciseId)
    .eq("class_id", competitionResult.data.class_id)
    .maybeSingle();

  if (exerciseResult.error) {
    throw exerciseResult.error;
  }
  return exerciseResult.data !== null;
}
