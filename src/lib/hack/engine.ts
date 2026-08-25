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
import { liveDuelFor, sweepDuel } from "@/lib/hack/duel";
import { issueGrant } from "@/lib/hack/grant";
import {
  accumulateRunSuspicion,
  recordConduct,
  CONDUCT_SURFACES,
} from "@/lib/hack/conduct";
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
//
// THE ONE EXCEPTION is an armed DEAD MAN SWITCH (lib/hack/tools.ts). A member
// who spent that tool before the round bought exactly this: the failure banks
// the depth already cleared instead of forfeiting it. Handled here rather than
// at each call site because every intrusion-side failure funnels through this
// function — including the lazy sweep in resolveStaleRuns(), which is the whole
// reason the switch is stored on the run rather than held in the console: it
// has to fire for a member whose tab is already shut.
//
// A DUEL LOSS DELIBERATELY DOES NOT COME THROUGH HERE (see the note in
// lib/hack/duel.ts about writing the effect out by hand). That is intentional
// and not an oversight: a duel is a contest against another player, and letting
// the intruder's insurance blunt the officer's win would take something real
// away from the seat that earned it.
//
// Returns the updated run. Callers must read `status` rather than assuming a
// failure — when the switch fires the run comes back `extracted`.
export async function failRun(
  run: HackRun,
  reason: string
): Promise<HackRun> {
  if (run.deadmanArmed && run.clearedStages >= 1) {
    const saved = await db.hackRun.update({
      where: { id: run.id },
      data: {
        status: RUN_STATUS.extracted,
        endedAt: new Date(),
        // Kept on the row so the case file records what actually happened —
        // the run did fail, and the switch is why it still paid.
        failReason: `${reason.slice(0, 90)} — DEAD MAN SWITCH FIRED`,
        atCheckpoint: false,
        stageDeadlineAt: null,
        deadmanArmed: false,
      },
    });
    await issueGrant(saved);
    return saved;
  }

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

  // A run parked in a live duel answers to the DUEL's clock, not its own.
  //
  // Engaging abandons whatever intrusion challenge was in flight, so without
  // this the checks below would fail the run out from under the duel — the act
  // of being engaged would itself be the loss. Placed ahead of MAX_RUN_MS for
  // the same reason: a duel opened at minute 19 must still be allowed to
  // finish. It cannot be used to stall, because a duel is bounded (the pickup
  // ceiling plus one round) and ALWAYS ends the run one way or the other.
  const duel = await db.hackDuel.findUnique({ where: { runId: active.id } });
  if (duel && duel.winner === null) {
    return (await sweepDuel(duel)) ?? active;
  }

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
// challenge or run row touched. Exists so a player can see the letters-correct
// count on ICE PASSWORD CRACK without it costing anything, which is the whole
// reason CHECK is a separate button from TRANSMIT. Restricted to that one game:
// every other game's grade() only ever returns a bare correct/incorrect, so a
// free CHECK there would just be a no-cost extra guess.
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
    challenge.cursor !== challenge.run.cursor ||
    challenge.game !== "icebreaker"
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
  // The round was lost but an armed DEAD MAN SWITCH banked the depth already
  // cleared. Distinct from "failed" because the console must show an
  // extraction, and distinct from a clean extraction because the member should
  // be told what saved them.
  | { kind: "deadman"; reason: string }
  | { kind: "advanced"; challenge: PublicChallenge }
  | { kind: "checkpoint" };

// Fold failRun's result into the outcome the console needs. failRun returns an
// `extracted` run when the switch fires, and every caller has to branch on that
// the same way — so it is written once here.
function failureOutcome(ended: HackRun, reason: string): SubmitOutcome {
  return ended.status === RUN_STATUS.extracted
    ? { kind: "deadman", reason }
    : { kind: "failed", reason };
}

// Grade one answer and move the run.
//
// Validation order matters and is deliberate: identity and staleness are
// settled before the clock, and the clock before the answer, so a late
// submission is never graded and a replayed nonce never re-enters a resolved
// stage.
export async function submitIntrusionAnswer(
  userId: string,
  nonce: string,
  answer: string,
  // Client-reported conduct telemetry. UNTRUSTED, and never consulted by any
  // branch below that decides an outcome — it is scored and filed, nothing
  // more. See lib/hack/suspicion.ts.
  rawSignals = ""
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

  // A live duel has suspended this run. The intrusion challenge in flight when
  // the officer engaged is abandoned, and grading it now would decide the run
  // on the wrong clock — its deadline has almost certainly passed, which would
  // hand the intruder a cheaper loss than the duel they are supposed to fight.
  // Reported as stale so the console resyncs and its poll surfaces the duel.
  if (await liveDuelFor(run.id)) return { kind: "stale" };

  if (now > challenge.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    return failureOutcome(await failRun(run, "TIMER EXPIRED"), "TIMER EXPIRED");
  }
  if (run.stageDeadlineAt && now > run.stageDeadlineAt.getTime()) {
    return failureOutcome(
      await failRun(run, "STAGE WINDOW CLOSED"),
      "STAGE WINDOW CLOSED"
    );
  }

  const result = gradeAnswer(
    challenge.game,
    JSON.parse(challenge.solution),
    answer
  );

  // File the conduct evidence for this round. Deliberately AFTER grading and
  // before any branch acts on the result, so it happens exactly once whatever
  // the outcome — and deliberately awaited, so a run that ends on this round
  // still has its last round on file.
  const conductScore = await recordConduct({
    userId,
    surface: CONDUCT_SURFACES.intrusion,
    runId: run.id,
    game: challenge.game,
    elapsedMs: now - challenge.issuedAt.getTime(),
    answer,
    correct: result.correct,
    rawSignals,
  });
  await accumulateRunSuspicion(run.id, run.flagged, conductScore);

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
    const reason = result.feedback ?? "INVALID CREDENTIAL";
    return failureOutcome(await failRun(run, reason), reason);
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

// Redraw the round in flight — the effect behind the RECOMPILE tool.
//
// Implemented by advancing the run's cursor, which is the same mechanism that
// makes every other replay impossible: the challenge currently on screen is
// stamped with the old cursor, so the instant this returns that nonce grades as
// "stale" and cannot be submitted. There is no window in which both puzzles are
// live, and no way to hold the old one back and answer it later.
//
// The replacement's clock is deliberately shorter (RECOMPILE_TIME_FACTOR).
// Without that, recompiling would be strictly better than thinking, and the
// tool would just be a free re-roll on every hard draw.
//
// Callers MUST have verified the run is live and unexpired first. This function
// does not check the clock, and it must never become a way to escape a round
// whose deadline has already passed — see useToolAction.
export async function recompileRound(
  run: HackRun,
  timeFactorScale: number
): Promise<HackChallenge> {
  // Retire the outgoing challenge explicitly rather than leaving it dangling.
  // It can no longer be answered either way, but a row left with correct: null
  // reads as an unresolved round in the case file, which it is not.
  await db.hackChallenge.updateMany({
    where: {
      runId: run.id,
      kind: CHALLENGE_KINDS.intrusion,
      cursor: run.cursor,
      correct: null,
    },
    data: { correct: false, answeredAt: new Date() },
  });

  const advanced = await db.hackRun.update({
    where: { id: run.id },
    data: { cursor: run.cursor + 1 },
  });

  const issued = await getOrIssueChallenge(advanced);

  // getOrIssueChallenge owns the deadline, so the shortened clock is applied
  // afterwards against the issue stamp — not by re-deriving it, which would
  // duplicate roundDeadlineMs's contract in a second place.
  const budget = issued.deadlineAt.getTime() - issued.issuedAt.getTime();
  return db.hackChallenge.update({
    where: { id: issued.id },
    data: {
      deadlineAt: new Date(
        issued.issuedAt.getTime() + Math.round(budget * timeFactorScale)
      ),
    },
  });
}

// Bolt extra time onto the round in flight — the effect behind the STOPWATCH
// tool. Unlike RECOMPILE this does not touch the cursor or the puzzle: the
// challenge on screen is still the one that must be answered, just with a
// later deadline.
//
// Callers MUST have verified the run is live, at a round (not a checkpoint),
// and that the round's clock has not already run out — extending a deadline
// that has already passed would let this become a way to un-lose a round.
export async function extendRoundDeadline(
  challenge: Pick<HackChallenge, "id" | "deadlineAt">,
  extraMs: number
): Promise<HackChallenge> {
  return db.hackChallenge.update({
    where: { id: challenge.id },
    data: { deadlineAt: new Date(challenge.deadlineAt.getTime() + extraMs) },
  });
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
