import type { HackGame } from "./types";
import { normalizeToken } from "./types";
import { CIPHER_PHRASES } from "@/lib/hack/wordlist";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type CipherPayload = {
  ciphertext: string;
  // Band 1-2: a Caesar shift, stated outright. Band 3+: null, and the table
  // below carries the mapping instead.
  shift: number | null;
  // Rows of [cipherLetter, plainLetter] for the letters actually used, padded
  // with decoy columns at the top bands so the table cannot simply be read
  // straight through.
  table: [string, string][] | null;
};

type CipherSolution = { plaintext: string };

function caesar(text: string, shift: number): string {
  return text.replace(/[A-Z]/g, (ch) =>
    ALPHABET[(ALPHABET.indexOf(ch) + shift + 26) % 26]
  );
}

// SUBSTITUTION BREAK.
//
// Band 1-2 is a Caesar with the shift printed — mechanical, and a gentle way
// into the ladder. Band 3-4 swaps to a full random substitution and hands over
// a lookup table salted with decoy rows for letters that never appear, which
// turns it into transcription under time pressure rather than cryptanalysis.
// That is intentional: a genuine cipher break is not a 30-second task.
export const cipherGame: HackGame = {
  id: "cipher",
  label: "SUBSTITUTION BREAK",
  brief: "DECODE THE INTERCEPT. SUBMIT PLAINTEXT.",
  minBand: 1,
  // Pulled back from band 4: the ciphertext is the single most directly
  // promptable payload in the registry, so it no longer appears at the depths
  // worth cheating for. See the band-skew note in games/index.ts.
  maxBand: 3,
  timeFactor: 1.1,
  // Even with the shift handed over, the plaintext still has to be read off and typed.
  minHumanMs: 10000,

  generate(band, rng) {
    const plaintext = rng.pick(CIPHER_PHRASES);
    const stripped = plaintext.replace(/[^A-Z]/g, "");

    if (band <= 2) {
      const shift = rng.int(3, 23);
      return {
        payload: {
          ciphertext: caesar(plaintext, shift),
          shift,
          table: null,
        } satisfies CipherPayload,
        solution: { plaintext: stripped } satisfies CipherSolution,
        attempts: 1,
      };
    }

    // Full substitution: a derangement of the alphabet, so no letter maps to
    // itself and there are no free gimmes.
    let mapped: string[];
    do {
      mapped = rng.shuffle([...ALPHABET]);
    } while (mapped.some((ch, i) => ch === ALPHABET[i]));

    const encodeMap = new Map<string, string>();
    ALPHABET.split("").forEach((ch, i) => encodeMap.set(ch, mapped[i]));

    const ciphertext = plaintext.replace(
      /[A-Z]/g,
      (ch) => encodeMap.get(ch) ?? ch
    );

    const used = new Set(stripped.split(""));
    const decoyCount = band >= 4 ? 6 : 3;
    const unused = ALPHABET.split("").filter((ch) => !used.has(ch));
    const shown = [...used, ...rng.sample(unused, decoyCount)];

    const table: [string, string][] = rng
      .shuffle(shown)
      .map((plain) => [encodeMap.get(plain) as string, plain]);

    return {
      payload: { ciphertext, shift: null, table } satisfies CipherPayload,
      solution: { plaintext: stripped } satisfies CipherSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { plaintext } = solution as CipherSolution;
    return { correct: normalizeToken(answer) === plaintext };
  },
};
