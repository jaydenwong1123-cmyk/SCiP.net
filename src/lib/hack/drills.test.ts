import { describe, it, expect } from "vitest";
import {
  DRILL_BANDS,
  isDrillBand,
  drillBandLabel,
  drillRoster,
} from "./drills";
import { eligibleGames, GAME_IDS } from "./games";

// These cover the range's contract with the registry, which is the part that
// can rot: a game whose band window is retuned, or a new game added with a
// window that leaves a difficulty empty, would break the picker silently.

describe("drill bands", () => {
  it("every band has at least one eligible drill", () => {
    for (const band of DRILL_BANDS) {
      expect(eligibleGames(band).length).toBeGreaterThan(0);
    }
  });

  it("labels bands as L-1 through L-O5", () => {
    expect(DRILL_BANDS.map(drillBandLabel)).toEqual([
      "L-1",
      "L-2",
      "L-3",
      "L-4",
      "L-5",
      "L-O5",
    ]);
  });

  it("rejects bands outside the range", () => {
    expect(isDrillBand(0)).toBe(false);
    expect(isDrillBand(7)).toBe(false);
    expect(isDrillBand(1.5)).toBe(false);
  });
});

describe("drillRoster", () => {
  it("offers every game in the registry exactly once", () => {
    const roster = drillRoster();
    const ids = roster.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...GAME_IDS].sort());
  });

  it("reports a band window that agrees with the registry", () => {
    for (const game of drillRoster()) {
      for (const band of DRILL_BANDS) {
        const inWindow = band >= game.minBand && band <= game.maxBand;
        const listed = eligibleGames(band).some((g) => g.id === game.id);
        expect(listed).toBe(inWindow);
      }
    }
  });

  it("never advertises an empty band window", () => {
    for (const game of drillRoster()) {
      expect(game.minBand).toBeLessThanOrEqual(game.maxBand);
    }
  });
});
