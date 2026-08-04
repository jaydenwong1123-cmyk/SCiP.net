import { randomUUID } from "crypto";
import type { HackChallenge, HackRun } from "@prisma/client";
import { db } from "@/lib/db";
import { createRng } from "@/lib/hack/rng";
import {
  drawGame,
  eligibleGames,
  gameFor,
  generateChallenge,
  gradeAnswer,
} from "@/lib/hack/games";
import {
  CHALLENGE_KINDS,
  DEADLINE_GRACE_MS,
  MAX_RUN_MS,
  MAX_STAGE,
  RUN_STATUS,
  TRACE_BAND_MAX,
  roundDeadlineMs,
  stageCapMs,
  stageSpec,
  traceDeadlineMs,
} from "@/lib/hack/config";

// The server-authoritative loop.
//
// Everything that decides an outcome lives here: which game is drawn, what the
// answer is, when the clock ran out, and whether a stage advanced. The browser
// contributes exactly two things — a nonce and a string — and neither is
// trusted beyond being looked up and compared.
//
// WHAT MUST NEVER REACH A CLIENT: HackChallenge.solution, HackChallenge.id,
// HackRun.id (on the intruder's side) and HackRun.userId. The single funnel
// for anything client-bound is publicChallenge() below; if you find yourself
// passing a raw challenge or run row into JSX, that is the bug.

export type PublicChallenge = {
  nonce: string;
  game: string;
  label: string;
  brief: string;
  stage: number;
  round: number;
  rounds: number;
  payload: unknown;
  attemptsLeft: number;
  // Absolute epoch milliseconds. Paired with serverNowMs so the client can
  // correct for a skewed local clock when rendering its countdown; neither
  // value is trusted on the way back in.
  deadlineMs: number;
  serverNowMs: number;
};

// The ONLY projection of a challenge that may cross the wire.
export function publicChallenge(challenge: HackChallenge): PublicChallenge {
  const game = gameFor(challenge.game);
  return {
    nonce: challenge.nonce,
    game: challenge.game,
    label: game?.label ?? challenge.game.toUpperCase(),
    brief: game?.brief ?? "",
    stage: challenge.stage,
    round: challenge.round,
    rounds:
      challenge.kind === CHALLENGE_KINDS.trace
        ? 1
        : stageSpec(challenge.stage).rounds,
    payload: JSON.parse(challenge.payload),
    attemptsLeft: challenge.attemptsLeft,
    deadlineMs: challenge.deadlineAt.getTime(),
    serverNowMs: Date.now(),
  };
}

// Games already drawn earlier in this stage, so a stage never repeats a puzzle.
async function usedGames(
  runId: string,
  kind: string,
  stage: number
): Promise<string[]> {
  const rows = await db.hackChallenge.findMany({
    where: { runId, kind, stage },
    select: { game: true },
  });
  return rows.map((r) => r.game);
}

// Issue the challenge for the run's current cursor, or return the one already
// issued for it.
//
// Idempotency is the whole point. A refresh, a back-button, or a second tab
// all land here and all get the SAME nonce with its ORIGINAL deadline — which
// closes the "reload for a fresh clock" exploit, and equally means the random
// game draw cannot be re-rolled by anyone hoping for a softer puzzle.
export async function getOrIssueChallenge(
  run: HackRun,
  kind: string = CHALLENGE_KINDS.intrusion
): Promise<HackChallenge> {
  const cursor =
    kind === CHALLENGE_KINDS.trace ? run.traceCursor : run.cursor;

  const existing = await db.hackChallenge.findFirst({
    where: { runId: run.id, kind, cursor },
  });
  if (existing) return existing;

  const rng = createRng();
  const isTrace = kind === CHALLENGE_KINDS.trace;
  const band = isTrace
    ? rng.int(1, TRACE_BAND_MAX)
    : stageSpec(run.stage).band;
  const stage = isTrace ? band : run.stage;

  const drawn = drawGame(band, await usedGames(run.id, kind, stage), rng);
  const game = gameFor(drawn);
  if (!game) throw new Error(`drawGame returned unknown game: ${drawn}`);

  const { payload, solution, attempts } = generateChallenge(drawn, band, rng);
  const deadlineMs = isTrace
    ? traceDeadlineMs(game.timeFactor)
    : roundDeadlineMs(run.stage, game.timeFactor);

  try {
    return await db.hackChallenge.create({
      data: {
        runId: run.id,
        kind,
        game: drawn,
        stage,
        round: isTrace ? 1 : run.round,
        cursor,
        nonce: randomUUID(),
        payload: JSON.stringify(payload),
        solution: JSON.stringify(solution),
        attemptsLeft: attempts,
        deadlineAt: new Date(Date.now() + deadlineMs),
      },
    });
  } catch {
    // Unique violation on ([runId, kind, cursor]) — a second tab won the race.
    // Whoever lost adopts the winner's challenge rather than issuing a rival
    // one with a fresh clock.
    const raced = await db.hackChallenge.findFirst({
      where: { runId: run.id, kind, cursor },
    });
    if (!raced) throw new Error("failed to issue hack challenge");
    return raced;
  }
}

// Mark a run failed. Never partially credits: whatever was banked in earlier
// stages is forfeit, which is what makes the EXTRACT decision a real one.
export async function failRun(
  run: HackRun,
  reason: string
): Promise<HackRun> {
  return db.hackRun.update({
    where: { id: run.id },
    data: {
      status: RUN_STATUS.failed,
      endedAt: new Date(),
      failReason: reason.slice(0, 120),
      atCheckpoint: false,
    },
  });
}

// Resolve an abandoned run lazily.
//
// There is no cron here, so a run whose deadline passed while the tab was shut
// stays "active" in the table until someone next looks. Every entry point that
// cares calls this first. Closing the tab mid-round is a failure — that is the
// correct incentive, and it is also the only honest reading of a deadline that
// has already gone by.
export async function resolveStaleRuns(userId: string): Promise<HackRun | null> {
  const active = await db.hackRun.findFirst({
    where: { userId, status: RUN_STATUS.active },
    orderBy: { startedAt: "desc" },
  });
  if (!active) return null;

  const now = Date.now();

  if (now - active.startedAt.getTime() > MAX_RUN_MS) {
    return failRun(active, "SESSION TIMED OUT");
  }
  if (active.stageDeadlineAt && now > active.stageDeadlineAt.getTime()) {
    return failRun(active, "STAGE WINDOW CLOSED");
  }

  // A run parked at a checkpoint is waiting on a human decision, not a clock.
  if (active.atCheckpoint) return active;

  const open = await db.hackChallenge.findFirst({
    where: {
      runId: active.id,
      kind: CHALLENGE_KINDS.intrusion,
      cursor: active.cursor,
      correct: null,
    },
    select: { deadlineAt: true },
  });
  if (open && now > open.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    return failRun(active, "CONNECTION DROPPED");
  }

  return active;
}

// Grade a candidate answer for on-screen feedback ONLY — no attempt spent, no
// challenge or run row touched. Exists so a player can see how close a guess
// is (e.g. icebreaker's letters-correct count) without it costing anything,
// which is the whole reason CHECK is a separate button from TRANSMIT.
export async function checkIntrusionAnswer(
  userId: string,
  nonce: string,
  answer: string
): Promise<{ ok: true; feedback: string } | { ok: false }> {
  const challenge = await db.hackChallenge.findUnique({
    where: { nonce },
    include: { run: true },
  });

  if (
    !challenge ||
    challenge.run.userId !== userId ||
    challenge.kind !== CHALLENGE_KINDS.intrusion ||
    challenge.run.status !== RUN_STATUS.active ||
    challenge.correct !== null ||
    challenge.cursor !== challenge.run.cursor
  ) {
    return { ok: false };
  }

  const result = gradeAnswer(
    challenge.game,
    JSON.parse(challenge.solution),
    answer
  );
  return {
    ok: true,
    feedback: result.correct
      ? "MATCH — HIT TRANSMIT TO CONFIRM"
      : (result.feedback ?? "NO MATCH"),
  };
}

export type SubmitOutcome =
  | { kind: "stale" }
  | { kind: "wrong"; feedback?: string; challenge: PublicChallenge }
  | { kind: "failed"; reason: string }
  | { kind: "advanced"; challenge: PublicChallenge }
  | { kind: "checkpoint" };

// Grade one answer and move the run.
//
// Validation order matters and is deliberate: identity and staleness are
// settled before the clock, and the clock before the answer, so a late
// submission is never graded and a replayed nonce never re-enters a resolved
// stage.
export async function submitIntrusionAnswer(
  userId: string,
  nonce: string,
  answer: string
): Promise<SubmitOutcome> {
  const challenge = await db.hackChallenge.findUnique({
    where: { nonce },
    include: { run: true },
  });

  // Every one of these is reported identically as "stale". A member must not
  // be able to learn from the error which of them tripped — in particular,
  // never that a nonce belonging to somebody else exists.
  if (
    !challenge ||
    challenge.run.userId !== userId ||
    challenge.kind !== CHALLENGE_KINDS.intrusion ||
    challenge.run.status !== RUN_STATUS.active ||
    challenge.correct !== null ||
    challenge.cursor !== challenge.run.cursor
  ) {
    return { kind: "stale" };
  }

  const run = challenge.run;
  const now = Date.now();

  if (now > challenge.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    await failRun(run, "TIMER EXPIRED");
    return { kind: "failed", reason: "TIMER EXPIRED" };
  }
  if (run.stageDeadlineAt && now > run.stageDeadlineAt.getTime()) {
    await failRun(run, "STAGE WINDOW CLOSED");
    return { kind: "failed", reason: "STAGE WINDOW CLOSED" };
  }

  const result = gradeAnswer(
    challenge.game,
    JSON.parse(challenge.solution),
    answer
  );

  if (!result.correct) {
    // A guess-carrying game burns an attempt instead of the round. The
    // deadline is untouched, so spending guesses spends time.
    if (challenge.attemptsLeft > 1) {
      const updated = await db.hackChallenge.update({
        where: { id: challenge.id },
        data: { attemptsLeft: challenge.attemptsLeft - 1 },
      });
      return {
        kind: "wrong",
        feedback: result.feedback,
        challenge: publicChallenge(updated),
      };
    }
    await db.hackChallenge.update({
      where: { id: challenge.id },
      data: { correct: false, answeredAt: new Date() },
    });
    await failRun(run, result.feedback ?? "INVALID CREDENTIAL");
    return { kind: "failed", reason: result.feedback ?? "INVALID CREDENTIAL" };
  }

  await db.hackChallenge.update({
    where: { id: challenge.id },
    data: { correct: true, answeredAt: new Date() },
  });

  const spec = stageSpec(run.stage);

  // Last round of the stage: bank the depth and park at the checkpoint.
  if (run.round >= spec.rounds) {
    await db.hackRun.update({
      where: { id: run.id },
      data: {
        clearedStages: run.stage,
        cursor: run.cursor + 1,
        atCheckpoint: true,
        stageDeadlineAt: null,
      },
    });
    return { kind: "checkpoint" };
  }

  // More rounds to go. The next challenge is issued immediately and returned
  // in this same response — there is no pause between rounds, and the next
  // deadline starts the instant this one cleared.
  const advanced = await db.hackRun.update({
    where: { id: run.id },
    data: { cursor: run.cursor + 1, round: run.round + 1 },
  });
  const next = await getOrIssueChallenge(advanced);
  return { kind: "advanced", challenge: publicChallenge(next) };
}

// Move from a checkpoint into the next stage.
export async function pushDeeper(run: HackRun): Promise<HackRun> {
  const nextStage = Math.min(run.stage + 1, MAX_STAGE);
  const cap = stageCapMs(nextStage);
  return db.hackRun.update({
    where: { id: run.id },
    data: {
      stage: nextStage,
      round: 1,
      atCheckpoint: false,
      stageDeadlineAt: cap === null ? null : new Date(Date.now() + cap),
    },
  });
}

// Opportunistic cleanup of puzzle bodies for runs that ended over a day ago.
//
// Two JSON blobs per round adds up, and once the run has a status the
// challenges have no forensic value — the HackRun and HackGrant rows are the
// trail, and they are never pruned. Probability-gated because there is no cron;
// same pattern as pruneAttempts in lib/rate-limit.ts.
export async function pruneHackChallenges(probability = 0.05): Promise<void> {
  if (Math.random() > probability) return;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await db.hackRun.findMany({
      where: { status: { not: RUN_STATUS.active }, endedAt: { lt: cutoff } },
      select: { id: true },
      take: 200,
    });
    if (stale.length === 0) return;
    await db.hackChallenge.deleteMany({
      where: { runId: { in: stale.map((r) => r.id) } },
    });
  } catch {
    /* pruning is best-effort */
  }
}

// Sanity check used by the /hack page: a band with no eligible games would
// mean a stage that cannot issue a round at all.
export function laddersAreSatisfiable(): boolean {
  return [1, 2, 3, 4, 5].every((band) => eligibleGames(band).length > 0);
}
