import type { Rng } from "@/lib/hack/rng";

// The contract every mini-game implements.
//
// A game is deliberately just data in and data out: `generate` builds a puzzle,
// `grade` marks an answer, and neither touches the database, the session or the
// clock. That keeps them unit-testable, and it keeps the one security-bearing
// rule easy to enforce by inspection — `payload` is what the browser sees,
// `solution` is what it must never see.
//
// ON CHEATING, HONESTLY: any puzzle whose inputs must be rendered for a human
// to solve is solvable by a script reading the same inputs. Nothing here
// pretends otherwise. What the design does buy is that the *answer* is never
// present client-side, the clock is server-owned, and a solver has to cover
// twelve different mechanics with randomized rule templates rather than one.
// The defence is cost and time pressure, not cryptography.
export type HackGame = {
  id: string;
  // Shown as the console header while the puzzle is up.
  label: string;
  // One line of rules, rendered above the puzzle. Written in terminal voice.
  brief: string;
  // Difficulty window. A game is eligible for a stage when
  // minBand <= stage <= maxBand, so gentle games drop out of the deep stages
  // and brutal ones never ambush someone at stage 1.
  minBand: number;
  maxBand: number;
  // Multiplies the stage's base round clock. A game that is legitimately
  // slower to read (daemon, packetfilter) gets more than 1.0; a snap judgement
  // (waveform) gets less.
  timeFactor: number;
  generate(band: number, rng: Rng): GameGeneration;
  grade(solution: unknown, answer: string): GradeResult;
};

export type GameGeneration = {
  // JSON-serializable, and safe to hand to a browser.
  payload: unknown;
  // JSON-serializable, and NEVER handed to a browser.
  solution: unknown;
  // Guesses allowed before the round is lost. Games where a wrong answer
  // carries information (icebreaker's likeness count) allow several; games
  // where it would just be a free retry allow exactly one.
  attempts: number;
};

export type GradeResult = {
  correct: boolean;
  // Shown to the player after a wrong-but-informative guess. Must never narrow
  // the answer beyond what the mechanic intends to reveal.
  feedback?: string;
};

// Shared answer normalization: uppercase, and strip anything that is not a
// letter or digit. Applied by graders whose answer is a plain token, so a
// player is never failed for typing a space or a dash.
export function normalizeToken(answer: string): string {
  return answer.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Split a comma/space separated answer into normalized, de-duplicated tokens.
export function normalizeList(answer: string): string[] {
  const seen = new Set<string>();
  for (const raw of answer.split(/[\s,]+/)) {
    const token = normalizeToken(raw);
    if (token) seen.add(token);
  }
  return [...seen];
}

// Order-insensitive comparison for "report every X" games.
export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  for (const item of b) if (!left.has(item)) return false;
  return left.size === b.length;
}
