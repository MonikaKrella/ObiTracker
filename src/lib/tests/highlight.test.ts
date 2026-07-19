import { describe, expect, it } from "vitest";
import { computeHighlights } from "../highlight";
import type { TrainingElement } from "@/types";

/** Builds a minimal TrainingElement for test purposes — only `id` matters to computeHighlights. */
function makeElements(ids: string[]): TrainingElement[] {
  return ids.map((id, i) => ({
    id,
    dog_id: "dog-1",
    name: id,
    sort_position: i,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

function counts(entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

describe("computeHighlights", () => {
  it("n=0 → empty map", () => {
    const result = computeHighlights([], new Map());
    expect(Object.fromEntries(result)).toEqual({});
  });

  it("n=8, A=B=C=D=5 (4-way tie), E=3,F=2,G=1,H=0 → green suppressed (tie set covers half), red: H,G,F", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 5],
      ["C", 5],
      ["D", 5],
      ["E", 3],
      ["F", 2],
      ["G", 1],
      ["H", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
      F: "red",
      G: "red",
      H: "red",
    });
  });

  it("n=6, A=5,B=4,C=3,D=2,E=1,F=0 → Tier 2 single winner: green A, red F", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 4],
      ["C", 3],
      ["D", 2],
      ["E", 1],
      ["F", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: "green",
      B: null,
      C: null,
      D: null,
      E: null,
      F: "red",
    });
  });

  it("n=6, A=B=C=5 (tie at top), D=E=1, F=0 (unique bottom) → green suppressed, red F", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 5],
      ["C", 5],
      ["D", 1],
      ["E", 1],
      ["F", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
      F: "red",
    });
  });

  it("n=5, A=B=5 (tie at top), C=3, D=1, E=0 → green suppressed, red E (unique bottom)", () => {
    const elements = makeElements(["A", "B", "C", "D", "E"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 5],
      ["C", 3],
      ["D", 1],
      ["E", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
      E: "red",
    });
  });

  it("n=4, A=B=5 (tie top), C=D=1 (tie bottom) → no highlights at all", () => {
    const elements = makeElements(["A", "B", "C", "D"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 5],
      ["C", 1],
      ["D", 1],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
    });
  });

  it("n=3, A=3,B=2,C=1 → Tier 1, no highlights regardless of clear ranking", () => {
    const elements = makeElements(["A", "B", "C"]);
    const tickCounts = counts([
      ["A", 3],
      ["B", 2],
      ["C", 1],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
    });
  });

  it("n=5, A=B=C=D=3 (4-way tie at top), E=0 → green suppressed, red E (unique bottom)", () => {
    const elements = makeElements(["A", "B", "C", "D", "E"]);
    const tickCounts = counts([
      ["A", 3],
      ["B", 3],
      ["C", 3],
      ["D", 3],
      ["E", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
      E: "red",
    });
  });

  it("n=6, all=0 → tie at both ends, no highlights", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F"]);
    const tickCounts = counts([
      ["A", 0],
      ["B", 0],
      ["C", 0],
      ["D", 0],
      ["E", 0],
      ["F", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
      F: null,
    });
  });

  it("n=1, A=5 → Tier 1 (n≤3), no highlights", () => {
    const elements = makeElements(["A"]);
    const tickCounts = counts([["A", 5]]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({ A: null });
  });

  it("n=8, one element with 1 tick, the other 7 tied at 0 → green is just the standout, no arbitrary rank-2/3 picks from the 0-tick tie", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const tickCounts = counts([
      ["A", 0],
      ["B", 0],
      ["C", 0],
      ["D", 1],
      ["E", 0],
      ["F", 0],
      ["G", 0],
      ["H", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: "green",
      E: null,
      F: null,
      G: null,
      H: null,
    });
  });

  it("n=7 boundary, no rank-1 tie → top-3/bottom-3 sets of size 3 are NOT suppressed", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G"]);
    const tickCounts = counts([
      ["A", 7],
      ["B", 6],
      ["C", 5],
      ["D", 4],
      ["E", 3],
      ["F", 2],
      ["G", 1],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: "green",
      B: "green",
      C: "green",
      D: null,
      E: "red",
      F: "red",
      G: "red",
    });
  });

  it("n=7, A=B=5 (rank-1 2-way tie), C=4, D=3, E=2, F=1, G=0 → rank-1 tie expansion: green={A,B} + unique rank-2 C → 3 green; red fills normally: E,F,G", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 5],
      ["C", 4],
      ["D", 3],
      ["E", 2],
      ["F", 1],
      ["G", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: "green",
      B: "green",
      C: "green",
      D: null,
      E: "red",
      F: "red",
      G: "red",
    });
  });

  it("n=7, A=7,B=6,C=5,D=4,E=3,F=1,G=1 (rank-last 2-way tie) → red rank-last expansion: red={F,G} + unique rank-2-from-last E → 3 red; green fills normally: A,B,C", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G"]);
    const tickCounts = counts([
      ["A", 7],
      ["B", 6],
      ["C", 5],
      ["D", 4],
      ["E", 3],
      ["F", 1],
      ["G", 1],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: "green",
      B: "green",
      C: "green",
      D: null,
      E: "red",
      F: "red",
      G: "red",
    });
  });

  it("n=7, A=7, B=C=5 (tied at rank-2, freq=2), D=4, E=3, F=2, G=1 → Correction-5 guard: rank-2/3 slots skipped (non-unique count), green={A} only; red fills normally: E,F,G", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G"]);
    const tickCounts = counts([
      ["A", 7],
      ["B", 5],
      ["C", 5],
      ["D", 4],
      ["E", 3],
      ["F", 2],
      ["G", 1],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: "green",
      B: null,
      C: null,
      D: null,
      E: "red",
      F: "red",
      G: "red",
    });
  });

  it("n=8, all zeros → Tier 3 all-equal: rank-1 tie size 8 ≥ half → green suppressed; rank-last tie size 8 ≥ half → red suppressed → all null", () => {
    const elements = makeElements(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const tickCounts = counts([
      ["A", 0],
      ["B", 0],
      ["C", 0],
      ["D", 0],
      ["E", 0],
      ["F", 0],
      ["G", 0],
      ["H", 0],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
      F: null,
      G: null,
      H: null,
    });
  });

  it("n=4, A=5,B=4,C=3,D=2 (all unique) → Tier 2 happy-path: green=A (unique top), red=D (unique bottom)", () => {
    const elements = makeElements(["A", "B", "C", "D"]);
    const tickCounts = counts([
      ["A", 5],
      ["B", 4],
      ["C", 3],
      ["D", 2],
    ]);
    const result = computeHighlights(elements, tickCounts);
    expect(Object.fromEntries(result)).toEqual({
      A: "green",
      B: null,
      C: null,
      D: "red",
    });
  });
});
