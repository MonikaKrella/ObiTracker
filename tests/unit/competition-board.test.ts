import { describe, expect, it } from "vitest";
import { CompetitionBoard, UnknownExerciseScoreError, type ScoreRecord } from "../../src/lib/domain/competition-board";
import type { Exercise } from "@/types";

/** Builds a minimal Exercise for test purposes — only `id` matters to CompetitionBoard. */
function makeExercises(ids: string[]): Exercise[] {
  return ids.map((id, i) => ({
    id,
    class_id: "class-1",
    name: id,
    shortcut: id,
    multiplier: 4,
    sort_position: i,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

/** Builds one ScoreRecord per (exerciseId, score) pair. */
function scoresFrom(entries: [string, number][]): ScoreRecord[] {
  return entries.map(([exerciseId, score]) => ({ exerciseId, score }));
}

describe("CompetitionBoard.averages", () => {
  it("no exercises → empty map", () => {
    const board = CompetitionBoard.create([], []);
    expect(Object.fromEntries(board.averages())).toEqual({});
  });

  it("exercise with zero entered scores → null, not zero", () => {
    const exercises = makeExercises(["A"]);
    const board = CompetitionBoard.create(exercises, []);
    expect(Object.fromEntries(board.averages())).toEqual({ A: null });
  });

  it("single score → average equals that score", () => {
    const exercises = makeExercises(["A"]);
    const board = CompetitionBoard.create(exercises, scoresFrom([["A", 7.5]]));
    expect(Object.fromEntries(board.averages())).toEqual({ A: 7.5 });
  });

  it("multiple scores average correctly from raw (unmultiplied) points: 10, 8, 6 → 8", () => {
    const exercises = makeExercises(["Heelwork"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["Heelwork", 10],
        ["Heelwork", 8],
        ["Heelwork", 6],
      ]),
    );
    expect(Object.fromEntries(board.averages())).toEqual({ Heelwork: 8 });
  });

  it("non-integer average from raw points: 10, 9 → 9.5", () => {
    const exercises = makeExercises(["A"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["A", 9],
      ]),
    );
    expect(Object.fromEntries(board.averages())).toEqual({ A: 9.5 });
  });

  it("a mix of scored and unscored exercises → scored exercises average, unscored are null", () => {
    const exercises = makeExercises(["A", "B", "C"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["A", 6],
        ["C", 4],
      ]),
    );
    expect(Object.fromEntries(board.averages())).toEqual({ A: 8, B: null, C: 4 });
  });

  it("a score referencing an exercise not in the board's set throws UnknownExerciseScoreError", () => {
    const exercises = makeExercises(["A"]);
    expect(() => CompetitionBoard.create(exercises, scoresFrom([["unknown", 5]]))).toThrow(UnknownExerciseScoreError);
  });
});
