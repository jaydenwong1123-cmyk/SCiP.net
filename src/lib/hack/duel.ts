import { randomUUID } from "crypto";
import type { HackDuel, HackRun } from "@prisma/client";
import { db } from "@/lib/db";
import { createRng } from "@/lib/hack/rng";
import {
  drawGame,
  gameFor,
  generateChallenge,
  gradeAnswer,
} from "@/lib/hack/games";
import {
  DEADLINE_GRACE_MS,
  DUEL_ATTEMPTS,
  DUEL_BAND,
  DUEL_PICKUP_MS,
  DUEL_PRIZE_STAGE,
  DUEL_SEATS,
  DUEL_WINNERS,
  RUN_STATUS,
  TRACE_LOCKOUT_MS,
  duelDeadlineMs,
  type DuelSeat,
  type DuelWinner,
} from "@/lib/hack/config";
import { issueGrant } from "@/lib/hack/grant";
import { CASE_STATUSES, caseCode } from "@/lib/counter-intel";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { clearanceLabel } from "@/lib/clearance";

// The counter-intrusion duel.
//
// One puzzle is drawn, ONCE, and served to both seats: the intruder mid-run
// and the RAISA officer who engaged them. First correct answer wins. The
// attacker wins Layer 3 (L-4) as a floor; the defender wins the run outright.
//
// A duel ALWAYS terminates the run. There is no path back into the intrusion
// ladder, which is what keeps this module from needing to know anything about
// stages, rounds or cursors.
//
// DEPENDENCY DIRECTION: this file must not import from lib/hack/engine.ts.
// engine.ts imports sweepDuel() from here (resolveStaleRuns has to know not to
// kill a run out from under a live duel), so the arrow points one way only.
// That is why the run-ending update below is written out rather than calling
// engine's failRun().
//
// WHAT MUST NEVER REACH A CLIENT: HackDuel.solution, HackDuel.id, the opposing
// seat's nonce, and — on the attacker's side — HackRun.id and the defender's
// identity. The single funnel for anything client-bound is publicDuel().

export type PublicDuel = {
  // This seat's nonce, never the opponent's.
  nonce: string;
  seat: DuelSeat;
  game: string;
  label: string;
  brief: string;
  payload: unknown;
  attemptsLeft: number;
  // Deliberately not a name on either side. The intruder must not learn which
  // officer engaged them (officers are not to be retaliated against), and the
  // officer must not learn who the intruder is — that is what the reveal
  // ladder at /counter-intel is for, and a duel does not shortcut it.
  opponent: string;
  // Absolute epoch milliseconds, paired with serverNowMs so the client can
  // correct for a skewed local clock. Same contract as PublicChallenge; neither
  // value is trusted on the way back in.
  deadlineMs: number;
  serverNowMs: number;
};

// The ONLY projection of a duel that may cross the wire.
export function publicDuel(duel: HackDuel, seat: DuelSeat): PublicDuel {
  const game = gameFor(duel.game);
  const attacker = seat === DUEL_SEATS.attacker;
  return {
    nonce: attacker ? duel.attackerNonce : duel.defenderNonce,
    seat,
    game: duel.game,
    label: game?.label ?? duel.game.toUpperCase(),
    brief: game?.brief ?? "",
    payload: JSON.parse(duel.payload),
    attemptsLeft: attacker ? duel.attackerAttemptsLeft : duel.defenderAttemptsLeft,
    opponent: attacker ? "RAISA COUNTER-INTRUSION UNIT" : caseCode(duel.runId),
    // The attacker's clock is stamped by deliverDuel before this is ever
    // called for their seat; the fallback keeps the projection total.
    deadlineMs: (attacker
      ? (duel.attackerDeadlineAt ?? duel.defenderDeadlineAt)
      : duel.defenderDeadlineAt
    ).getTime(),
    serverNowMs: Date.now(),
  };
}

// Seat-relative, so neither console has to reason about who "attacker" is.
export type DuelOutcome =
  | { kind: "live"; duel: PublicDuel }
  | { kind: "wrong"; duel: PublicDuel; feedback?: string }
  | { kind: "won" }
  | { kind: "lost"; reason: string }
  | { kind: "stale" };

function outcomeFor(winner: DuelWinner, seat: DuelSeat, reason: string): DuelOutcome {
  return winner === seat ? { kind: "won" } : { kind: "lost", reason };
}

// The action-layer shape the RAISA duel console consumes. The intruder's side
// folds its outcomes into the existing HackActionState instead — a duel win is
// an extraction and a duel loss is a failed run, so their console needs no new
// terminal phases.
export type DuelState =
  | { ok: true; kind: "live"; duel: PublicDuel }
  | { ok: true; kind: "wrong"; duel: PublicDuel; feedback?: string }
  | { ok: true; kind: "won" }
  | { ok: true; kind: "lost"; reason: string }
  | { ok: true; kind: "none" }
  | { ok: false; error: string; resync?: boolean };

export function duelState(outcome: DuelOutcome | null): DuelState {
  if (!outcome) return { ok: true, kind: "none" };
  if (outcome.kind === "stale") {
    return { ok: false, error: "STALE DUEL — RESYNCHRONIZING.", resync: true };
  }
  return { ok: true, ...outcome };
}

// ---------------------------------------------------------------------------
// Engaging
// ---------------------------------------------------------------------------

// Open a duel on a live run. Draws the puzzle once; both seats get this row.
export async function engageDuel(
  run: HackRun,
  defenderId: string
): Promise<{ ok: true; duel: PublicDuel } | { ok: false; error: string }> {
  const rng = createRng();
  const drawn = drawGame(DUEL_BAND, [], rng);
  const game = gameFor(drawn);
  if (!game) throw new Error(`drawGame returned unknown game: ${drawn}`);

  const { payload, solution } = generateChallenge(drawn, DUEL_BAND, rng);

  try {
    const duel = await db.hackDuel.create({
      data: {
        runId: run.id,
        defenderId,
        game: drawn,
        payload: JSON.stringify(payload),
        solution: JSON.stringify(solution),
        attackerNonce: randomUUID(),
        defenderNonce: randomUUID(),
        attackerAttemptsLeft: DUEL_ATTEMPTS,
        defenderAttemptsLeft: DUEL_ATTEMPTS,
        // The defender's clock starts now — they are the one who chose the
        // moment. The attacker's starts on delivery; see deliverDuel().
        defenderDeadlineAt: new Date(Date.now() + duelDeadlineMs(game.timeFactor)),
      },
    });
    return { ok: true, duel: publicDuel(duel, DUEL_SEATS.defender) };
  } catch {
    // Unique violation on runId — another officer claimed this case first.
    // Exactly the pattern getOrIssueChallenge uses for its own two-tab race:
    // whoever lost adopts the winner's row rather than opening a rival duel.
    const raced = await db.hackDuel.findUnique({ where: { runId: run.id } });
    if (!raced) return { ok: false, error: "COULD NOT OPEN COUNTER-INTRUSION." };
    if (raced.defenderId !== defenderId) {
      return { ok: false, error: "CASE ALREADY ENGAGED BY ANOTHER OFFICER." };
    }
    return { ok: true, duel: publicDuel(raced, DUEL_SEATS.defender) };
  }
}

// ---------------------------------------------------------------------------
// Lazy expiry
// ---------------------------------------------------------------------------

// Settle a duel whose clocks have run out.
//
// There is no cron in this deployment, so a duel abandoned by both tabs stays
// open in the table until someone next looks. Every entry point on both sides
// calls this first. Returns the updated run when the sweep ended it, null when
// the duel is still live.
//
// The timeout table, in full:
//   never delivered, past the pickup ceiling  -> defender (dead terminal)
//   never delivered, still inside it          -> live, nothing to do
//   both clocks out, defender never submitted -> attacker (walkover, not a
//                                                containment)
//   both clocks out, defender did submit      -> defender (stalemate means the
//                                                intrusion was contained)
export async function sweepDuel(duel: HackDuel): Promise<HackRun | null> {
  if (duel.winner !== null) return null;
  const now = Date.now();

  if (duel.deliveredAt === null) {
    if (now <= duel.startedAt.getTime() + DUEL_PICKUP_MS) return null;
    return settle(duel, DUEL_WINNERS.defender);
  }

  // The attacker's clock always ends last (it starts on delivery, the
  // defender's at engage), so it alone decides when a duel is over.
  const attackerDeadline = duel.attackerDeadlineAt ?? duel.defenderDeadlineAt;
  if (now <= attackerDeadline.getTime() + DEADLINE_GRACE_MS) return null;

  return settle(
    duel,
    duel.defenderSubmitted ? DUEL_WINNERS.defender : DUEL_WINNERS.attacker
  );
}

// ---------------------------------------------------------------------------
// The attacker's poll
// ---------------------------------------------------------------------------

// What the intruder's console asks for on every tick: "has anyone engaged me?"
//
// On the first call this stamps deliveredAt and starts the attacker's clock.
// THE ATTACKER'S CLOCK STARTS WHEN THEY SEE THE PUZZLE, not when the officer
// clicked — without that, poll latency would silently spend the intruder's
// time on a duel they had not been shown yet. The defender's few-second head
// start is real, deliberate (they were already watching the desk), and bounded
// by the poll interval.
export async function deliverDuel(runId: string): Promise<DuelOutcome | null> {
  const duel = await db.hackDuel.findUnique({ where: { runId } });
  if (!duel) return null;

  if (duel.winner !== null) {
    return outcomeFor(
      duel.winner as DuelWinner,
      DUEL_SEATS.attacker,
      "COUNTER-INTRUSION CONTAINED THE BREACH"
    );
  }

  if (duel.deliveredAt === null) {
    const game = gameFor(duel.game);
    const now = new Date();
    // Conditional on deliveredAt still being null, so two tabs polling at the
    // same instant cannot hand the attacker two different deadlines.
    await db.hackDuel.updateMany({
      where: { id: duel.id, deliveredAt: null },
      data: {
        deliveredAt: now,
        attackerDeadlineAt: new Date(
          now.getTime() + duelDeadlineMs(game?.timeFactor ?? 1)
        ),
      },
    });
    const delivered = await db.hackDuel.findUnique({ where: { id: duel.id } });
    if (!delivered) return null;
    return { kind: "live", duel: publicDuel(delivered, DUEL_SEATS.attacker) };
  }

  const swept = await sweepDuel(duel);
  if (swept) {
    const settled = await db.hackDuel.findUnique({ where: { id: duel.id } });
    return outcomeFor(
      (settled?.winner as DuelWinner) ?? DUEL_WINNERS.defender,
      DUEL_SEATS.attacker,
      "COUNTER-INTRUSION CONTAINED THE BREACH"
    );
  }

  return { kind: "live", duel: publicDuel(duel, DUEL_SEATS.attacker) };
}

// The defender's equivalent — read their seat, sweeping on the way through.
export async function readDuel(
  runId: string,
  userId: string
): Promise<DuelOutcome | null> {
  const duel = await db.hackDuel.findUnique({ where: { runId } });
  if (!duel || duel.defenderId !== userId) return null;

  if (duel.winner !== null) {
    return outcomeFor(
      duel.winner as DuelWinner,
      DUEL_SEATS.defender,
      "THE OPERATOR BROKE THROUGH"
    );
  }

  const swept = await sweepDuel(duel);
  if (swept) {
    const settled = await db.hackDuel.findUnique({ where: { id: duel.id } });
    return outcomeFor(
      (settled?.winner as DuelWinner) ?? DUEL_WINNERS.defender,
      DUEL_SEATS.defender,
      "THE OPERATOR BROKE THROUGH"
    );
  }

  return { kind: "live", duel: publicDuel(duel, DUEL_SEATS.defender) };
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

// Grade one answer from either seat.
//
// Validation order mirrors submitIntrusionAnswer exactly and for the same
// reasons: identity and staleness are settled before the clock, and the clock
// before the answer, so a late submission is never graded and a replayed nonce
// never re-enters a decided duel.
export async function submitDuelAnswer(
  userId: string,
  nonce: string,
  answer: string
): Promise<DuelOutcome> {
  const duel = await db.hackDuel.findFirst({
    where: { OR: [{ attackerNonce: nonce }, { defenderNonce: nonce }] },
    include: { run: true },
  });
  if (!duel) return { kind: "stale" };

  // The nonce IS the seat. Nothing about which side is submitting comes from
  // the request body.
  const seat: DuelSeat =
    duel.attackerNonce === nonce ? DUEL_SEATS.attacker : DUEL_SEATS.defender;
  const attacker = seat === DUEL_SEATS.attacker;

  const owner = attacker ? duel.run.userId : duel.defenderId;
  if (owner !== userId) return { kind: "stale" };

  const lostReason = attacker
    ? "COUNTER-INTRUSION CONTAINED THE BREACH"
    : "THE OPERATOR BROKE THROUGH";

  if (duel.winner !== null) {
    return outcomeFor(duel.winner as DuelWinner, seat, lostReason);
  }

  // An attacker submitting before their own poll delivered the duel has no
  // clock yet. Nothing legitimate produces this; treat it as stale rather
  // than inventing a deadline.
  if (attacker && duel.attackerDeadlineAt === null) return { kind: "stale" };

  const deadline = attacker ? duel.attackerDeadlineAt! : duel.defenderDeadlineAt;
  if (Date.now() > deadline.getTime() + DEADLINE_GRACE_MS) {
    const swept = await sweepDuel(duel);
    if (!swept) {
      // This seat's clock is out but the duel is not decidable yet — only the
      // defender can be here, waiting on the attacker's later deadline.
      return { kind: "lost", reason: "YOUR WINDOW CLOSED" };
    }
    const settled = await db.hackDuel.findUnique({ where: { id: duel.id } });
    return outcomeFor(
      (settled?.winner as DuelWinner) ?? DUEL_WINNERS.defender,
      seat,
      lostReason
    );
  }

  const result = gradeAnswer(duel.game, JSON.parse(duel.solution), answer);

  if (result.correct) {
    const winner = attacker ? DUEL_WINNERS.attacker : DUEL_WINNERS.defender;
    return outcomeFor(await claimWin(duel, winner), seat, lostReason);
  }

  // Wrong. Burn one of this seat's attempts, optimistically concurrent on the
  // current count so a double-submitted answer cannot spend two.
  const remaining = (attacker ? duel.attackerAttemptsLeft : duel.defenderAttemptsLeft) - 1;
  const spent = await db.hackDuel.updateMany({
    where: attacker
      ? { id: duel.id, winner: null, attackerAttemptsLeft: duel.attackerAttemptsLeft }
      : { id: duel.id, winner: null, defenderAttemptsLeft: duel.defenderAttemptsLeft },
    data: attacker
      ? { attackerAttemptsLeft: remaining }
      : { defenderAttemptsLeft: remaining, defenderSubmitted: true },
  });
  if (spent.count === 0) return { kind: "stale" };

  // A seat with no attempts left cannot win, so the duel is already decided —
  // resolve it now rather than letting the clock run out.
  //
  // This is also what stops the perverse case: a defender who burned every
  // guess would otherwise still take the duel on the stalemate rule by simply
  // waiting, which would make guessing wildly a winning strategy for them.
  if (remaining <= 0) {
    const winner = attacker ? DUEL_WINNERS.defender : DUEL_WINNERS.attacker;
    return outcomeFor(await claimWin(duel, winner), seat, lostReason);
  }

  const updated = await db.hackDuel.findUnique({ where: { id: duel.id } });
  if (!updated) return { kind: "stale" };
  return {
    kind: "wrong",
    duel: publicDuel(updated, seat),
    feedback: result.feedback,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

// Claim the win, atomically.
//
// Two humans racing on one row is a genuine race, not a theoretical one: the
// conditional updateMany on winner:null is a compare-and-set, and it is the
// only thing standing between "first correct answer wins" and a duel that both
// issues a grant AND fails the run. Consequences run strictly inside the
// branch that won the CAS.
//
// Returns the settled winner — ours if we claimed it, otherwise whoever beat
// us to it by milliseconds.
async function claimWin(duel: HackDuel, winner: DuelWinner): Promise<DuelWinner> {
  const claimed = await db.hackDuel.updateMany({
    where: { id: duel.id, winner: null },
    data: { winner, resolvedAt: new Date() },
  });

  if (claimed.count === 0) {
    const settled = await db.hackDuel.findUnique({
      where: { id: duel.id },
      select: { winner: true },
    });
    return (settled?.winner as DuelWinner) ?? winner;
  }

  await applyConsequences(duel, winner);
  return winner;
}

// Same claim, but returning the ended run — the shape sweepDuel and
// resolveStaleRuns need.
async function settle(duel: HackDuel, winner: DuelWinner): Promise<HackRun | null> {
  await claimWin(duel, winner);
  return db.hackRun.findUnique({ where: { id: duel.runId } });
}

// End the run, one way or the other. Called exactly once per duel.
async function applyConsequences(
  duel: HackDuel,
  winner: DuelWinner
): Promise<void> {
  const run = await db.hackRun.findUnique({ where: { id: duel.runId } });
  if (!run || run.status !== RUN_STATUS.active) return;

  const attackerWon = winner === DUEL_WINNERS.attacker;
  let tier = 0;

  if (attackerWon) {
    // Layer 3 is a FLOOR, not a ceiling. Someone who had already banked deeper
    // keeps what they earned — winning a duel must never be a downgrade.
    const clearedStages = Math.max(run.clearedStages, DUEL_PRIZE_STAGE);
    const updated = await db.hackRun.update({
      where: { id: run.id },
      data: {
        status: RUN_STATUS.extracted,
        clearedStages,
        endedAt: new Date(),
        atCheckpoint: false,
        stageDeadlineAt: null,
        // The desk has demonstrably touched this case, so it is no longer
        // sitting unlooked-at in the NEEDS_ACTION queue.
        caseStatus: CASE_STATUSES.inProgress,
        // What losing costs the officer: they cannot work this case for the
        // same backoff a failed trace carries. Reused rather than given its
        // own constant — it is the same "you had your shot" penalty.
        traceLockedUntil: new Date(Date.now() + TRACE_LOCKOUT_MS),
      },
    });
    tier = (await issueGrant(updated)).tier;
  } else {
    // failRun's effect, written out rather than imported — see the dependency
    // note at the top of this file.
    await db.hackRun.update({
      where: { id: run.id },
      data: {
        status: RUN_STATUS.failed,
        endedAt: new Date(),
        failReason: "REPELLED BY COUNTER-INTRUSION",
        atCheckpoint: false,
        stageDeadlineAt: null,
        caseStatus: CASE_STATUSES.inProgress,
      },
    });
  }

  await recordResolution(duel, run.userId, attackerWon, tier);
}

// The trail and the two bells, for a duel that may well have been decided
// while one or both tabs were shut.
async function recordResolution(
  duel: HackDuel,
  attackerId: string,
  attackerWon: boolean,
  tier: number
): Promise<void> {
  const code = caseCode(duel.runId);
  const defender = await db.user.findUnique({
    where: { id: duel.defenderId },
    select: { id: true, displayName: true, email: true },
  });

  // The RAISA-side verb carries its actor, like every other one on the desk:
  // engaging an intruder is an exercise of power and belongs in the trail.
  // Note this deliberately does not name the intruder — targetName is the
  // case code, so a staff member reading /admin/audit learns no more than a
  // RAISA officer at reveal 0 does.
  await logAudit({
    action: AUDIT_ACTIONS.hackDuelResolved,
    actor: defender,
    targetType: "hack_run",
    targetId: duel.runId,
    targetName: code,
    summary: attackerWon
      ? `Counter-intrusion lost — operator extracted ${clearanceLabel(tier)} read access`
      : "Counter-intrusion won — intrusion repelled",
  });

  await Promise.all([
    createNotification({
      userId: duel.defenderId,
      type: NOTIFICATION_TYPES.intrusion,
      body: attackerWon
        ? `COUNTER-INTRUSION LOST — CASE ${code}. OPERATOR HOLDS ${clearanceLabel(tier)} READ ACCESS.`
        : `COUNTER-INTRUSION WON — CASE ${code} REPELLED.`,
      link: `/counter-intel/${duel.runId}`,
    }),
    // The intruder's own bell. Their run may have been decided while they were
    // away from the terminal, and this is their record, so it leaks nothing.
    createNotification({
      userId: attackerId,
      type: NOTIFICATION_TYPES.intrusion,
      body: attackerWon
        ? `COUNTER-INTRUSION EVADED — ${clearanceLabel(tier)} READ ACCESS SEIZED.`
        : "COUNTER-INTRUSION REPELLED YOUR BREACH. ALL BANKED TIERS FORFEIT.",
      link: "/hack",
    }),
  ]);
}

// An unresolved duel on this run, or null.
//
// Every verb that could otherwise move or end the run has to consult this: a
// live duel FREEZES the ladder. Without it an intruder engaged while sitting
// at a checkpoint could simply hit EXTRACT and bank their tier before the
// officer had typed anything, and one engaged mid-round could let the
// abandoned intrusion clock fail them out into a cheaper loss.
export async function liveDuelFor(runId: string): Promise<HackDuel | null> {
  const duel = await db.hackDuel.findUnique({ where: { runId } });
  if (!duel || duel.winner !== null) return null;
  // Settle it first — a duel whose clocks are long gone must not freeze the
  // ladder forever just because both tabs were closed.
  const swept = await sweepDuel(duel);
  return swept ? null : duel;
}

// ---------------------------------------------------------------------------
// Reads for the desk
// ---------------------------------------------------------------------------

export type DuelRecord = {
  winner: DuelWinner | null;
  defenderId: string;
  defenderName: string | null;
};

// Whether a run has a duel on it, for the LIVE INTRUSIONS list. Returns the
// engaging officer's name — that names one of RAISA's own, not the intruder,
// so it sits outside the anonymity boundary anonymiseRun() enforces.
export async function duelsForRuns(runIds: string[]): Promise<Map<string, DuelRecord>> {
  if (runIds.length === 0) return new Map();
  const rows = await db.hackDuel.findMany({
    where: { runId: { in: runIds } },
    select: {
      runId: true,
      winner: true,
      defenderId: true,
      defender: { select: { displayName: true, email: true } },
    },
  });
  return new Map(
    rows.map((row) => [
      row.runId,
      {
        winner: (row.winner as DuelWinner | null) ?? null,
        defenderId: row.defenderId,
        defenderName: row.defender?.displayName ?? row.defender?.email ?? null,
      },
    ])
  );
}

// Opportunistic cleanup of duel puzzle bodies, mirroring pruneHackChallenges.
// The winner and the timestamps are the forensic record; the payload and the
// answer key have no value once the duel is decided.
export async function pruneDuelPayloads(probability = 0.05): Promise<void> {
  if (Math.random() > probability) return;
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.hackDuel.updateMany({
      where: {
        winner: { not: null },
        resolvedAt: { lt: cutoff },
        NOT: { payload: "" },
      },
      data: { payload: "", solution: "" },
    });
  } catch {
    /* pruning is best-effort */
  }
}
