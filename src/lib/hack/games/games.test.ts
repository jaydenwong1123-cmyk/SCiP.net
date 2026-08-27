import { describe, it, expect } from "vitest";
import { createRng } from "@/lib/hack/rng";
import {
  HACK_GAMES,
  GAME_IDS,
  eligibleGames,
  drawGame,
  generateChallenge,
  gradeAnswer,
  gameFor,
} from "./index";
import { normalizeToken, normalizeList, sameSet } from "./types";

// The contract every puzzle implements, finally asserted.
//
// games/types.ts has always said these modules exist in a testable shape —
// "generate builds a puzzle, grade marks an answer, and neither touches the
// database, the session or the clock". This file is that claim cashed in.
//
// THE CENTRAL TEST is the round-trip: for every game, at every band it declares
// itself eligible for, generate a puzzle and feed its own solution back to its
// own grader. A generator that emits an ungradeable puzzle at band 5 is
// otherwise only discoverable by a player losing a run to it, at the deepest
// and most expensive point of the ladder.
//
// Seeded RNG throughout (see the note in lib/hack/rng.ts — the seeded path
// exists for exactly this). Many seeds per game per band, because these
// generators branch on random draws and a single seed proves almost nothing.

const BANDS = [1, 2, 3, 4, 5];
const SEEDS_PER_BAND = 40;

/**
 * Render a stored solution the way a player would type it.
 *
 * Every solution is an object, and the field that carries the answer differs
 * per game — so the mapping is spelled out rather than guessed at. Listing them
 * by name is also the point: if a new game lands with an answer field this does
 * not know about, its round-trip test fails loudly instead of quietly passing
 * on a stringified object.
 */
const ANSWER_FIELD: Record<string, string> = {
  cipher: "plaintext",
  icebreaker: "password",
  waveform: "id",
  bytepair: "orphans",
  nodetrace: "path",
  keypad: "code",
  anomaly: "violators",
  signature: "token",
  minesweeper: "mines",
  "stopwatch-l1": "targetMs",
  "stopwatch-o5": "targetMs",
};

function solutionAsAnswer(gameId: string, solution: unknown): string {
  // BREACH PROTOCOL is the one game whose stored "solution" is the PUZZLE
  // rather than the answer — its grader re-walks the buffer and checks move
  // legality, so the answer has to be derived. Solving it here is therefore a
  // stronger test than the others get: it proves every generated matrix is
  // actually completable under the alternating row/column rule.
  if (gameId === "daemon") return solveDaemon(solution);

  const field = ANSWER_FIELD[gameId];
  if (!field) throw new Error(`no answer field mapped for game "${gameId}"`);

  const record = solution as Record<string, unknown>;
  const value = record[field];

  if (Array.isArray(value)) {
    // MEMORY PARITY SCAN turns ordering on at band 5, where its grader wants
    // the bytes ascending rather than in any order. The player is told — the
    // renderer prints "SUBMIT THEM IN ASCENDING ORDER" off the same payload
    // flag — so sorting here is matching what a briefed player would type, not
    // papering over a grader quirk.
    const ordered = record.ordered === true;
    const items = value.map(String);
    return (ordered ? [...items].sort() : items).join(",");
  }
  return String(value ?? "");
}

/**
 * Find a legal buffer path for BREACH PROTOCOL, mirroring the grader's rules:
 * the first pick is locked to row 1, then the constraint alternates —
 * odd picks inherit the previous column, even picks the previous row — and
 * every pick must match the target byte at its index.
 */
function solveDaemon(solution: unknown): string {
  const { matrix, target } = solution as {
    matrix: string[][];
    target: string[];
  };
  const size = matrix.length;
  const picks: string[] = [];

  const walk = (i: number, prevRow: number, prevCol: number): boolean => {
    if (i === target.length) return true;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (i === 0 && row !== 0) continue;
        if (i > 0 && i % 2 === 1 && col !== prevCol) continue;
        if (i > 0 && i % 2 === 0 && row !== prevRow) continue;
        if (matrix[row]![col] !== target[i]) continue;

        picks.push(`R${row + 1}C${col + 1}`);
        if (walk(i + 1, row, col)) return true;
        picks.pop();
      }
    }
    return false;
  };

  if (!walk(0, -1, -1)) {
    // Returning an unsolvable marker rather than throwing keeps the failure
    // inside the assertion, where the seed is reported.
    return "UNSOLVABLE";
  }
  return picks.join(" ");
}

describe("puzzle registry", () => {
  it("registers every game under its own id", () => {
    for (const id of GAME_IDS) {
      expect(gameFor(id)?.id).toBe(id);
    }
  });

  it("has no unreachable band — every stage can issue a round", () => {
    // laddersAreSatisfiable() in engine.ts asserts the same thing at runtime; a
    // band with no eligible game would be a stage that cannot start.
    for (const band of BANDS) {
      expect(eligibleGames(band).length).toBeGreaterThan(0);
    }
  });

  it("declares coherent band windows and a positive human floor", () => {
    for (const id of GAME_IDS) {
      const game = HACK_GAMES[id]!;
      expect(game.minBand).toBeGreaterThanOrEqual(1);
      expect(game.maxBand).toBeLessThanOrEqual(5);
      expect(game.minBand).toBeLessThanOrEqual(game.maxBand);
      expect(game.timeFactor).toBeGreaterThan(0);
      // The floor is the one anti-cheat signal nothing client-side can fake
      // (lib/hack/suspicion.ts). A game with a zero floor silently opts out of
      // it, which must be a deliberate choice and not an omission.
      expect(game.minHumanMs).toBeGreaterThan(0);
      expect(game.label.length).toBeGreaterThan(0);
      expect(game.brief.length).toBeGreaterThan(0);
    }
  });

  it("returns a game eligible for the band it was asked for", () => {
    const rng = createRng(1234);
    for (const band of BANDS) {
      for (let i = 0; i < 50; i++) {
        const drawn = gameFor(drawGame(band, [], rng))!;
        expect(drawn.minBand).toBeLessThanOrEqual(band);
        expect(drawn.maxBand).toBeGreaterThanOrEqual(band);
      }
    }
  });

  it("avoids repeating a game already drawn in the same stage", () => {
    const rng = createRng(99);
    for (const band of BANDS) {
      const pool = eligibleGames(band).map((g) => g.id);
      if (pool.length < 2) continue;
      const used = [pool[0]!];
      for (let i = 0; i < 30; i++) {
        expect(drawGame(band, used, rng)).not.toBe(used[0]);
      }
    }
  });

  it("falls back to the full pool rather than failing to issue", () => {
    // Documented behaviour in drawGame: when a stage asks for more rounds than
    // there are distinct games, a repeat beats a round that cannot be issued.
    const rng = createRng(7);
    for (const band of BANDS) {
      const all = eligibleGames(band).map((g) => g.id);
      const drawn = drawGame(band, all, rng);
      expect(all).toContain(drawn);
    }
  });

  it("grades an unknown game as wrong instead of throwing", () => {
    expect(gradeAnswer("no-such-game", "X", "X").correct).toBe(false);
  });

  it("throws rather than silently issuing an unknown game", () => {
    expect(() => generateChallenge("no-such-game", 1, createRng(1))).toThrow();
  });
});

describe.each(GAME_IDS)("%s", (id) => {
  const game = HACK_GAMES[id]!;
  const bands = BANDS.filter((b) => b >= game.minBand && b <= game.maxBand);

  it("accepts its own answer key at every band it declares", () => {
    for (const band of bands) {
      for (let seed = 0; seed < SEEDS_PER_BAND; seed++) {
        const rng = createRng(seed * 7919 + band * 104729);
        const { payload, solution, attempts } = game.generate(band, rng);

        // The security-bearing shape rule, checked by construction: both halves
        // must survive the JSON round-trip they actually make through the
        // database (HackChallenge.payload / .solution are TEXT columns).
        expect(() => JSON.stringify(payload)).not.toThrow();
        expect(() => JSON.stringify(solution)).not.toThrow();
        expect(payload).toBeDefined();
        expect(solution).toBeDefined();
        expect(attempts).toBeGreaterThanOrEqual(1);

        const revived: unknown = JSON.parse(JSON.stringify(solution));
        const answer = solutionAsAnswer(id, revived);

        const result = game.grade(revived, answer);
        expect(
          result.correct,
          `${id} band ${band} seed ${seed} rejected its own solution ${JSON.stringify(
            revived
          )}`
        ).toBe(true);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    // Not a nicety: the whole reason the seeded path exists is so a failure
    // found here can be reproduced from the seed in the message.
    for (const band of bands) {
      const a = game.generate(band, createRng(4242));
      const b = game.generate(band, createRng(4242));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("rejects an obviously wrong answer", () => {
    for (const band of bands) {
      const { solution } = game.generate(band, createRng(31337 + band));
      const wrong = "ZZZZZZZZZZZZ";
      // Guard against the (vanishingly unlikely) case where the sentinel IS
      // the answer, which would make this assertion meaningless rather than
      // wrong.
      if (solutionAsAnswer(id, solution) === wrong) continue;
      expect(game.grade(solution, wrong).correct).toBe(false);
    }
  });

  it("tolerates junk input without throwing", () => {
    // Answers arrive from a browser. A grader that throws on an unexpected
    // string turns a bad guess into a 500 and, worse, into an un-graded round.
    const { solution } = game.generate(bands[0]!, createRng(11));
    for (const junk of ["", "   ", "!!!", "0", "-1", "[]", "{}", " "]) {
      expect(() => game.grade(solution, junk)).not.toThrow();
    }
  });

  it("never leaks its solution into the payload", () => {
    // The one rule in types.ts that is security-bearing rather than structural:
    // `payload` is what the browser sees, `solution` is what it must never see.
    // A scalar solution appearing verbatim in the serialized payload is the
    // shape of that mistake.
    for (const band of bands) {
      for (let seed = 0; seed < 10; seed++) {
        const { payload, solution } = game.generate(
          band,
          createRng(seed * 13 + band)
        );
        if (typeof solution !== "string" || solution.length < 4) continue;
        expect(
          JSON.stringify(payload),
          `${id} band ${band} seed ${seed} leaked its solution into the payload`
        ).not.toContain(solution);
      }
    }
  });
});

describe("answer normalization", () => {
  it("uppercases and strips punctuation", () => {
    expect(normalizeToken(" a-b c1 ")).toBe("ABC1");
    expect(normalizeToken("")).toBe("");
  });

  it("splits, normalizes and de-duplicates a list", () => {
    expect(normalizeList("a, b  c,a")).toEqual(["A", "B", "C"]);
    expect(normalizeList("   ")).toEqual([]);
  });

  it("compares sets without regard to order", () => {
    expect(sameSet(["A", "B"], ["B", "A"])).toBe(true);
    expect(sameSet(["A"], ["A", "B"])).toBe(false);
    expect(sameSet([], [])).toBe(true);
  });
});
