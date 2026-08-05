import type { HackGame } from "./types";
import { normalizeToken } from "./types";
import { PASSWORD_POOL } from "@/lib/hack/wordlist";

const JUNK = "{}[]()<>!@#$%^&*=+-/\\|:;.,?~`\"'";

export type IcebreakerPayload = {
  // Each line is one row of the fake memory dump.
  lines: { address: string; junk: string; word: string; tail: string }[];
  wordLength: number;
};

type IcebreakerSolution = { password: string };

// ICE PASSWORD CRACK.
//
// The strongest game in the registry from a cheating standpoint: the answer is
// one of the words on screen, so a script gains nothing a human does not
// already see, and the likeness count that makes the puzzle tractable is
// computed here on the server and returned as a bare integer. Nothing the
// browser holds narrows the field.
//
// Wrong guesses cost an attempt rather than the round — that is the mechanic,
// not leniency. The deadline does not pause while they are spent.
export const icebreakerGame: HackGame = {
  id: "icebreaker",
  label: "ICE PASSWORD CRACK",
  brief:
    "ONE CANDIDATE IS THE KEY. EACH MISS REPORTS HOW MANY CHARACTERS MATCH IN PLACE.",
  minBand: 1,
  maxBand: 5,
  timeFactor: 1.0,

  generate(band, rng) {
    // Longer words and a wider field as the bands climb, with the attempt
    // budget tightening at the same time.
    const wordLength = band <= 2 ? 6 : band === 3 ? 7 : band === 4 ? 8 : 9;
    const candidateCount = band <= 2 ? 10 : band === 3 ? 13 : band === 4 ? 16 : 20;
    const attempts = 5 + Math.floor((wordLength - 6) / 2);

    const pool = PASSWORD_POOL[wordLength];
    const candidates = rng.sample(pool, candidateCount);
    const password = rng.pick(candidates);

    let address = rng.int(0x1000, 0xf000) & 0xfff0;
    const lines = candidates.map((word) => {
      const line = {
        address: `0x${address.toString(16).toUpperCase().padStart(4, "0")}`,
        junk: Array.from({ length: rng.int(3, 7) }, () => rng.pick([...JUNK])).join(""),
        word,
        tail: Array.from({ length: rng.int(3, 7) }, () => rng.pick([...JUNK])).join(""),
      };
      address += 0x0010;
      return line;
    });

    return {
      payload: { lines, wordLength } satisfies IcebreakerPayload,
      solution: { password } satisfies IcebreakerSolution,
      attempts,
    };
  },

  grade(solution, answer) {
    const { password } = solution as IcebreakerSolution;
    const guess = normalizeToken(answer);
    if (guess === password) return { correct: true };

    // Likeness: characters correct AND in the right position. Only ever
    // returned as a count, never as which positions.
    let likeness = 0;
    for (let i = 0; i < Math.min(guess.length, password.length); i++) {
      if (guess[i] === password[i]) likeness++;
    }
    return {
      correct: false,
      feedback: `ACCESS DENIED — LIKENESS ${likeness}/${password.length}`,
    };
  },
};
