import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createRng } from "@/lib/hack/rng";
import {
  gameFor,
  generateChallenge,
  gradeAnswer,
} from "@/lib/hack/games";
import {
  isDrillBand,
  drillBandLabel,
  DRILL_ERRORS,
  type PublicDrill,
  type DrillResult,
} from "@/lib/hack/drills";

// Server-side half of the training range. See lib/hack/drills.ts for what a
// drill is and why the client-safe constants live apart from this file.
//
// A drill is deliberately inert. None of the following is touched from here,
// and none of it should ever be imported into this file:
//
//   - grant.ts / HackGrant       no clearance is issued, at any band
//   - config.ts stage & cooldown no ladder position, no 24h lock
//   - suspicion.ts / conduct.ts  no scoring; practice is not evidence
//   - telemetry.ts               no round signals are collected
//   - engine.ts                  no run, no cursor, no deadline sweep
//
// What it DOES reuse is the whole reason it is thin: the same registry, the
// same generators and the same graders that serve a real round, so a drill
// cannot drift away from the thing it is meant to be practice for.

/**
 * Generate one practice puzzle and hand back the public half.
 *
 * Rejects a game/band pair outside the game's own window rather than clamping
 * it: a clamp would quietly hand back a different difficulty than the one asked
 * for, which on a range whose whole purpose is "show me exactly this" is worse
 * than a refusal. The console filters its dropdown by the same rule, so this
 * fires only on a hand-built request.
 */
export async function issueDrill(
  userId: string,
  gameId: string,
  band: number
): Promise<{ ok: true; drill: PublicDrill } | { ok: false; error: string }> {
  const game = gameFor(gameId);
  if (!game) return { ok: false, error: DRILL_ERRORS.unknownGame };
  if (!isDrillBand(band)) return { ok: false, error: DRILL_ERRORS.badBand };
  if (band < game.minBand || band > game.maxBand) {
    return { ok: false, error: DRILL_ERRORS.outOfBand };
  }

  // Unseeded, as every non-test generation must be: rng.ts is explicit that a
  // stored seed is a solution in disguise, since it re-derives the puzzle.
  const generated = generateChallenge(game.id, band, createRng());
  const nonce = randomUUID();

  await db.hackDrill.create({
    data: {
      userId,
      game: game.id,
      band,
      nonce,
      payload: JSON.stringify(generated.payload),
      solution: JSON.stringify(generated.solution),
      attemptsLeft: generated.attempts,
    },
  });

  return {
    ok: true,
    drill: {
      nonce,
      game: game.id,
      label: game.label,
      brief: game.brief,
      band,
      bandLabel: drillBandLabel(band),
      payload: generated.payload,
      attemptsLeft: generated.attempts,
    },
  };
}

/**
 * Grade one attempt.
 *
 * Scoped to userId so a nonce leaked out of one session cannot be graded from
 * another. Multi-guess games (ICE PASSWORD CRACK) burn an attempt on a miss and
 * keep the drill live; the drill settles when the answer is right or the last
 * attempt is spent, and only then is the answer key released.
 */
export async function gradeDrill(
  userId: string,
  nonce: string,
  answer: string
): Promise<{ ok: true; result: DrillResult } | { ok: false; error: string }> {
  if (answer.trim() === "") return { ok: false, error: DRILL_ERRORS.empty };

  const drill = await db.hackDrill.findFirst({ where: { nonce, userId } });
  if (!drill) return { ok: false, error: DRILL_ERRORS.noDrill };
  if (drill.answeredAt !== null) {
    return { ok: false, error: DRILL_ERRORS.settled };
  }

  const solution: unknown = JSON.parse(drill.solution);
  const graded = gradeAnswer(drill.game, solution, answer);
  const attemptsLeft = Math.max(0, drill.attemptsLeft - 1);
  const settled = graded.correct || attemptsLeft === 0;

  await db.hackDrill.update({
    where: { id: drill.id },
    data: {
      attemptsLeft,
      ...(settled ? { answeredAt: new Date(), correct: graded.correct } : {}),
    },
  });

  return {
    ok: true,
    result: {
      correct: graded.correct,
      feedback: graded.feedback,
      attemptsLeft,
      answerKey: settled ? formatAnswerKey(solution) : null,
    },
  };
}

// Solutions are per-game shapes — { password }, a coordinate list, a set of
// ids — with no common interface, so the key is rendered as its raw JSON rather
// than as prose. On a range that is the honest thing to show: it is exactly
// what the grader compared against.
function formatAnswerKey(solution: unknown): string {
  return JSON.stringify(solution, null, 2);
}

// Drills accumulate one row per puzzle and are worthless the moment they are
// graded. Trimmed opportunistically against the caller's own rows when a new
// drill starts, which is cheap and needs no scheduled job.
const DRILL_KEEP = 50;

export async function pruneDrills(userId: string): Promise<void> {
  const stale = await db.hackDrill.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    skip: DRILL_KEEP,
    select: { id: true },
  });
  if (stale.length === 0) return;
  await db.hackDrill.deleteMany({
    where: { id: { in: stale.map((d) => d.id) } },
  });
}
