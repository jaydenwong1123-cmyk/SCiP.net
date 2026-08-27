import type { HackGame } from "./types";

// TIMING GATE.
//
// No text to read, no code to crack — just a clock. `generate` draws a hidden
// target somewhere in the game's range and hands the browser the WINDOW
// around it (target ± tolerance), because unlike every other game here the
// window IS the puzzle: there is nothing else to show a player that would let
// them play at all. `grade` never receives more than the elapsed
// milliseconds the browser measured between its own start and stop clicks,
// so, like every other game in the registry, a script that already knows the
// window can wait out the target with a plain timer — the defence is that a
// human has to physically click "stop" and pay for their own reaction lag,
// not that the target is secret.
//
// Two variants, one mechanic: L-1 is forgiving on both the range and the
// tolerance; O5 keeps the range wide but tightens the tolerance to something
// close to the floor of human reaction time. minBand/maxBand pin each variant
// to exactly one band rather than a window. The O5 cut sits at band 5
// alongside L-5 rather than a band of its own, so it shares the L-5 slot in
// both the training range and the live stage-5 ladder.

type StopwatchSolution = {
  targetMs: number;
  toleranceMs: number;
};

export type StopwatchPayload = {
  windowStartMs: number;
  windowEndMs: number;
};

function makeStopwatchGame(opts: {
  id: string;
  label: string;
  brief: string;
  band: number;
  rangeMinMs: number;
  rangeMaxMs: number;
  toleranceMs: number;
  timeFactor: number;
  minHumanMs: number;
  attempts: number;
}): HackGame {
  return {
    id: opts.id,
    label: opts.label,
    brief: opts.brief,
    minBand: opts.band,
    maxBand: opts.band,
    timeFactor: opts.timeFactor,
    minHumanMs: opts.minHumanMs,

    generate(_band, rng) {
      const targetMs = rng.int(opts.rangeMinMs, opts.rangeMaxMs);
      const solution: StopwatchSolution = {
        targetMs,
        toleranceMs: opts.toleranceMs,
      };
      const payload: StopwatchPayload = {
        windowStartMs: targetMs - opts.toleranceMs,
        windowEndMs: targetMs + opts.toleranceMs,
      };
      return { payload, solution, attempts: opts.attempts };
    },

    grade(solution, answer) {
      const { targetMs, toleranceMs } = solution as StopwatchSolution;
      const stopped = Number(answer);
      if (!Number.isFinite(stopped)) {
        return { correct: false, feedback: "NO STOP RECORDED." };
      }
      const diff = stopped - targetMs;
      if (Math.abs(diff) <= toleranceMs) return { correct: true };
      return { correct: false, feedback: diff > 0 ? "TOO LATE." : "TOO EARLY." };
    },
  };
}

export const stopwatchL1Game: HackGame = makeStopwatchGame({
  id: "stopwatch-l1",
  label: "TIMING GATE",
  brief: "START THE CLOCK. STOP IT INSIDE THE WINDOW SHOWN. ONE STOP ONLY.",
  band: 1,
  rangeMinMs: 5_000,
  rangeMaxMs: 30_000,
  toleranceMs: 500,
  timeFactor: 1,
  minHumanMs: 3_000,
  attempts: 1,
});

export const stopwatchO5Game: HackGame = makeStopwatchGame({
  id: "stopwatch-o5",
  label: "TIMING GATE",
  brief:
    "START THE CLOCK. STOP IT INSIDE THE WINDOW SHOWN. ONE STOP ONLY — NO MARGIN FOR HESITATION.",
  band: 5,
  rangeMinMs: 3_000,
  rangeMaxMs: 45_000,
  toleranceMs: 100,
  timeFactor: 1,
  minHumanMs: 1_800,
  attempts: 1,
});
