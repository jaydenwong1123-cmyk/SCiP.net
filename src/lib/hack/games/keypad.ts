import type { HackGame } from "./types";
import { normalizeToken } from "./types";

export type KeypadPayload = {
  length: number;
  clues: string[];
};

type KeypadSolution = { code: string };

const PRIMES = new Set([2, 3, 5, 7]);

type Clue = { text: string; holds: (digits: number[]) => boolean };

// Every clue is a predicate over the whole code plus the sentence that states
// it. Generating the code FIRST and then describing true facts about it means
// a clue can never contradict another — the classic failure mode for puzzle
// generators of this shape.
function cluesFor(code: number[]): Clue[] {
  const sum = code.reduce((a, b) => a + b, 0);
  const primeCount = code.filter((d) => PRIMES.has(d)).length;
  const evenCount = code.filter((d) => d % 2 === 0).length;
  const largest = Math.max(...code);
  const smallest = Math.min(...code);

  const clues: Clue[] = [
    { text: `THE DIGITS SUM TO ${sum}`, holds: (d) => d.reduce((a, b) => a + b, 0) === sum },
    {
      text: `EXACTLY ${primeCount} DIGIT(S) ARE PRIME`,
      holds: (d) => d.filter((x) => PRIMES.has(x)).length === primeCount,
    },
    {
      text: `EXACTLY ${evenCount} DIGIT(S) ARE EVEN`,
      holds: (d) => d.filter((x) => x % 2 === 0).length === evenCount,
    },
    { text: `THE LARGEST DIGIT IS ${largest}`, holds: (d) => Math.max(...d) === largest },
    { text: `THE SMALLEST DIGIT IS ${smallest}`, holds: (d) => Math.min(...d) === smallest },
    { text: "NO DIGIT REPEATS", holds: (d) => new Set(d).size === d.length },
  ];

  for (let i = 0; i < code.length - 1; i++) {
    const a = code[i];
    const b = code[i + 1];
    if (a < b) {
      clues.push({
        text: `DIGIT ${i + 1} IS LESS THAN DIGIT ${i + 2}`,
        holds: (d) => d[i] < d[i + 1],
      });
    } else {
      clues.push({
        text: `DIGIT ${i + 1} IS GREATER THAN DIGIT ${i + 2}`,
        holds: (d) => d[i] > d[i + 1],
      });
    }
  }

  for (let i = 0; i < code.length; i++) {
    clues.push({
      text: `DIGIT ${i + 1} IS ${code[i] % 2 === 0 ? "EVEN" : "ODD"}`,
      holds: (d) => d[i] % 2 === code[i] % 2,
    });
  }

  return clues;
}

function* allCodes(length: number): Generator<number[]> {
  const digits = new Array(length).fill(0);
  const total = 10 ** length;
  for (let n = 0; n < total; n++) {
    let rest = n;
    for (let i = length - 1; i >= 0; i--) {
      digits[i] = rest % 10;
      rest = Math.floor(rest / 10);
    }
    yield digits;
  }
}

function solutionCount(length: number, chosen: Clue[]): number {
  let count = 0;
  for (const candidate of allCodes(length)) {
    if (chosen.every((c) => c.holds(candidate))) {
      count++;
      if (count > 1) return count;
    }
  }
  return count;
}

// CONSTRAINT DEDUCTION.
//
// A numeric code described only by facts about it. The answer is never present
// in the payload in any form — it exists solely as the unique assignment that
// satisfies every clue, which makes this one of the harder games to attack with
// a naive scraper, though of course a brute-forcer can do what the generator
// does in reverse.
//
// The generator guarantees uniqueness by construction: it adds true clues one
// at a time until exactly one code in the whole space survives. Codes are kept
// to at most five digits so that exhaustive check stays trivial (10^5).
export const keypadGame: HackGame = {
  id: "keypad",
  label: "CONSTRAINT DEDUCTION",
  brief: "EXACTLY ONE CODE SATISFIES EVERY STATEMENT. ENTER IT.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.25,

  generate(band, rng) {
    const length = band <= 2 ? 3 : band <= 4 ? 4 : 5;
    const code = Array.from({ length }, () => rng.int(0, 9));

    const pool = rng.shuffle(cluesFor(code));
    const chosen: Clue[] = [];
    for (const clue of pool) {
      chosen.push(clue);
      if (solutionCount(length, chosen) === 1) break;
    }

    // If the pool ran dry without pinning it down (possible for degenerate
    // codes like 5555), fall back to stating the code digit by digit — still a
    // fair puzzle, just a dull one, and far better than an ambiguous round.
    if (solutionCount(length, chosen) !== 1) {
      chosen.length = 0;
      for (let i = 0; i < length; i++) {
        const value = code[i];
        chosen.push({
          text: `DIGIT ${i + 1} IS ${value}`,
          holds: (d) => d[i] === value,
        });
      }
    }

    return {
      payload: {
        length,
        clues: rng.shuffle(chosen.map((c) => c.text)),
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
