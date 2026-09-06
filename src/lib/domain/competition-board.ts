import type { Exercise } from "@/types";

export class UnknownExerciseScoreError extends Error {
  constructor(public readonly exerciseId: string) {
    super(`Score references exercise "${exerciseId}", which is not in this board's exercise set`);
    this.name = "UnknownExerciseScoreError";
  }
}

export interface ScoreRecord {
  exerciseId: string;
  score: number;
}

/**
 * The sole legal way to construct a classified (green/red highlighted) view
 * of a dog's competition results for a class. `create()` fails fast on a
 * score referencing an exercise outside this board's set, rather than
 * silently trusting the caller to have pre-filtered the data.
 */
export class CompetitionBoard {
  private constructor(
    private readonly exercises: readonly Exercise[],
    private readonly scoresByExercise: ReadonlyMap<string, number[]>,
  ) {}

  static create(exercises: Exercise[], scores: ScoreRecord[]): CompetitionBoard {
    const scoresByExercise = new Map<string, number[]>(exercises.map((e) => [e.id, []]));
    for (const record of scores) {
      const list = scoresByExercise.get(record.exerciseId);
      if (list === undefined) {
        throw new UnknownExerciseScoreError(record.exerciseId);
      }
      list.push(record.score);
    }
    return new CompetitionBoard(exercises, scoresByExercise);
  }

  /**
   * Computes each exercise's average from raw (unmultiplied) entered points.
   *
   * An exercise with zero entered scores maps to `null` — absence of a score
   * is not counted as zero (see the "partial scores are row absence" rule).
   *
   * @returns Map<exerciseId, average score | null>
   */
  averages(): ReadonlyMap<string, number | null> {
    const result = new Map<string, number | null>();
    for (const exercise of this.exercises) {
      const scores = this.scoresByExercise.get(exercise.id) ?? [];
      if (scores.length === 0) {
        result.set(exercise.id, null);
        continue;
      }
      const sum = scores.reduce((acc, score) => acc + score, 0);
      result.set(exercise.id, sum / scores.length);
    }
    return result;
  }
}
