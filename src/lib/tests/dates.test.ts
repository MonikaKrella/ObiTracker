import { describe, expect, it } from "vitest";
import { generateDateRange, getTrainingWindow, isFutureUtcDate } from "../dates";

describe("getTrainingWindow", () => {
  it("windowDays=7, today=2026-06-25 → startDate=2026-06-19, endDate=2026-06-25", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    const result = getTrainingWindow(7, today);
    expect(result.startDate).toBe("2026-06-19");
    expect(result.endDate).toBe("2026-06-25");
  });

  it("windowDays=14, today=2026-06-25 → startDate=2026-06-12, endDate=2026-06-25", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    const result = getTrainingWindow(14, today);
    expect(result.startDate).toBe("2026-06-12");
    expect(result.endDate).toBe("2026-06-25");
  });

  it("windowDays=30, today=2026-06-25 → startDate=2026-05-27, endDate=2026-06-25 (standard production case)", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    const result = getTrainingWindow(30, today);
    expect(result.startDate).toBe("2026-05-27");
    expect(result.endDate).toBe("2026-06-25");
  });

  it("month boundary: windowDays=7, today=2026-07-03 → startDate=2026-06-27 (not June 28 from off-by-one)", () => {
    const today = new Date("2026-07-03T00:00:00Z");
    const result = getTrainingWindow(7, today);
    expect(result.startDate).toBe("2026-06-27");
  });
});

describe("generateDateRange", () => {
  it("windowDays=7, today=2026-06-25 → length 7, first=2026-06-19, last=2026-06-25", () => {
    const dates = generateDateRange(7, "2026-06-25");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-06-19");
    expect(dates[dates.length - 1]).toBe("2026-06-25");
  });

  it("windowDays=30, today=2026-06-25 → length 30 (production window)", () => {
    const dates = generateDateRange(30, "2026-06-25");
    expect(dates).toHaveLength(30);
  });

  it("month boundary: windowDays=7, today=2026-07-03 → first element=2026-06-27", () => {
    const dates = generateDateRange(7, "2026-07-03");
    expect(dates[0]).toBe("2026-06-27");
  });

  it("cross-function consistency: generateDateRange[0] matches getTrainingWindow.startDate for windowDays=30", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    const window = getTrainingWindow(30, today);
    const dates = generateDateRange(30, window.endDate);
    expect(dates[0]).toBe(window.startDate);
  });
});

describe("isFutureUtcDate", () => {
  it("tomorrow (2026-06-26) relative to today 2026-06-25 → true", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    expect(isFutureUtcDate("2026-06-26", today)).toBe(true);
  });

  it("today (2026-06-25) → false (strict > comparison, not >=)", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    expect(isFutureUtcDate("2026-06-25", today)).toBe(false);
  });

  it("yesterday (2026-06-24) → false", () => {
    const today = new Date("2026-06-25T00:00:00Z");
    expect(isFutureUtcDate("2026-06-24", today)).toBe(false);
  });
});
