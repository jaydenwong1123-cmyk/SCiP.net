import { clearanceLabel } from "@/lib/clearance";
import { eligibleGames } from "@/lib/hack/games";

// The training range — client-safe half.
//
// Ten minigames exist, and until the range the only way to be shown one was to
// be dealt it at random by a stakes-bearing surface: the intrusion ladder (one
// run per 24h, a failure costs banked tiers and doubles the cooldown), RAISA's
// trace ladder, or a duel. drawGame() picks the game, there is no re-roll, and
// the band follows the stage. That is right for a run and useless for anyone
// who has to maintain or moderate the puzzles — a helper reading a ticket about
// the keypad game could not look at a keypad game.
//
// A drill inverts exactly that: the player names the game AND the band, and
// nothing is at stake.
//
// This module is imported by the drill console, which is a client component, so
// it must stay free of server-only imports — same rule, and same reason, as
// lib/sections.ts. Everything that reaches the database lives in
// lib/hack/drill-store.ts. lib/hack/games is safe to import here: the registry
// and its generators are pure.

// The difficulty axis. This is `band` — the number a game's minBand/maxBand
// window is checked against — NOT the `tier` a ladder stage banks. The two are
// distinct and only incidentally overlap. Labelled with clearanceLabel() so
// L-1..L-5 read the same here as everywhere else in the app.
export const DRILL_BANDS = [1, 2, 3, 4, 5] as const;

export type DrillBand = (typeof DRILL_BANDS)[number];

export function isDrillBand(value: number): value is DrillBand {
  return (DRILL_BANDS as readonly number[]).includes(value);
}

export function drillBandLabel(band: number): string {
  return clearanceLabel(band);
}

/** The roster the console renders, as plain data. */
export type DrillGameInfo = {
  id: string;
  label: string;
  brief: string;
  minBand: number;
  maxBand: number;
};

export function drillRoster(): DrillGameInfo[] {
  // Union over the bands rather than the raw registry, so a game that is
  // eligible at no band is never offered as an unpickable option.
  const seen = new Map<string, DrillGameInfo>();
  for (const band of DRILL_BANDS) {
    for (const game of eligibleGames(band)) {
      if (!seen.has(game.id)) {
        seen.set(game.id, {
          id: game.id,
          label: game.label,
          brief: game.brief,
          minBand: game.minBand,
          maxBand: game.maxBand,
        });
      }
    }
  }
  return [...seen.values()];
}

// The only projection of a drill that may cross the wire WHILE IT IS LIVE.
// Mirrors publicChallenge() in engine.ts, minus everything about a run — and,
// like it, exists so there is exactly one place to check that `solution` is not
// in the object.
export type PublicDrill = {
  nonce: string;
  game: string;
  label: string;
  brief: string;
  band: number;
  bandLabel: string;
  payload: unknown;
  attemptsLeft: number;
};

export type DrillResult = {
  correct: boolean;
  feedback?: string;
  attemptsLeft: number;
  /** The answer key, once the drill has settled. Null while it is still live. */
  answerKey: string | null;
};

export const DRILL_ERRORS = {
  unknownGame: "NO SUCH DRILL IN THE REGISTRY.",
  badBand: "SELECT A DIFFICULTY BETWEEN L-1 AND L-5.",
  outOfBand: "THAT DRILL DOES NOT RUN AT THAT DIFFICULTY. PICK ANOTHER.",
  noDrill: "NO SUCH DRILL. START A NEW ONE.",
  settled: "THIS DRILL IS ALREADY GRADED. START A NEW ONE.",
  empty: "ENTER AN ANSWER.",
} as const;
