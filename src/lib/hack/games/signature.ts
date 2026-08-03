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
export const signatureGame: HackGame = {
  id: "signature",
  label: "TOKEN REASSEMBLY",
  brief:
    "REBUILD THE AUTH TOKEN FROM ITS FRAGMENTS. DECOYS ARE PRESENT. SUBMIT THE ASSEMBLED TOKEN.",
  minBand: 3,
  maxBand: 5,
  timeFactor: 1.3,

  generate(band, rng) {
    const realCount = band === 3 ? 5 : band === 4 ? 6 : 8;
    const decoyCount = band === 3 ? 3 : band === 4 ? 5 : 6;
    const ruleCount = band === 3 ? 2 : band === 4 ? 4 : 5;
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

    const rulePool: string[] = [
      `THE TOKEN OPENS WITH ${real[0]}`,
      `THE TOKEN CLOSES WITH ${real[realCount - 1]}`,
      `THE TOKEN IS EXACTLY ${realCount} FRAGMENTS LONG`,
    ];
    for (let i = 0; i < realCount - 1; i++) {
      rulePool.push(`${real[i]} IMMEDIATELY PRECEDES ${real[i + 1]}`);
    }
    for (const decoy of decoys) {
      rulePool.push(`${decoy} IS NOT PART OF THE TOKEN`);
    }

    // Always lead with the two anchors, then fill with adjacency and exclusion
    // facts — without the anchors the chain has no starting point.
    const anchored = rulePool.slice(0, 2);
    const rest = rng.sample(rulePool.slice(2), Math.max(0, ruleCount - 2));

    return {
      payload: {
        fragments: rng.shuffle([...real, ...decoys]),
        rules: [...anchored, ...rest],
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
