import type { HackGame } from "./types";
import { normalizeToken } from "./types";
import { HIDDEN_STRINGS } from "@/lib/hack/wordlist";

export type MemdumpPayload = {
  rows: { address: string; bytes: string[] }[];
  // Human-readable statement of the extraction rule, e.g.
  // "EVERY BYTE AT AN OFFSET WHERE (OFFSET MOD 5) == 2".
  rule: string;
  perRow: number;
};

type MemdumpSolution = { hidden: string };

// STRING EXTRACTION.
//
// A hexdump with an ASCII string threaded through it at offsets picked out by
// a stated modular rule. The player reads the rule, walks the dump, and
// decodes the bytes that land on it — everything else is noise.
//
// The rule is generated rather than fixed so a returning player cannot skip
// reading it, and the noise bytes are constrained to the printable range so
// scanning for "the ASCII-looking ones" is not a shortcut.
export const memdumpGame: HackGame = {
  id: "memdump",
  label: "STRING EXTRACTION",
  brief: "RECOVER THE STRING HELD AT THE MATCHING OFFSETS.",
  minBand: 1,
  maxBand: 4,
  timeFactor: 1.2,

  generate(band, rng) {
    const hidden = rng.pick(
      HIDDEN_STRINGS.filter((s) => (band <= 2 ? s.length <= 5 : s.length >= 5))
    );
    const modulus = band === 1 ? 3 : band === 2 ? 4 : band === 3 ? 5 : 7;
    const remainder = rng.int(0, modulus - 1);
    const perRow = 8;

    // Lay the dump out so exactly one matching offset exists per hidden
    // character, in order.
    const total = (hidden.length - 1) * modulus + remainder + 1;
    const padded = Math.ceil(total / perRow) * perRow;

    const bytes: string[] = [];
    let taken = 0;
    for (let offset = 0; offset < padded; offset++) {
      if (offset % modulus === remainder && taken < hidden.length) {
        bytes.push(
          hidden.charCodeAt(taken++).toString(16).toUpperCase().padStart(2, "0")
        );
      } else {
        // Printable ASCII noise, never a letter that would read as a plausible
        // fragment of the answer.
        let noise: number;
        do {
          noise = rng.int(0x21, 0x7e);
        } while (noise >= 0x41 && noise <= 0x5a);
        bytes.push(noise.toString(16).toUpperCase().padStart(2, "0"));
      }
    }

    const rows: MemdumpPayload["rows"] = [];
    let address = rng.int(0x2000, 0xe000) & 0xfff0;
    for (let i = 0; i < bytes.length; i += perRow) {
      rows.push({
        address: `0x${address.toString(16).toUpperCase().padStart(4, "0")}`,
        bytes: bytes.slice(i, i + perRow),
      });
      address += perRow;
    }

    const rule = `EVERY BYTE WHOSE OFFSET SATISFIES (OFFSET MOD ${modulus}) == ${remainder}`;

    return {
      payload: { rows, rule, perRow } satisfies MemdumpPayload,
      solution: { hidden } satisfies MemdumpSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { hidden } = solution as MemdumpSolution;
    return { correct: normalizeToken(answer) === hidden };
  },
};
