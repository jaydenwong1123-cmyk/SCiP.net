import type { HackGame } from "./types";
import { normalizeToken } from "./types";
import { FRAGMENT_CHARS } from "@/lib/hack/wordlist";

export type SignaturePayload = {
  fragments: string[];
  rules: string[];
  tokenLength: number;
};

type SignatureSolution = { token: string };

// TOKEN REASSEMBLY.
//
// The real fragments plus a pile of decoys, shuffled together, and a set of
// ordering constraints that identify the correct arrangement. The player must
// both exclude the decoys and order what remains.
//
// The constraints are derived from the assembled token, so they are always
// mutually satisfiable — and they are stated in terms of fragment CONTENT
// rather than position, so they cannot be followed mechanically without first
// working out which fragments belong.
//
// The opening anchor plus the full adjacency chain is the MINIMUM needed to
// reconstruct the token unambiguously — every one of those is always shown.
// Only flavor on top (the length statement, decoy call-outs) is ever sampled
// down; trimming an adjacency link instead would leave a gap in the chain
// with nothing on screen to fill it.
export const signatureGame: HackGame = {
  id: "signature",
  label: "TOKEN REASSEMBLY",
  brief:
    "REBUILD THE AUTH TOKEN FROM ITS FRAGMENTS. DECOYS ARE PRESENT. SUBMIT THE ASSEMBLED TOKEN.",
  minBand: 3,
  maxBand: 5,
  timeFactor: 1.3,
  // Fragments are clicked rather than typed, so a short token assembles fast.
  minHumanMs: 8000,

  generate(band, rng) {
    const realCount = band === 3 ? 5 : band === 4 ? 6 : 8;
    const decoyCount = band === 3 ? 3 : band === 4 ? 5 : 6;
    const extraCount = band === 3 ? 1 : band === 4 ? 2 : 3;
    const fragmentSize = 3;

    const chars = [...FRAGMENT_CHARS];
    const real = Array.from({ length: realCount }, () =>
      Array.from({ length: fragmentSize }, () => rng.pick(chars)).join("")
    );
    const token = real.join("");

    // Decoys are drawn from the same alphabet and length, so they are
    // indistinguishable from a real fragment on sight alone.
    const decoys: string[] = [];
    while (decoys.length < decoyCount) {
      const candidate = Array.from({ length: fragmentSize }, () =>
        rng.pick(chars)
      ).join("");
      if (!real.includes(candidate) && !decoys.includes(candidate)) {
        decoys.push(candidate);
      }
    }

    // Essential: the opening anchor plus every adjacency link. Together these
    // fully determine the order — nothing here is ever left out.
    const essential: string[] = [`THE TOKEN OPENS WITH ${real[0]}`];
    for (let i = 0; i < realCount - 1; i++) {
      essential.push(`${real[i]} IMMEDIATELY PRECEDES ${real[i + 1]}`);
    }
    essential.push(`THE TOKEN CLOSES WITH ${real[realCount - 1]}`);

    // Flavor: redundant with the essential chain, so trimming these can never
    // make the puzzle unsolvable — only easier to double-check.
    const extraPool: string[] = [
      `THE TOKEN IS EXACTLY ${realCount} FRAGMENTS LONG`,
      ...decoys.map((decoy) => `${decoy} IS NOT PART OF THE TOKEN`),
    ];
    const extra = rng.sample(extraPool, Math.min(extraCount, extraPool.length));

    return {
      payload: {
        fragments: rng.shuffle([...real, ...decoys]),
        rules: [...essential, ...extra],
        tokenLength: realCount * fragmentSize,
      } satisfies SignaturePayload,
      solution: { token } satisfies SignatureSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { token } = solution as SignatureSolution;
    return { correct: normalizeToken(answer) === token };
  },
};
