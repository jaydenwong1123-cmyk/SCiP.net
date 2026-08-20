import type { HackGame } from "./types";
import { normalizeList, sameSet } from "./types";

export type BytepairPayload = {
  grid: string[][];
  orphanCount: number;
  // Band 5 demands the answer in ascending hex order rather than any order.
  ordered: boolean;
};

type BytepairSolution = { orphans: string[]; ordered: boolean };

// MEMORY PARITY SCAN.
//
// Every byte in the grid appears exactly twice except a handful, and the player
// reports the unpaired ones. The difficulty is entirely in the near-miss
// decoys: pairs like 3F/3E sit in the grid so that scanning by shape rather
// than by value fails.
//
// At band 5 the answer must additionally be in ascending order, which removes
// the option of calling out orphans in the order they are spotted.
//
// Orphan counts are always EVEN because every grid has an even cell count: an
// odd split would leave one slot over, and whatever filled it would become a
// third copy of some byte — i.e. a phantom orphan the answer key does not know
// about, making the round unwinnable.
export const bytepairGame: HackGame = {
  id: "bytepair",
  label: "MEMORY PARITY SCAN",
  brief: "EVERY BYTE IS MIRRORED EXCEPT A FEW. REPORT THE UNPAIRED BYTES.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.0,
  // Scanning a grid for unpaired bytes is quick once seen, but the grid has to be read first.
  minHumanMs: 10000,

  generate(band, rng) {
    const size = band <= 2 ? 6 : band <= 4 ? 8 : 10;
    const orphanCount = band <= 2 ? 2 : band <= 4 ? 4 : 6;
    const nearMissTarget = band <= 2 ? 2 : band === 3 ? 6 : band === 4 ? 8 : 10;
    const ordered = band >= 5;

    const cells = size * size;
    const pairsNeeded = (cells - orphanCount) / 2;

    const used = new Set<string>();
    const freshByte = () => {
      let b: string;
      do {
        b = rng.hexByte();
      } while (used.has(b));
      used.add(b);
      return b;
    };

    const orphans = Array.from({ length: orphanCount }, freshByte);
    const values = [...orphans];
    let pairsPlaced = 0;

    // Near-miss decoys first: pairs one bit away from an orphan, so a scan by
    // silhouette reads them as that orphan's partner.
    for (let i = 0; i < nearMissTarget && pairsPlaced < pairsNeeded; i++) {
      const base = parseInt(orphans[i % orphans.length], 16);
      let candidate = "";
      for (let attempt = 0; attempt < 8; attempt++) {
        const flipped = ((base ^ (1 << rng.int(0, 7))) & 0xff)
          .toString(16)
          .toUpperCase()
          .padStart(2, "0");
        if (!used.has(flipped)) {
          candidate = flipped;
          break;
        }
      }
      if (!candidate) continue;
      used.add(candidate);
      values.push(candidate, candidate);
      pairsPlaced++;
    }

    // Remainder is ordinary filler. Exact by construction — no leftover slot.
    while (pairsPlaced < pairsNeeded) {
      const b = freshByte();
      values.push(b, b);
      pairsPlaced++;
    }

    const flat = rng.shuffle(values);
    const grid: string[][] = [];
    for (let r = 0; r < size; r++) {
      grid.push(flat.slice(r * size, r * size + size));
    }

    return {
      payload: { grid, orphanCount, ordered } satisfies BytepairPayload,
      solution: { orphans, ordered } satisfies BytepairSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { orphans, ordered } = solution as BytepairSolution;
    const given = normalizeList(answer);
    if (!ordered) return { correct: sameSet(given, orphans) };

    const expected = [...orphans].sort();
    return {
      correct:
        given.length === expected.length &&
        given.every((byte, i) => byte === expected[i]),
    };
  },
};
