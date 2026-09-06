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

export type HighlightColor = "green" | "red" | null;

/**
 * Walks distinct-average groups from one end of the ranked list, adding each
 * whole group to the result set and accumulating its member count, stopping
 * once the accumulated count reaches 2 — the group that crosses the
 * threshold is included in full (tie expansion), per FR-014.
 */
function collectExtremeGroup(ranked: [string, number][], direction: "desc" | "asc"): Set<string> {
  const sorted = [...ranked].sort((a, b) => (direction === "desc" ? b[1] - a[1] : a[1] - b[1]));
  const result = new Set<string>();
  let i = 0;
  while (i < sorted.length && result.size < 2) {
    const groupValue = sorted[i][1];
    while (i < sorted.length && sorted[i][1] === groupValue) {
      result.add(sorted[i][0]);
      i++;
    }
  }
  return result;
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

  /**
   * Computes green/red highlights from each exercise's average (FR-014).
   *
   * - Exercises with an undefined (`null`) average — no entered scores — are
   *   excluded from ranking entirely; they always resolve to `null`.
   * - If every ranked exercise shares the same average (including the
   *   degenerate single-ranked-exercise case), no highlight is produced at
   *   all — ranking is skipped outright.
   * - Otherwise, GREEN is the top-2 group (by average, descending) and RED
   *   is the bottom-2 group (ascending), each computed by
   *   {@link collectExtremeGroup}'s whole-group tie-expansion walk: a tie
   *   that straddles the 2nd slot expands the highlighted set to include
   *   every exercise in that tied group.
   * - Because exercise counts are small and only scored exercises are
   *   ranked, green and red can overlap (e.g. only 2-3 exercises scored so
   *   far) — an overlap resolves to green, mirroring `TrainingBoard`'s
   *   green-over-red convention.
   *
   * @returns Map<exerciseId, 'green' | 'red' | null>
   */
  highlights(): ReadonlyMap<string, HighlightColor> {
    const result = new Map<string, HighlightColor>(this.exercises.map((e) => [e.id, null] as const));

    const ranked = [...this.averages().entries()].filter((entry): entry is [string, number] => entry[1] !== null);
    if (ranked.length === 0) {
      return result;
    }

    const allEqual = ranked.every(([, average]) => average === ranked[0][1]);
    if (allEqual) {
      return result;
    }

    const redSet = collectExtremeGroup(ranked, "asc");
    const greenSet = collectExtremeGroup(ranked, "desc");

    for (const id of redSet) {
      result.set(id, "red");
    }
    for (const id of greenSet) {
      result.set(id, "green"); // overwrites red if overlap
    }

    return result;
  }
}
