import type { HackGame } from "./types";
import { normalizeToken } from "./types";

export type KeypadPayload = {
  length: number;
  clues: string[];
};

type KeypadSolution = { code: string };

const PRIMES = new Set([2, 3, 5, 7]);

type ClueKind =
  | "sum"
  | "primeCount"
  | "evenCount"
  | "largest"
  | "smallest"
  | "noRepeat"
  | "zeroCount"
  | "product"
  | "endsSum"
  | "compare"
  | "equal"
  | "parity"
  | "digit";

type Clue = {
  kind: ClueKind;
  text: string;
  holds: (digits: number[]) => boolean;
  // Digit position this clue is about, when it's about one (for negation).
  i?: number;
};

// Every clue is a predicate over the whole code plus the sentence that states
// it. Generating the code FIRST and then describing true facts about it means
// a clue can never contradict another true clue — the classic failure mode
// for puzzle generators of this shape.
function cluesFor(code: number[]): Clue[] {
  const sum = code.reduce((a, b) => a + b, 0);
  const primeCount = code.filter((d) => PRIMES.has(d)).length;
  const evenCount = code.filter((d) => d % 2 === 0).length;
  const largest = Math.max(...code);
  const smallest = Math.min(...code);
  const zeroCount = code.filter((d) => d === 0).length;
  const product = code.reduce((a, b) => a * b, 1);
  const endsSum = code[0] + code[code.length - 1];

  const clues: Clue[] = [
    { kind: "sum", text: `THE DIGITS SUM TO ${sum}`, holds: (d) => d.reduce((a, b) => a + b, 0) === sum },
    {
      kind: "primeCount",
      text: `EXACTLY ${primeCount} DIGIT(S) ARE PRIME`,
      holds: (d) => d.filter((x) => PRIMES.has(x)).length === primeCount,
    },
    {
      kind: "evenCount",
      text: `EXACTLY ${evenCount} DIGIT(S) ARE EVEN`,
      holds: (d) => d.filter((x) => x % 2 === 0).length === evenCount,
    },
    { kind: "largest", text: `THE LARGEST DIGIT IS ${largest}`, holds: (d) => Math.max(...d) === largest },
    { kind: "smallest", text: `THE SMALLEST DIGIT IS ${smallest}`, holds: (d) => Math.min(...d) === smallest },
    { kind: "noRepeat", text: "NO DIGIT REPEATS", holds: (d) => new Set(d).size === d.length },
    {
      kind: "zeroCount",
      text: `THE CODE CONTAINS ${zeroCount} ZERO(S)`,
      holds: (d) => d.filter((x) => x === 0).length === zeroCount,
    },
    {
      kind: "product",
      text: `THE DIGITS MULTIPLY TO ${product}`,
      holds: (d) => d.reduce((a, b) => a * b, 1) === product,
    },
  ];

  if (code.length >= 2) {
    clues.push({
      kind: "endsSum",
      text: `THE FIRST AND LAST DIGITS SUM TO ${endsSum}`,
      holds: (d) => d[0] + d[d.length - 1] === endsSum,
    });
  }

  for (let i = 0; i < code.length - 1; i++) {
    const a = code[i];
    const b = code[i + 1];
    if (a === b) {
      // Adjacent digits can tie — stating GREATER/LESS here would be a false
      // clue, so a tie gets its own honest statement instead.
      clues.push({
        kind: "equal",
        i,
        text: `DIGIT ${i + 1} EQUALS DIGIT ${i + 2}`,
        holds: (d) => d[i] === d[i + 1],
      });
    } else if (a < b) {
      clues.push({
        kind: "compare",
        i,
        text: `DIGIT ${i + 1} IS LESS THAN DIGIT ${i + 2}`,
        holds: (d) => d[i] < d[i + 1],
      });
    } else {
      clues.push({
        kind: "compare",
        i,
        text: `DIGIT ${i + 1} IS GREATER THAN DIGIT ${i + 2}`,
        holds: (d) => d[i] > d[i + 1],
      });
    }
  }

  for (let i = 0; i < code.length; i++) {
    clues.push({
      kind: "parity",
      i,
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
// satisfies every TRUE statement, which makes this one of the harder games to
// attack with a naive scraper, though of course a brute-forcer can do what the
// generator does in reverse.
//
// The generator guarantees uniqueness by construction: it adds true clues one
// at a time until exactly one code in the whole space survives. Codes are kept
// to at most five digits so that exhaustive check stays trivial (10^5). Only
// clues actually true of the generated code (`holds(code)`) are ever eligible
// for that pinning set — NO DIGIT REPEATS, for instance, is false whenever the
// code happens to repeat a digit, and must never be picked in that case.
//
// On top of the pinning set, up to two decoy pairs are added: "DIGIT i IS v"
// next to "DIGIT i IS NOT v" for the same i and v. Exactly one half of each
// pair is true no matter what v is, so they always cancel out — and because
// they're a single-digit equality check rather than a global fact (sum,
// product, etc.), verifying which half is true never requires more than
// reading off one digit. Nothing in the pinning set is ever touched by this.
export const keypadGame: HackGame = {
  id: "keypad",
  label: "CONSTRAINT DEDUCTION",
  brief:
    "SOME STATEMENTS ARE FALSE AND CONTRADICT THEIR PAIR — THOSE CANCEL OUT. EVERY OTHER STATEMENT IS TRUE. ENTER THE CODE THEY PIN DOWN.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.25,

  generate(band, rng) {
    const length = band <= 2 ? 3 : band <= 4 ? 4 : 5;
    const code = Array.from({ length }, () => rng.int(0, 9));

    // Defensive: a clue is only usable for pinning the code if it is
    // actually true of it (NO DIGIT REPEATS can be false).
    const pool = rng.shuffle(cluesFor(code).filter((c) => c.holds(code)));
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
          kind: "digit",
          text: `DIGIT ${i + 1} IS ${value}`,
          holds: (d) => d[i] === value,
        });
      }
    }

    // Decoy pairs: pick a digit position and a value, then state both
    // "IS v" and "IS NOT v". Whichever half matches the real digit is true;
    // the other is false — either way they cancel out, and never touch the
    // pinning set above.
    const decoyPairCount = Math.min(2, band <= 2 ? 1 : 2);
    const decoyPositions = rng.sample(
      Array.from({ length }, (_, i) => i),
      decoyPairCount
    );
    const decoyLines: string[] = [];
    for (const i of decoyPositions) {
      const v = rng.int(0, 9);
      decoyLines.push(`DIGIT ${i + 1} IS ${v}`, `DIGIT ${i + 1} IS NOT ${v}`);
    }

    return {
      payload: {
        length,
        clues: rng.shuffle([...chosen.map((c) => c.text), ...decoyLines]),
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
