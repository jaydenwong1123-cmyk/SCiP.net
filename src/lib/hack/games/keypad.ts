import type { HackGame } from "./types";
import { normalizeToken } from "./types";

export type KeypadPayload = {
  length: number;
  clues: string[];
};

type KeypadSolution = { code: string };

// CONSTRAINT DEDUCTION.
//
// A 4-digit code described only by "DIGIT i IS v" / "DIGIT i IS NOT v"
// statements — no sums, parity, comparisons, or other derived facts. Exactly
// four statements are true, one per digit position, and together they pin
// the code with no contradiction among themselves. Every other statement
// comes as a contradicting pair: "DIGIT i IS v" next to "DIGIT i IS NOT v"
// for the same i and v, where v is never the real digit at that position —
// so one half is true and one false, but neither half duplicates a pinning
// statement, and either way the pair cancels out and never touches the
// pinning set.
//
// Total statement count scales with band: 6 for L2-L3 (one contradicting
// pair), 8 for L4 (two pairs), 10 for L5+ (three pairs).
export const keypadGame: HackGame = {
  id: "keypad",
  label: "CONSTRAINT DEDUCTION",
  brief:
    "SOME STATEMENTS ARE FALSE AND CONTRADICT THEIR PAIR — THOSE CANCEL OUT. EVERY OTHER STATEMENT IS TRUE. ENTER THE CODE THEY PIN DOWN.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.25,

  generate(band, rng) {
    const length = 4;
    const code = Array.from({ length }, () => rng.int(0, 9));

    const pinning = code.map((v, i) => `DIGIT ${i + 1} IS ${v}`);

    const pairCount = band <= 3 ? 1 : band === 4 ? 2 : 3;
    const decoyPositions = rng.sample(
      Array.from({ length }, (_, i) => i),
      pairCount
    );
    const decoyLines: string[] = [];
    for (const i of decoyPositions) {
      let v = rng.int(0, 9);
      while (v === code[i]) v = rng.int(0, 9);
      decoyLines.push(`DIGIT ${i + 1} IS ${v}`, `DIGIT ${i + 1} IS NOT ${v}`);
    }

    return {
      payload: {
        length,
        clues: rng.shuffle([...pinning, ...decoyLines]),
      } satisfies KeypadPayload,
      solution: { code: code.join("") } satisfies KeypadSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { code } = solution as KeypadSolution;
    return { correct: normalizeToken(answer) === code };
  },
};
