import { describe, it, expect } from "vitest";
import {
  DRILL_BANDS,
  isDrillBand,
  drillBandLabel,
  drillRoster,
} from "./drills";
import { createRng } from "./rng";
import {
  eligibleGames,
  GAME_IDS,
  gameFor,
  generateChallenge,
  gradeAnswer,
} from "./games";

// These cover the range's contract with the registry, which is the part that
// can rot: a game whose band window is retuned, or a new game added with a
// window that leaves a difficulty empty, would break the picker silently.

describe("drill bands", () => {
  it("every band has at least one eligible drill", () => {
    for (const band of DRILL_BANDS) {
      expect(eligibleGames(band).length).toBeGreaterThan(0);
    }
  });

  it("labels bands as L-1 through L-5", () => {
    expect(DRILL_BANDS.map(drillBandLabel)).toEqual([
      "L-1",
      "L-2",
      "L-3",
      "L-4",
      "L-5",
    ]);
  });

  it("rejects bands outside the range", () => {
    expect(isDrillBand(0)).toBe(false);
    expect(isDrillBand(6)).toBe(false);
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

describe("answer keys", () => {
  // The key is what the range shows once a drill settles, so it has to be the
  // answer a player would actually type: feeding it back to the grader must
  // pass, for every game at every band it runs at.
  it("grades as correct for every game at every band", () => {
    for (const game of drillRoster()) {
      for (const band of DRILL_BANDS) {
        if (band < game.minBand || band > game.maxBand) continue;
        for (let seed = 1; seed <= 25; seed++) {
          const { solution } = generateChallenge(game.id, band, createRng(seed));
          const key = gameFor(game.id)?.answerKey?.(solution);
          expect(key, `${game.id} has no answer key`).toBeTypeOf("string");
          // The timing gate's key is prose; its answer is the leading number.
          const answer = game.id.startsWith("stopwatch")
            ? String(parseInt(key as string, 10))
            : (key as string);
          expect(gradeAnswer(game.id, solution, answer).correct).toBe(true);
        }
      }
    }
  });
});
