import type { SupabaseClient } from "@supabase/supabase-js";
import { CompetitionBoard, type ScoreRecord } from "@/lib/domain/competition-board";
import type { Competition, CompetitionScore, Exercise } from "@/types";
import { getCompetitionWindow, type CompetitionTimeWindow } from "@/lib/dates";
import { getExercisesForClass } from "@/lib/services/competition";
import { getCompetitionsForDogClass, getCompetitionScores } from "@/lib/services/competitions";

/**
 * Assembles a validated `CompetitionBoard` for a dog+class+window, mirroring
 * `loadTrainingBoard`'s `Promise.all` + fail-fast-construct pattern. Returns
 * `exercises`/`competitions`/`scores` alongside the board since a page shell
 * needs the raw rows to pass as props to a client island — a `CompetitionBoard`
 * instance itself can't cross the server->island prop boundary.
 */
export async function loadCompetitionBoard(
  supabase: SupabaseClient,
  dogId: string,
  classId: string,
  window: CompetitionTimeWindow,
): Promise<{
  board: CompetitionBoard;
  exercises: Exercise[];
  competitions: Competition[];
  scores: Pick<CompetitionScore, "competition_id" | "exercise_id" | "score">[];
}> {
  const { startDate, endDate } = getCompetitionWindow(window);

  const [exercises, competitions] = await Promise.all([
    getExercisesForClass(supabase, classId),
    getCompetitionsForDogClass(supabase, dogId, classId, startDate, endDate),
  ]);

  const scores = await getCompetitionScores(
    supabase,
    competitions.map((competition) => competition.id),
  );
  const scoreRecords: ScoreRecord[] = scores.map((score) => ({
    exerciseId: score.exercise_id,
    score: score.score,
  }));

  const board = CompetitionBoard.create(exercises, scoreRecords);
  return { board, exercises, competitions, scores };
}
