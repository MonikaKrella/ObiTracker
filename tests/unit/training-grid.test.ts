import { describe, expect, it } from "vitest";
import {
  applyTick,
  buildTicksByElement,
  logsToTickRecords,
  ticksMapToTickRecords,
} from "../../src/lib/training-grid-helpers";
import type { TrainingElement } from "@/types";

/** Builds a minimal TrainingElement for test purposes — only `id` matters to these helpers. */
function makeElement(id: string): TrainingElement {
  return {
    id,
    dog_id: "dog-1",
    name: id,
    sort_position: 0,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("applyTick", () => {
  it("checked=true adds the date to the element's Set and returns a new Map reference", () => {
    const prev = new Map([["elem-a", new Set(["2026-06-01"])]]);
    const result = applyTick(prev, "elem-a", "2026-06-02", true);
    expect(result.get("elem-a")).toContain("2026-06-01");
    expect(result.get("elem-a")).toContain("2026-06-02");
    expect(result).not.toBe(prev);
  });

  it("checked=false removes the date from the element's Set", () => {
    const prev = new Map([["elem-a", new Set(["2026-06-01", "2026-06-02"])]]);
    const result = applyTick(prev, "elem-a", "2026-06-01", false);
    expect(result.get("elem-a")).not.toContain("2026-06-01");
    expect(result.get("elem-a")).toContain("2026-06-02");
  });

  it("calling on a missing key does not throw and leaves other elements unchanged", () => {
    const prev = new Map([["elem-b", new Set(["2026-06-01"])]]);
    expect(() => applyTick(prev, "elem-missing", "2026-06-02", true)).not.toThrow();
    const result = applyTick(prev, "elem-missing", "2026-06-02", true);
    expect(result.get("elem-b")).toEqual(new Set(["2026-06-01"]));
  });
});

describe("buildTicksByElement", () => {
  it("given two elements and an empty initialTicks, both elements map to an empty Set", () => {
    const elements = [makeElement("elem-a"), makeElement("elem-b")];
    const result = buildTicksByElement(elements, []);
    expect(result.get("elem-a")).toEqual(new Set());
    expect(result.get("elem-b")).toEqual(new Set());
  });

  it("given ticks for one element, that element's Set contains the ticked dates and the other is empty", () => {
    const elements = [makeElement("elem-a"), makeElement("elem-b")];
    const ticks = [
      { element_id: "elem-a", trained_on: "2026-06-01" },
      { element_id: "elem-a", trained_on: "2026-06-02" },
    ];
    const result = buildTicksByElement(elements, ticks);
    expect(result.get("elem-a")).toEqual(new Set(["2026-06-01", "2026-06-02"]));
    expect(result.get("elem-b")).toEqual(new Set());
  });

  it("a tick for an unknown element ID is silently ignored", () => {
    const elements = [makeElement("elem-a")];
    const ticks = [{ element_id: "unknown-id", trained_on: "2026-06-01" }];
    const result = buildTicksByElement(elements, ticks);
    expect(result.get("elem-a")).toEqual(new Set());
    expect(result.has("unknown-id")).toBe(false);
  });
});

describe("logsToTickRecords", () => {
  it("maps each log row's element_id/trained_on to a TickRecord's elementId/trainedOn", () => {
    const logs = [
      { element_id: "elem-a", trained_on: "2026-06-01" },
      { element_id: "elem-b", trained_on: "2026-06-02" },
    ];
    const result = logsToTickRecords(logs);
    expect(result).toEqual([
      { elementId: "elem-a", trainedOn: "2026-06-01" },
      { elementId: "elem-b", trainedOn: "2026-06-02" },
    ]);
  });

  it("an empty logs array maps to an empty TickRecord array", () => {
    expect(logsToTickRecords([])).toEqual([]);
  });
});

describe("ticksMapToTickRecords", () => {
  it("flattens each element's date Set into one TickRecord per date", () => {
    const ticks = new Map([
      ["elem-a", new Set(["2026-06-01", "2026-06-02"])],
      ["elem-b", new Set(["2026-06-03"])],
    ]);
    const result = ticksMapToTickRecords(ticks);
    expect(result).toEqual(
      expect.arrayContaining([
        { elementId: "elem-a", trainedOn: "2026-06-01" },
        { elementId: "elem-a", trainedOn: "2026-06-02" },
        { elementId: "elem-b", trainedOn: "2026-06-03" },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it("an element with an empty Set contributes no records", () => {
    const ticks = new Map([["elem-a", new Set<string>()]]);
    expect(ticksMapToTickRecords(ticks)).toEqual([]);
  });

  it("an empty ticks map maps to an empty TickRecord array", () => {
    expect(ticksMapToTickRecords(new Map())).toEqual([]);
  });
});
