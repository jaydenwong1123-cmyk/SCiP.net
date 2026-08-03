import type { HackGame, GameGeneration, GradeResult } from "./types";
import type { Rng } from "@/lib/hack/rng";

import { cipherGame } from "./cipher";
import { icebreakerGame } from "./icebreaker";
import { waveformGame } from "./waveform";
import { bytepairGame } from "./bytepair";
import { nodetraceGame } from "./nodetrace";
import { keypadGame } from "./keypad";
import { packetfilterGame } from "./packetfilter";
import { anomalyGame } from "./anomaly";
import { signatureGame } from "./signature";
import { daemonGame } from "./daemon";

export type { HackGame, GameGeneration, GradeResult } from "./types";

// The registry.
//
// Adding another game is one file in this directory and one line here —
// nothing in the engine, the stage config or any route knows the roster. The
// only coupling is that a game needs a matching renderer in
// app/(app)/hack/games/, dispatched by id.
const REGISTRY: HackGame[] = [
  cipherGame,
  icebreakerGame,
  waveformGame,
  bytepairGame,
  nodetraceGame,
  keypadGame,
  packetfilterGame,
  anomalyGame,
  signatureGame,
  daemonGame,
];

export const HACK_GAMES: Record<string, HackGame> = Object.fromEntries(
  REGISTRY.map((game) => [game.id, game])
);

export const GAME_IDS = REGISTRY.map((game) => game.id);

export function gameFor(id: string): HackGame | null {
  return HACK_GAMES[id] ?? null;
}

// Games eligible at a given band, in registry order.
export function eligibleGames(band: number): HackGame[] {
  return REGISTRY.filter((g) => band >= g.minBand && band <= g.maxBand);
}

// Draw the game for the round about to be issued.
//
// Excludes anything already drawn earlier in the same stage, so a stage never
// asks the same puzzle twice running. Drawn per round rather than per run, so
// no two intrusions are alike and nothing about the ladder is memorizable.
//
// This is called from getOrIssueChallenge, which is idempotent on the run's
// cursor — meaning a player who refreshes hoping for a softer draw gets the
// challenge that was already issued, with its original deadline. There is no
// re-roll.
//
// Falls back to the full eligible pool if a stage somehow asks for more rounds
// than there are distinct games at its band; a repeat is a far better outcome
// than a round that cannot be issued.
export function drawGame(
  band: number,
  alreadyUsed: string[],
  rng: Rng
): string {
  const eligible = eligibleGames(band);
  const fresh = eligible.filter((g) => !alreadyUsed.includes(g.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  return rng.pick(pool).id;
}

export function generateChallenge(
  gameId: string,
  band: number,
  rng: Rng
): GameGeneration {
  const game = gameFor(gameId);
  if (!game) throw new Error(`unknown hack game: ${gameId}`);
  return game.generate(band, rng);
}

export function gradeAnswer(
  gameId: string,
  solution: unknown,
  answer: string
): GradeResult {
  const game = gameFor(gameId);
  if (!game) return { correct: false };
  return game.grade(solution, answer);
}
