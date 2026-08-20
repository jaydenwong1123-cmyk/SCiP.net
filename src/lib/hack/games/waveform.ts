import type { HackGame } from "./types";
import { normalizeToken } from "./types";

const GLYPHS = "_.-^*#";

export type WaveformPayload = {
  reference: string;
  candidates: { id: string; trace: string }[];
  width: number;
};

type WaveformSolution = { id: string };

function renderWave(samples: number[]): string {
  return samples.map((s) => GLYPHS[s]).join("");
}

// SIGNAL ALIGNMENT.
//
// A snap-judgement game: one candidate trace is the reference shifted by some
// offset, the rest are near-misses. Fast to read and fast to answer, which is
// why it carries a below-1.0 timeFactor and drops out above band 3 — at the
// deep stages a puzzle that can be won by pattern-matching in four seconds
// would undercut the whole ladder.
export const waveformGame: HackGame = {
  id: "waveform",
  label: "SIGNAL ALIGNMENT",
  brief: "ONE TRACE IS THE REFERENCE, PHASE-SHIFTED. IDENTIFY IT BY ID.",
  minBand: 1,
  maxBand: 3,
  timeFactor: 0.9,
  // A snap visual comparison against one reference - by design the quickest game here.
  minHumanMs: 3500,

  generate(band, rng) {
    const width = band === 1 ? 24 : band === 2 ? 32 : 40;
    const candidateCount = band === 1 ? 4 : band === 2 ? 5 : 6;
    // Higher bands corrupt the decoys less, so they read closer to the truth.
    const decoyEdits = band === 1 ? 5 : band === 2 ? 3 : 2;

    const samples = Array.from({ length: width }, () =>
      rng.int(0, GLYPHS.length - 1)
    );
    const reference = renderWave(samples);

    const shift = rng.int(3, width - 3);
    const shifted = [...samples.slice(shift), ...samples.slice(0, shift)];
    const answerId = `T${rng.int(0, candidateCount - 1)}`;

    const candidates = Array.from({ length: candidateCount }, (_, i) => {
      const id = `T${i}`;
      if (id === answerId) return { id, trace: renderWave(shifted) };

      // A decoy is the true shift with a handful of samples nudged, so it
      // survives a glance and fails a read.
      const corrupted = [...shifted];
      for (let e = 0; e < decoyEdits; e++) {
        const at = rng.int(0, width - 1);
        corrupted[at] = (corrupted[at] + rng.int(1, GLYPHS.length - 1)) % GLYPHS.length;
      }
      return { id, trace: renderWave(corrupted) };
    });

    return {
      payload: { reference, candidates, width } satisfies WaveformPayload,
      solution: { id: answerId } satisfies WaveformSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { id } = solution as WaveformSolution;
    return { correct: normalizeToken(answer) === id };
  },
};
