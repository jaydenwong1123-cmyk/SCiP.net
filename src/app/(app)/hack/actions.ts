"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser, hasStaffPowers } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS, clientIp } from "@/lib/audit";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import { checkRateLimit, recordAttempt, HACK_RULE } from "@/lib/rate-limit";
import { clearanceLabel } from "@/lib/clearance";
import { RAISA_DEPARTMENT, caseCode } from "@/lib/counter-intel";
import {
  CHALLENGE_KINDS,
  MAX_STAGE,
  RUN_STATUS,
  formatDuration,
  stageCapMs,
} from "@/lib/hack/config";
import {
  failRun,
  getOrIssueChallenge,
  publicChallenge,
  pruneHackChallenges,
  pushDeeper,
  resolveStaleRuns,
  submitIntrusionAnswer,
  type PublicChallenge,
} from "@/lib/hack/engine";
import {
  deliverDuel,
  liveDuelFor,
  submitDuelAnswer,
  type DuelOutcome,
  type PublicDuel,
} from "@/lib/hack/duel";
import { hackCooldownState, issueGrant } from "@/lib/hack/grant";
import { DUEL_RULE } from "@/lib/rate-limit";
import {
  activeSanction,
  blocksRuns,
  cooldownMultiplier,
  sanctionRefusal,
} from "@/lib/hack/sanctions";
import {
  consumeTool,
  refundTool,
  isToolKind,
  ghostedRevealLevel,
  TOOL_KINDS,
  TOOL_LABELS,
  RECOMPILE_TIME_FACTOR,
  SPOOF_DURATION_MS,
  STOPWATCH_EXTEND_MS,
  type ToolKind,
} from "@/lib/hack/tools";
import { recompileRound, extendRoundDeadline } from "@/lib/hack/engine";

export type HackActionState =
  | { ok: true; kind: "challenge"; challenge: PublicChallenge; feedback?: string }
  | { ok: true; kind: "checkpoint" }
  | { ok: true; kind: "failed"; reason: string }
  | { ok: true; kind: "extracted"; tools?: string[] }
  // The round was lost, but an armed DEAD MAN SWITCH banked the depth already
  // cleared. An extraction as far as access is concerned; shown differently so
  // the member can see what the tool bought them.
  | { ok: true; kind: "deadman"; reason: string }
  // A RAISA officer has engaged this run head-to-head. Winning the duel is an
  // extraction and losing it is a failed run, so the two terminal kinds above
  // cover the outcomes and only the live puzzle needs a kind of its own.
  | { ok: true; kind: "duel"; duel: PublicDuel; feedback?: string }
  // The duel poll found nothing. Distinct from an error so the console can
  // ignore it without clearing whatever is on screen.
  | { ok: true; kind: "idle" }
  | { ok: false; error: string; resync?: boolean };

// Shown when a verb is refused because a counter-intrusion has the run frozen.
// The console resyncs on it, and its poll then puts the duel on screen.
const DUEL_LOCK_ERROR = "COUNTER-INTRUSION IN PROGRESS — THE LINK IS CONTESTED.";

// Begin a run.
//
// The audit entry deliberately records actor: null. If the intruder were logged
// as the actor, every staff member with /admin/audit access would see the
// identity the instant the run started, and the entire counter-intel mechanic
// would be theatre. The identity lives only on HackRun.userId, reachable only
// through the reveal ladder in lib/counter-intel.ts.
export async function beginHackRunAction(): Promise<HackActionState> {
  const user = await requireUser();
  void pruneHackChallenges();

  const existing = await resolveStaleRuns(user.id);
  if (existing && existing.status === RUN_STATUS.active) {
    // Resuming into a run that has since been engaged: hand back the duel, not
    // the intrusion challenge it suspended.
    const duel = await deliverDuel(existing.id);
    if (duel) return duelActionState(duel);
    const challenge = await getOrIssueChallenge(existing);
    return { ok: true, kind: "challenge", challenge: publicChallenge(challenge) };
  }

  // A sanction is checked BEFORE the cooldown, so a blacklisted member is told
  // they are blacklisted rather than being shown a cooldown that would not have
  // let them in anyway. Staff bypass the cooldown but NOT a sanction: a
  // disciplinary step aimed at a staff member has to actually land.
  const sanction = await activeSanction(user.id);
  if (blocksRuns(sanction) && sanction) {
    return { ok: false, error: sanctionRefusal(sanction) };
  }

  const cooldown = await hackCooldownState(
    user.id,
    hasStaffPowers(user),
    cooldownMultiplier(sanction)
  );
  if (cooldown.blocked) {
    return {
      ok: false,
      error: `TRACE COOLDOWN ACTIVE — RETRY IN ${formatDuration(
        cooldown.retryAfterMs
      )}.${cooldown.restricted ? " TERMINAL RESTRICTED BY ADMINISTRATION — COOLDOWN EXTENDED." : ""}`,
    };
  }

  const head = await headers();
  const run = await db.hackRun.create({
    data: {
      userId: user.id,
      stage: 1,
      round: 1,
      cursor: 0,
      stageDeadlineAt: (() => {
        const cap = stageCapMs(1);
        return cap === null ? null : new Date(Date.now() + cap);
      })(),
      // Forensics, snapshot now so the case file stays truthful even if the
      // member is later promoted or transferred.
      ip: await clientIp(),
      terminal: (head.get("user-agent") ?? "UNKNOWN").slice(0, 120),
      actorClearance: user.realClearance,
      actorDepartment: user.department ?? "",
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.hackRunStarted,
    actor: null,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: "Unauthorized access attempt detected on the member terminal",
  });

  // Alert RAISA — without naming anyone. Uncovering the name is precisely what
  // the trace ladder at /counter-intel exists to do. Staff runs are drills
  // rather than incidents, and they bypass the cooldown, so they are skipped
  // outright to keep from burying the bell.
  if (!hasStaffPowers(user)) {
    const raisa = await db.user.findMany({
      where: { department: RAISA_DEPARTMENT, suspended: false },
      select: { id: true },
    });
    await Promise.all(
      raisa.map((officer) =>
        createNotification({
          userId: officer.id,
          type: NOTIFICATION_TYPES.intrusion,
          body: `UNAUTHORIZED ACCESS SIGNAL — CASE ${caseCode(run.id)}. ORIGIN UNKNOWN.`,
          link: `/counter-intel/${run.id}`,
        })
      )
    );
  }

  const challenge = await getOrIssueChallenge(run);
  revalidatePath("/hack");
  return { ok: true, kind: "challenge", challenge: publicChallenge(challenge) };
}

// Grade one answer.
//
// Returns the next challenge in the same response rather than revalidating, so
// rounds chain with no pause and no round trip through the router cache. See
// the cache-call notes in the feature plan.
export async function submitHackAnswerAction(
  _prevState: HackActionState | null,
  formData: FormData
): Promise<HackActionState> {
  const user = await requireUser();

  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  // Backstop against a script hammering the guess-carrying games. The per
  // challenge attempt budget is the real limit; this only stops abuse volume.
  // Staff and above are exempt from every cooldown in this feature, this one
  // included — see hackCooldownState for the daily/failure lockout twin.
  if (!hasStaffPowers(user)) {
    const throttle = await checkRateLimit("hack", user.id, HACK_RULE);
    if (throttle.blocked) {
      return {
        ok: false,
        error: `TERMINAL LOCKED — RETRY IN ${formatDuration(throttle.retryAfterMs)}.`,
      };
    }
    await recordAttempt("hack", user.id);
  }

  const nonce = String(formData.get("nonce") ?? "");
  const answer = String(formData.get("answer") ?? "").slice(0, 400);
  // Conduct telemetry from the console. Never validated beyond a length cap —
  // it is evidence to be filed, not input to be trusted, and every consumer
  // downstream treats it that way.
  const signals = String(formData.get("signals") ?? "").slice(0, 400);
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  const outcome = await submitIntrusionAnswer(user.id, nonce, answer, signals);

  switch (outcome.kind) {
    case "stale":
      return {
        ok: false,
        error: "STALE CHALLENGE — RESYNCHRONIZING.",
        resync: true,
      };
    case "wrong":
      return {
        ok: true,
        kind: "challenge",
        challenge: outcome.challenge,
        feedback: outcome.feedback,
      };
    case "advanced":
      return { ok: true, kind: "challenge", challenge: outcome.challenge };
    case "checkpoint":
      return { ok: true, kind: "checkpoint" };
    case "failed":
      await logHackFailure(outcome.reason);
      revalidatePath("/hack");
      return { ok: true, kind: "failed", reason: outcome.reason };
    case "deadman":
      // The run still ended on a lost round, so the repelled verb is still the
      // truthful one for the trail — the switch changed what the intruder kept,
      // not whether they were caught.
      await logHackFailure(`${outcome.reason} (DEAD MAN SWITCH FIRED)`);
      // Effective clearance changed, exactly as a clean extraction does.
      revalidatePath("/", "layout");
      return { ok: true, kind: "deadman", reason: outcome.reason };
  }
}

// ---------------------------------------------------------------------------
// Counter-intrusion duel
// ---------------------------------------------------------------------------

// Fold a seat-relative duel outcome into the console's own state machine.
//
// The intruder needs no new terminal phases: winning the duel IS an extraction
// (Layer 3 access, banked by resolveDuel) and losing it IS a failed run.
async function duelActionState(
  outcome: DuelOutcome | null
): Promise<HackActionState> {
  if (!outcome) return { ok: true, kind: "idle" };
  switch (outcome.kind) {
    case "stale":
      return { ok: false, error: "STALE DUEL — RESYNCHRONIZING.", resync: true };
    case "live":
      return { ok: true, kind: "duel", duel: outcome.duel };
    case "wrong":
      return {
        ok: true,
        kind: "duel",
        duel: outcome.duel,
        feedback: outcome.feedback,
      };
    case "won":
      // Effective clearance changed — the header chip, the nav and the menu
      // all have to re-render, exactly as a normal extraction does.
      revalidatePath("/", "layout");
      return { ok: true, kind: "extracted" };
    case "lost":
      revalidatePath("/hack");
      return { ok: true, kind: "failed", reason: outcome.reason };
  }
}

// "Has anyone engaged me?"
//
// There is no realtime transport in this deployment, so the intruder's console
// asks on a timer. Deliberately unthrottled: this is a read the console makes
// on its own schedule, not user input, and rate-limiting it would let a member
// dodge a duel by burning their own bucket.
export async function pollDuelAction(): Promise<HackActionState> {
  const user = await requireUser();

  // Cheap guard so the poll is a single indexed lookup on the common path
  // where no run is even open.
  const run = await db.hackRun.findFirst({
    where: { userId: user.id, status: RUN_STATUS.active },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!run) return { ok: true, kind: "idle" };

  return duelActionState(await deliverDuel(run.id));
}

// The intruder's half of the race.
export async function submitDuelAnswerAction(
  _prevState: HackActionState | null,
  formData: FormData
): Promise<HackActionState> {
  const user = await requireUser();

  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  // Its own bucket, separate from HACK_RULE: a member who spent their ladder
  // allowance on a long run must still be able to answer a duel they did not
  // ask for.
  if (!hasStaffPowers(user)) {
    const throttle = await checkRateLimit("hack_duel", user.id, DUEL_RULE);
    if (throttle.blocked) {
      return {
        ok: false,
        error: `TERMINAL LOCKED — RETRY IN ${formatDuration(throttle.retryAfterMs)}.`,
      };
    }
    await recordAttempt("hack_duel", user.id);
  }

  const nonce = String(formData.get("nonce") ?? "");
  const answer = String(formData.get("answer") ?? "").slice(0, 400);
  const signals = String(formData.get("signals") ?? "").slice(0, 400);
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  return duelActionState(
    await submitDuelAnswer(user.id, nonce, answer, signals)
  );
}

async function logHackFailure(reason: string) {
  await logAudit({
    action: AUDIT_ACTIONS.hackRunFailed,
    actor: null,
    targetType: "hack_run",
    targetName: "",
    summary: `Intrusion repelled: ${reason}`,
  });
}

// Bank the tier reached and end the run.
export async function extractHackRunAction(): Promise<HackActionState> {
  const user = await requireUser();
  const run = await resolveStaleRuns(user.id);

  if (!run || run.status !== RUN_STATUS.active || !run.atCheckpoint) {
    return { ok: false, error: "NO ACTIVE EXTRACTION POINT.", resync: true };
  }
  // A live duel freezes the ladder. Without this, being engaged while parked
  // at a checkpoint would be a gift: bank the tier, close the link, and never
  // fight the duel at all.
  if (await liveDuelFor(run.id)) {
    return { ok: false, error: DUEL_LOCK_ERROR, resync: true };
  }
  if (run.clearedStages < 1) {
    return { ok: false, error: "NOTHING BANKED — NO TIER REACHED." };
  }

  const { tier, expiresAt, tools } = await issueGrant(run);
  await db.hackRun.update({
    where: { id: run.id },
    data: {
      status: RUN_STATUS.extracted,
      endedAt: new Date(),
      atCheckpoint: false,
      stageDeadlineAt: null,
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.hackGrantIssued,
    actor: null,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: `${clearanceLabel(tier)} read access banked until ${expiresAt
      .toISOString()
      .slice(0, 16)
      .replace("T", " ")}`,
  });

  // Effective clearance changed, so the header chip, the nav and the menu all
  // have to re-render. Layout-wide, exactly as the "view as" toggle does.
  revalidatePath("/", "layout");
  return { ok: true, kind: "extracted", tools };
}

// Decline the checkpoint and take on the next stage.
export async function pushDeeperAction(): Promise<HackActionState> {
  const user = await requireUser();
  const run = await resolveStaleRuns(user.id);

  if (!run || run.status !== RUN_STATUS.active || !run.atCheckpoint) {
    return { ok: false, error: "NO ACTIVE EXTRACTION POINT.", resync: true };
  }
  if (await liveDuelFor(run.id)) {
    return { ok: false, error: DUEL_LOCK_ERROR, resync: true };
  }
  if (run.stage >= MAX_STAGE) {
    return { ok: false, error: "NO DEEPER LAYER EXISTS." };
  }

  const advanced = await pushDeeper(run);
  const challenge = await getOrIssueChallenge(advanced);
  return { ok: true, kind: "challenge", challenge: publicChallenge(challenge) };
}

// ---------------------------------------------------------------------------
// Intrusion toolkit
// ---------------------------------------------------------------------------

export type ToolActionState =
  | { ok: true; kind: "challenge"; challenge: PublicChallenge; note: string }
  | { ok: true; kind: "note"; note: string }
  | { ok: false; error: string; resync?: boolean };

// Spend one earned countermeasure.
//
// ORDER OF OPERATIONS MATTERS HERE, and it is the same discipline
// submitIntrusionAnswer follows: establish the run's state FIRST, then spend the
// tool, then apply the effect. Spending before validating would let a member
// burn a tool on a run that had already timed out; applying before spending
// would let two tabs apply the effect twice off one tool.
//
// The tool is refunded if the effect cannot be applied after it was consumed.
// That window is small but real (RECOMPILE writes three rows), and eating a
// member's earned tool because of a transient database error is not acceptable
// when the fix is four lines.
export async function spendHackToolAction(
  _prevState: ToolActionState | null,
  formData: FormData
): Promise<ToolActionState> {
  const user = await requireUser();

  const raw = String(formData.get("kind") ?? "");
  if (!isToolKind(raw)) return { ok: false, error: "UNKNOWN COUNTERMEASURE." };
  const kind: ToolKind = raw;

  // One clock read for the whole action, so every deadline comparison and every
  // timestamp written below agrees on when "now" was.
  const now = Date.now();

  // GHOST is the one tool that acts on a FINISHED case rather than a live run,
  // so it takes its own path entirely — see below.
  if (kind === TOOL_KINDS.ghost) return applyGhostProtocol(user.id);

  const run = await resolveStaleRuns(user.id);
  if (!run || run.status !== RUN_STATUS.active) {
    return { ok: false, error: "NO ACTIVE INTRUSION.", resync: true };
  }
  // Frozen for the same reason EXTRACT and PUSH DEEPER are: a duel must be
  // fought, not tooled out of.
  if (await liveDuelFor(run.id)) {
    return { ok: false, error: DUEL_LOCK_ERROR, resync: true };
  }

  // RECOMPILE and DEADMAN both change what happens to the round in flight, so
  // neither may be spent once that round's clock has run out. Without this,
  // both become "click after losing".
  const open = await db.hackChallenge.findFirst({
    where: {
      runId: run.id,
      kind: CHALLENGE_KINDS.intrusion,
      cursor: run.cursor,
      correct: null,
    },
    select: { id: true, deadlineAt: true },
  });

  if (kind === TOOL_KINDS.recompile) {
    if (run.atCheckpoint || !open) {
      return { ok: false, error: "NO ROUND IN PROGRESS TO REDRAW." };
    }
    if (now > open.deadlineAt.getTime()) {
      return { ok: false, error: "ROUND ALREADY LOST — TOO LATE.", resync: true };
    }

    const toolId = await consumeTool(user.id, kind, run.id);
    if (!toolId) return { ok: false, error: "NO RECOMPILE CHARGE REMAINING." };

    try {
      const next = await recompileRound(run, RECOMPILE_TIME_FACTOR);
      return {
        ok: true,
        kind: "challenge",
        challenge: publicChallenge(next),
        note: `${TOOL_LABELS[kind]} APPLIED — NEW PUZZLE, SHORTENED CLOCK.`,
      };
    } catch (err) {
      await refundTool(toolId);
      console.error("[hack] recompile failed", err);
      return { ok: false, error: "REDRAW FAILED — CHARGE REFUNDED.", resync: true };
    }
  }

  if (kind === TOOL_KINDS.deadman) {
    if (run.deadmanArmed) {
      return { ok: false, error: "DEAD MAN SWITCH ALREADY ARMED." };
    }
    // Arming with nothing banked would spend a tool for no effect: the switch
    // saves cleared depth, and there is none until a layer is complete.
    if (run.clearedStages < 1) {
      return {
        ok: false,
        error: "NOTHING BANKED YET — CLEAR A LAYER BEFORE ARMING.",
      };
    }

    const toolId = await consumeTool(user.id, kind, run.id);
    if (!toolId) return { ok: false, error: "NO DEAD MAN CHARGE REMAINING." };

    try {
      await db.hackRun.update({
        where: { id: run.id },
        data: { deadmanArmed: true },
      });
      return {
        ok: true,
        kind: "note",
        note: `${TOOL_LABELS[kind]} ARMED — A FAILURE NOW BANKS LAYER ${run.clearedStages}.`,
      };
    } catch {
      await refundTool(toolId);
      return { ok: false, error: "ARMING FAILED — CHARGE REFUNDED." };
    }
  }

  if (kind === TOOL_KINDS.stopwatch) {
    // Same guard as RECOMPILE: a deadline that has already passed cannot be
    // extended, or this becomes a way to un-lose a round rather than a way to
    // buy more time on one still in play.
    if (run.atCheckpoint || !open) {
      return { ok: false, error: "NO ROUND IN PROGRESS TO EXTEND." };
    }
    if (now > open.deadlineAt.getTime()) {
      return { ok: false, error: "ROUND ALREADY LOST — TOO LATE.", resync: true };
    }

    const toolId = await consumeTool(user.id, kind, run.id);
    if (!toolId) return { ok: false, error: "NO STOPWATCH CHARGE REMAINING." };

    try {
      const next = await extendRoundDeadline(open, STOPWATCH_EXTEND_MS);
      return {
        ok: true,
        kind: "challenge",
        challenge: publicChallenge(next),
        note: `${TOOL_LABELS[kind]} APPLIED — +${Math.round(
          STOPWATCH_EXTEND_MS / 1000
        )}S ON THE CLOCK.`,
      };
    } catch (err) {
      await refundTool(toolId);
      console.error("[hack] stopwatch failed", err);
      return { ok: false, error: "EXTEND FAILED — CHARGE REFUNDED.", resync: true };
    }
  }

  // SIGNAL SPOOF.
  if (run.spoofedUntil && run.spoofedUntil.getTime() > now) {
    return { ok: false, error: "SIGNAL ALREADY SUPPRESSED." };
  }

  const toolId = await consumeTool(user.id, kind, run.id);
  if (!toolId) return { ok: false, error: "NO SPOOF CHARGE REMAINING." };

  try {
    await db.hackRun.update({
      where: { id: run.id },
      data: { spoofedUntil: new Date(now + SPOOF_DURATION_MS) },
    });
    return {
      ok: true,
      kind: "note",
      note: `${TOOL_LABELS[TOOL_KINDS.spoof]} ACTIVE FOR ${formatDuration(
        SPOOF_DURATION_MS
      )} — SIGNAL SUPPRESSED ON THE COUNTER-INTEL BOARD.`,
    };
  } catch {
    await refundTool(toolId);
    return { ok: false, error: "SUPPRESSION FAILED — CHARGE REFUNDED." };
  }
}

// GHOST PROTOCOL: scrub one traced field from the member's most recent case.
//
// Applies to a FINISHED run, which is what makes it the only tool with any use
// after the terminal closes — the trace ladder runs on RAISA's schedule, not the
// intruder's, so the field being scrubbed is usually uncovered long after the
// run ended.
//
// Deliberately does not touch traceById or identifiedAt: the record that the
// desk got there stays. GHOST buys back a field, never the history.
async function applyGhostProtocol(userId: string): Promise<ToolActionState> {
  const target = await db.hackRun.findFirst({
    where: { userId, revealLevel: { gt: 0 } },
    orderBy: { startedAt: "desc" },
    select: { id: true, revealLevel: true },
  });
  if (!target) {
    return {
      ok: false,
      error: "NOTHING TO SCRUB — NO CASE OF YOURS HAS BEEN TRACED.",
    };
  }

  const toolId = await consumeTool(userId, TOOL_KINDS.ghost, target.id);
  if (!toolId) return { ok: false, error: "NO GHOST CHARGE REMAINING." };

  try {
    const next = ghostedRevealLevel(target.revealLevel);
    await db.hackRun.update({
      where: { id: target.id },
      // traceCursor moves with it so the desk must re-solve a trace round to
      // recover the field, rather than the ladder handing it straight back.
      data: { revealLevel: next, traceCursor: { increment: 1 } },
    });

    // Audited with a NULL actor, exactly like the other intruder-side verbs:
    // naming the member here would hand /admin/audit the identity the reveal
    // ladder exists to protect — and this entry is specifically about that
    // identity being pulled back.
    await logAudit({
      action: AUDIT_ACTIONS.hackTraceScrubbed,
      actor: null,
      targetType: "hack_run",
      targetId: target.id,
      targetName: caseCode(target.id),
      summary: `Counter-forensic scrub — reveal level rolled back to ${next}`,
    });

    return {
      ok: true,
      kind: "note",
      note: `${TOOL_LABELS[TOOL_KINDS.ghost]} APPLIED — CASE ${caseCode(
        target.id
      )} ROLLED BACK TO REVEAL LEVEL ${next}.`,
    };
  } catch {
    await refundTool(toolId);
    return { ok: false, error: "SCRUB FAILED — CHARGE REFUNDED." };
  }
}

// Walk away mid-round. Counts as a failure, and carries the failure cooldown:
// disconnecting to dodge a puzzle must not be cheaper than losing to it.
export async function abortHackRunAction(): Promise<HackActionState> {
  const user = await requireUser();
  const run = await resolveStaleRuns(user.id);
  if (!run || run.status !== RUN_STATUS.active) {
    return { ok: false, error: "NO ACTIVE INTRUSION.", resync: true };
  }
  // Disconnecting mid-duel would rob the officer of the win they are racing
  // for and turn the duel into a way to pick your own defeat. The run ends
  // either way; it ends on the duel's terms.
  if (await liveDuelFor(run.id)) {
    return { ok: false, error: DUEL_LOCK_ERROR, resync: true };
  }

  await failRun(run, "OPERATOR DISCONNECTED");
  await logHackFailure("OPERATOR DISCONNECTED");
  revalidatePath("/hack");
  return { ok: true, kind: "failed", reason: "OPERATOR DISCONNECTED" };
}
