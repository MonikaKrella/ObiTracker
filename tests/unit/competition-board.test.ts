import { describe, expect, it } from "vitest";
import { CompetitionBoard, UnknownExerciseScoreError, type ScoreRecord } from "../../src/lib/domain/competition-board";
import type { Exercise } from "@/types";

/** Builds a minimal Exercise for test purposes — only `id` matters to CompetitionBoard. */
function makeExercises(ids: string[]): Exercise[] {
  return ids.map((id, i) => ({
    id,
    class_number: 1,
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

describe("CompetitionBoard.highlights", () => {
  it("no ranked exercises (all unscored) → all null", () => {
    const exercises = makeExercises(["A", "B", "C"]);
    const board = CompetitionBoard.create(exercises, []);
    expect(Object.fromEntries(board.highlights())).toEqual({ A: null, B: null, C: null });
  });

  it("single ranked exercise → degenerate all-equal case, no highlight", () => {
    const exercises = makeExercises(["A"]);
    const board = CompetitionBoard.create(exercises, scoresFrom([["A", 8]]));
    expect(Object.fromEntries(board.highlights())).toEqual({ A: null });
  });

  it("all defined averages equal → ranking skipped entirely, no highlight", () => {
    const exercises = makeExercises(["A", "B", "C"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 8],
        ["B", 8],
        ["C", 8],
      ]),
    );
    expect(Object.fromEntries(board.highlights())).toEqual({ A: null, B: null, C: null });
  });

  it("4 exercises, all-unique averages 10,8,6,4 → clean top-2/bottom-2, no ties", () => {
    const exercises = makeExercises(["A", "B", "C", "D"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["B", 8],
        ["C", 6],
        ["D", 4],
      ]),
    );
    expect(Object.fromEntries(board.highlights())).toEqual({
      A: "green",
      B: "green",
      C: "red",
      D: "red",
    });
  });

  it("rank-1 3-way tie (A=B=C=10), D=4 → the whole tied top group is included even though it exceeds 2", () => {
    const exercises = makeExercises(["A", "B", "C", "D"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["B", 10],
        ["C", 10],
        ["D", 4],
      ]),
    );
    expect(Object.fromEntries(board.highlights())).toEqual({
      A: "green",
      B: "green",
      C: "green",
      D: "red",
    });
  });

  it("rank-2-boundary tie: A=10, B=C=D=8, E=2 → the tied group crossing the threshold is included in full", () => {
    const exercises = makeExercises(["A", "B", "C", "D", "E"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["B", 8],
        ["C", 8],
        ["D", 8],
        ["E", 2],
      ]),
    );
    expect(Object.fromEntries(board.highlights())).toEqual({
      A: "green",
      B: "green",
      C: "green",
      D: "green",
      E: "red",
    });
  });

  it("green/red overlap (only 3 exercises scored, B=C tied at the bottom of the top-2 walk and the top of the bottom-2 walk) → resolved to green", () => {
    const exercises = makeExercises(["A", "B", "C"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["B", 8],
        ["C", 8],
      ]),
    );
    expect(Object.fromEntries(board.highlights())).toEqual({
      A: "green",
      B: "green",
      C: "green",
    });
  });

  it("mix of ranked + unranked exercises: A=10,B=8,C=4,D=2 ranked, E unscored → E stays null and is excluded from ranking", () => {
    const exercises = makeExercises(["A", "B", "C", "D", "E"]);
    const board = CompetitionBoard.create(
      exercises,
      scoresFrom([
        ["A", 10],
        ["B", 8],
        ["C", 4],
        ["D", 2],
      ]),
    );
    expect(Object.fromEntries(board.highlights())).toEqual({
      A: "green",
      B: "green",
      C: "red",
      D: "red",
      E: null,
    });
  });
});
