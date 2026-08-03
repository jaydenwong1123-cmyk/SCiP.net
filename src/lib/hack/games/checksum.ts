import type { HackGame } from "./types";
import { normalizeToken } from "./types";
import type { Rng } from "@/lib/hack/rng";

export type ChecksumPayload = {
  bytes: string[];
  // Ordered instructions, applied to an accumulator starting at 0x00.
  steps: string[];
};

type ChecksumSolution = { result: string };

type Op = { label: string; apply: (acc: number, bytes: number[]) => number };

// The template pool. Sampling from it means a returning player cannot skip
// reading the instructions, and an auto-solver has to parse the rule text
// rather than hard-code one formula.
function opPool(rng: Rng): Op[] {
  const k = rng.int(2, 9);
  const threshold = rng.int(0x40, 0xc0);
  const hexThreshold = `0x${threshold.toString(16).toUpperCase().padStart(2, "0")}`;

  return [
    {
      label: "XOR EVERY BYTE AT AN EVEN OFFSET INTO THE ACCUMULATOR",
      apply: (acc, bytes) =>
        bytes.reduce((a, b, i) => (i % 2 === 0 ? a ^ b : a), acc),
    },
    {
      label: "XOR EVERY BYTE AT AN ODD OFFSET INTO THE ACCUMULATOR",
      apply: (acc, bytes) =>
        bytes.reduce((a, b, i) => (i % 2 === 1 ? a ^ b : a), acc),
    },
    {
      label: `ADD THE COUNT OF BYTES STRICTLY ABOVE ${hexThreshold}`,
      apply: (acc, bytes) => acc + bytes.filter((b) => b > threshold).length,
    },
    {
      label: `ADD THE COUNT OF BYTES STRICTLY BELOW ${hexThreshold}`,
      apply: (acc, bytes) => acc + bytes.filter((b) => b < threshold).length,
    },
    {
      label: "SUBTRACT THE LOW NIBBLE OF THE FINAL BYTE",
      apply: (acc, bytes) => acc - (bytes[bytes.length - 1] & 0x0f),
    },
    {
      label: "ADD THE HIGH NIBBLE OF THE FIRST BYTE",
      apply: (acc, bytes) => acc + (bytes[0] >> 4),
    },
    {
      label: `ROTATE THE ACCUMULATOR LEFT BY ${k} BITS (8-BIT)`,
      apply: (acc) => ((acc << k % 8) | (acc >> (8 - (k % 8)))) & 0xff,
    },
    {
      label: "XOR THE ACCUMULATOR WITH THE NUMBER OF BYTES IN THE BLOCK",
      apply: (acc, bytes) => acc ^ bytes.length,
    },
    {
      label: "ADD THE LARGEST BYTE IN THE BLOCK",
      apply: (acc, bytes) => acc + Math.max(...bytes),
    },
    {
      label: "SUBTRACT THE SMALLEST BYTE IN THE BLOCK",
      apply: (acc, bytes) => acc - Math.min(...bytes),
    },
  ];
}

// INTEGRITY ARITHMETIC.
//
// A block of bytes and a chain of operations to fold over it. Pure computation
// from visible inputs, so it is scriptable in principle — the defence is that
// the rule chain is assembled fresh from a template pool each time, and the
// clock does not care how you arrive at the answer.
export const checksumGame: HackGame = {
  id: "checksum",
  label: "INTEGRITY ARITHMETIC",
  brief:
    "FOLD THE BLOCK USING EVERY STEP IN ORDER, ACCUMULATOR STARTS AT 0x00. REPORT TWO HEX DIGITS.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.15,

  generate(band, rng) {
    const byteCount = band === 2 ? 8 : band === 3 ? 16 : band === 4 ? 24 : 40;
    const stepCount = band === 2 ? 1 : band === 3 ? 2 : band === 4 ? 3 : 4;

    const numeric = Array.from({ length: byteCount }, () => rng.int(0, 255));
    const bytes = numeric.map((b) =>
      b.toString(16).toUpperCase().padStart(2, "0")
    );

    const chosen = rng.sample(opPool(rng), stepCount);
    let acc = 0;
    for (const op of chosen) {
      // Wrap to 8 bits after every step, so the player never has to hold a
      // value wider than the accumulator the brief describes.
      acc = ((op.apply(acc, numeric) % 256) + 256) % 256;
    }

    return {
      payload: {
        bytes,
        steps: chosen.map((op) => op.label),
      } satisfies ChecksumPayload,
      solution: {
        result: acc.toString(16).toUpperCase().padStart(2, "0"),
      } satisfies ChecksumSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { result } = solution as ChecksumSolution;
    // Accept "3F", "0x3F" and "3f" alike.
    const given = normalizeToken(answer).replace(/^0X/, "");
    return { correct: given.padStart(2, "0") === result };
  },
};
