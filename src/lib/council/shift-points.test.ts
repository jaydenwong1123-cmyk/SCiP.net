import { describe, it, expect } from "vitest";
import { formatDuration, parseMinutes, shiftPoints } from "./shift-points";

// The conversion table from shift-points.ts, pinned at every boundary.

describe("shiftPoints", () => {
  it.each([
    [0, 0],
    [9, 0],
    [10, 0.5],
    [17, 0.5],
    [18, 1],
    [35, 1],
    [36, 2],
    [54, 2],
    [55, 4],
    [60, 4],
    [61, 4],
    [67, 4],
    [68, 5], // 8 minutes into the first block counts it
    [70, 5],
    [77, 5],
    [78, 6],
    [80, 6],
    [110, 9],
    [117, 9],
    [118, 12], // sixth block reached early: 4 + 6 + bonus 2
    [120, 12],
    [130, 13],
    [180, 18],
  ])("%i minutes → %d points", (minutes, points) => {
    expect(shiftPoints(minutes)).toBe(points);
  });

  it("does not pay the half point again on 70–77 minute shifts", () => {
    // The original script did: it checked the special bracket against the
    // minutes left after taking the first hour off.
    for (let m = 70; m <= 77; m++) {
      expect(Number.isInteger(shiftPoints(m))).toBe(true);
    }
  });

  it("drops seconds and ignores negatives", () => {
    expect(shiftPoints(17.99)).toBe(0.5);
    expect(shiftPoints(-5)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("names only the parts that are there", () => {
    expect(formatDuration(8 * 3600 + 7 * 60 + 2)).toBe("8 hours, 7 minutes, 2 seconds");
    expect(formatDuration(48 * 60 + 42)).toBe("48 minutes, 42 seconds");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(61)).toBe("1 minute, 1 second");
    expect(formatDuration(0)).toBe("0 seconds");
  });
});

describe("parseMinutes", () => {
  it.each([
    ["90", 90],
    ["0", 0],
    ["1h30m", 90],
    ["1h 30m", 90],
    ["2h", 120],
    ["45m", 45],
    ["45 mins", 45],
    ["1 hour 5 minutes", 65],
    ["1:30", 90],
  ])("%s → %i", (input, minutes) => {
    expect(parseMinutes(input)).toBe(minutes);
  });

  it.each(["", "abc", "1.5", "-10", "1:75", "h", "99999"])("rejects %j", (input) => {
    expect(parseMinutes(input)).toBeNull();
  });
});
