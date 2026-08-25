"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasStaffPowers } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import { clearanceLabel } from "@/lib/clearance";
import {
  canAccessCounterIntel,
  canDeleteCounterIntelLog,
  canResolveCounterIntelCase,
  caseCode,
  isCaseStatus,
  isClaimLive,
  claimTtlCutoff,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  CLAIM_TTL_MS,
  REVEAL_MAX,
} from "@/lib/counter-intel";
import {
  CHALLENGE_KINDS,
  DEADLINE_GRACE_MS,
  RUN_STATUS,
  TRACE_LOCKOUT_MS,
  formatDuration,
} from "@/lib/hack/config";
import {
  getOrIssueChallenge,
  publicChallenge,
  resolveStaleRuns,
  type PublicChallenge,
} from "@/lib/hack/engine";
import {
  duelState,
  engageDuel,
  readDuel,
  submitDuelAnswer,
  type DuelState,
} from "@/lib/hack/duel";
import { gradeAnswer } from "@/lib/hack/games";
import { recordConduct, CONDUCT_SURFACES } from "@/lib/hack/conduct";
import { revokeGrant } from "@/lib/hack/grant";
import { checkRateLimit, recordAttempt, DUEL_RULE } from "@/lib/rate-limit";

export type TraceState =
  | { ok: true; kind: "challenge"; challenge: PublicChallenge; feedback?: string }
  | { ok: true; kind: "revealed"; revealLevel: number }
  | { ok: true; kind: "locked"; reason: string }
  | { ok: false; error: string; resync?: boolean };

// Shared gate. Department string only — see the header of lib/counter-intel.ts
// for why staff powers deliberately do not open this desk.
async function requireRaisa() {
  const user = await requireUser();
  if (!canAccessCounterIntel(user)) return null;
  return user;
}

export async function beginTraceAction(runId: string): Promise<TraceState> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const run = await db.hackRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "CASE NOT FOUND." };
  if (run.revealLevel >= REVEAL_MAX) {
    return { ok: false, error: "CASE FULLY IDENTIFIED." };
  }
  // Staff and above are exempt from every cooldown in this feature — see the
  // matching bypass on the intrusion side in hack/actions.ts.
  if (
    !hasStaffPowers(user) &&
    run.traceLockedUntil &&
    run.traceLockedUntil.getTime() > Date.now()
  ) {
    return {
      ok: true,
      kind: "locked",
      reason: `TRACE BACKOFF — RETRY IN ${formatDuration(
        run.traceLockedUntil.getTime() - Date.now()
      )}.`,
    };
  }

  const challenge = await getOrIssueChallenge(run, CHALLENGE_KINDS.trace);
  return { ok: true, kind: "challenge", challenge: publicChallenge(challenge) };
}

// Grade a trace answer and, on success, uncover exactly one more field.
export async function submitTraceAnswerAction(
  _prevState: TraceState | null,
  formData: FormData
): Promise<TraceState> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const nonce = String(formData.get("nonce") ?? "");
  const answer = String(formData.get("answer") ?? "").slice(0, 400);
  // Conduct telemetry from the trace console. Filed, never trusted — and the
  // desk is scored on exactly the same terms as the people it investigates.
  const signals = String(formData.get("signals") ?? "").slice(0, 400);
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  const challenge = await db.hackChallenge.findUnique({
    where: { nonce },
    include: { run: true },
  });

  // Same opaque-staleness rule as the intrusion side: never distinguish "not
  // yours" from "already used" from "wrong cursor".
  if (
    !challenge ||
    challenge.kind !== CHALLENGE_KINDS.trace ||
    challenge.correct !== null ||
    challenge.cursor !== challenge.run.traceCursor ||
    challenge.run.revealLevel >= REVEAL_MAX
  ) {
    return { ok: false, error: "STALE TRACE — RESYNCHRONIZING.", resync: true };
  }

  const run = challenge.run;

  // A trace that ran out of time is a failed trace, handled below rather than
  // graded — the clock is the server's, exactly as on the intrusion side.
  const expired = Date.now() > challenge.deadlineAt.getTime() + DEADLINE_GRACE_MS;
  const result = expired
    ? { correct: false, feedback: "TRACE WINDOW CLOSED" }
    : gradeAnswer(challenge.game, JSON.parse(challenge.solution), answer);

  // File the officer's conduct for this round. An expired trace is not scored
  // as conduct — it was never graded, so there is nothing to say about how it
  // was solved.
  if (!expired) {
    await recordConduct({
      userId: user.id,
      surface: CONDUCT_SURFACES.trace,
      runId: run.id,
      game: challenge.game,
      elapsedMs: Date.now() - challenge.issuedAt.getTime(),
      answer,
      correct: result.correct,
      rawSignals: signals,
    });
  }

  // A guess-carrying game (e.g. icebreaker) burns an attempt rather than the
  // trace itself, same as the intrusion side — a wrong guess must not cost a
  // backoff while attempts remain, or the "attemptsLeft" the console shows
  // would be a lie.
  if (!result.correct && !expired && challenge.attemptsLeft > 1) {
    const updated = await db.hackChallenge.update({
      where: { id: challenge.id },
      data: { attemptsLeft: challenge.attemptsLeft - 1 },
    });
    return {
      ok: true,
      kind: "challenge",
      challenge: publicChallenge(updated),
      feedback: result.feedback,
    };
  }

  await db.hackChallenge.update({
    where: { id: challenge.id },
    data: { correct: result.correct, answeredAt: new Date() },
  });

  if (!result.correct) {
    // A failed trace never REGRESSES the reveal level — RAISA does not lose
    // ground they already covered. It costs them a backoff instead, so the
    // ladder cannot be brute-forced by resubmitting garbage. Staff and above
    // are exempt from the backoff itself, same as every other cooldown in
    // this feature.
    const staffExempt = hasStaffPowers(user);
    await db.hackRun.update({
      where: { id: run.id },
      data: {
        traceCursor: run.traceCursor + 1,
        traceLockedUntil: staffExempt
          ? null
          : new Date(Date.now() + TRACE_LOCKOUT_MS),
      },
    });
    revalidatePath(`/counter-intel/${run.id}`);
    return {
      ok: true,
      kind: "locked",
      reason: staffExempt
        ? `${result.feedback ?? "TRACE LOST"} — STAFF OVERRIDE, NO BACKOFF.`
        : `${result.feedback ?? "TRACE LOST"} — BACKOFF ${formatDuration(
            TRACE_LOCKOUT_MS
          )}.`,
    };
  }

  const revealLevel = Math.min(run.revealLevel + 1, REVEAL_MAX);
  await db.hackRun.update({
    where: { id: run.id },
    data: {
      revealLevel,
      traceCursor: run.traceCursor + 1,
      traceById: user.id,
      identifiedAt: revealLevel >= REVEAL_MAX ? new Date() : run.identifiedAt,
    },
  });

  // The RAISA-side verbs DO carry their actor, unlike the intruder-side ones:
  // uncovering a member's identity is itself an exercise of power and belongs
  // in the trail.
  await logAudit({
    action: AUDIT_ACTIONS.hackTraceRevealed,
    actor: user,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: `Trace advanced to reveal ${revealLevel}/${REVEAL_MAX}`,
  });

  revalidatePath(`/counter-intel/${run.id}`);
  return { ok: true, kind: "revealed", revealLevel };
}

// There is deliberately no free trace-answer preview here, exactly as on the
// intrusion side: a likeness count that costs nothing turns ICE PASSWORD
// CRACK's attempt budget into an unlimited oracle. RESOLVE is the only grader.

// ---------------------------------------------------------------------------
// Counter-intrusion duel
// ---------------------------------------------------------------------------

// Engage a live intrusion head-to-head.
//
// Both seats are then served the same puzzle and the first correct answer
// decides the run: the intruder walks away with Layer 3 access, or the breach
// is repelled on the spot. See lib/hack/duel.ts for the rules.
export async function engageDuelAction(runId: string): Promise<DuelState> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const run = await db.hackRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "CASE NOT FOUND." };

  // An officer must not duel themselves. The desk list already filters own
  // runs out, so reaching this is either a stale page or a hand-rolled call;
  // either way the error is deliberately the same one a non-live case gives,
  // so it cannot be used to confirm which case code is your own.
  if (run.userId === user.id || run.status !== RUN_STATUS.active) {
    return { ok: false, error: "CASE IS NOT LIVE.", resync: true };
  }

  // Settles an intrusion that has already timed out but not yet been swept —
  // engaging a corpse would open a duel the intruder can never answer.
  const live = await resolveStaleRuns(run.userId);
  if (!live || live.id !== run.id || live.status !== RUN_STATUS.active) {
    return { ok: false, error: "CASE IS NOT LIVE.", resync: true };
  }

  const result = await engageDuel(live, user.id);
  if (!result.ok) return { ok: false, error: result.error, resync: true };

  await logAudit({
    action: AUDIT_ACTIONS.hackDuelEngaged,
    actor: user,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: "Counter-intrusion opened against a live breach",
  });

  revalidatePath("/counter-intel");
  return { ok: true, kind: "live", duel: result.duel };
}

// The defender's tick. Also drives lazy expiry for the whole duel: an officer
// sitting on this page is the most likely request to be running when either
// clock finally goes.
export async function pollDuelAction(runId: string): Promise<DuelState> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };
  return duelState(await readDuel(runId, user.id));
}

export async function submitDuelAnswerAction(
  _prevState: DuelState | null,
  formData: FormData
): Promise<DuelState> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

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
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  const signals = String(formData.get("signals") ?? "").slice(0, 400);

  const state = duelState(
    await submitDuelAnswer(user.id, nonce, answer, signals)
  );
  if (state.ok && (state.kind === "won" || state.kind === "lost")) {
    revalidatePath("/counter-intel");
    revalidatePath(`/counter-intel/${String(formData.get("runId") ?? "")}`);
  }
  return state;
}

// Cut off an identified intruder's access.
export async function revokeHackGrantAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { ok: false, error: "MISSING CASE ID." };

  const run = await db.hackRun.findUnique({
    where: { id: runId },
    include: { grant: true },
  });
  if (!run || !run.grant) return { ok: false, error: "NO ACTIVE GRANT ON THIS CASE." };
  if (run.revealLevel < REVEAL_MAX) {
    return { ok: false, error: "IDENTIFY THE OPERATOR BEFORE REVOKING ACCESS." };
  }
  if (run.grant.revokedAt) return { ok: false, error: "ALREADY REVOKED." };

  await revokeGrant(run.grant.id, user.id);

  await logAudit({
    action: AUDIT_ACTIONS.hackGrantRevoked,
    actor: user,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: `Revoked ${clearanceLabel(run.grant.tier)} illicit read access`,
  });

  // The intruder's session drops the grant on their very next request:
  // getActiveHackGrant filters revokedAt, and the JWT carries only a user id,
  // so nothing is cached that would keep them elevated.
  revalidatePath("/counter-intel");
  revalidatePath(`/counter-intel/${run.id}`);
  return { ok: true };
}

// Move a case through RAISA's manual investigative workflow. Any desk member
// may pick a case up (IN_PROGRESS) or send it back to the queue (NEEDS_ACTION);
// closing it (RESOLVED) is L-R5 only — see canResolveCounterIntelCase() for why.
export async function setCaseStatusAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const runId = String(formData.get("runId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!runId) return { ok: false, error: "MISSING CASE ID." };
  if (!isCaseStatus(status)) return { ok: false, error: "INVALID STATUS." };
  if (status === CASE_STATUSES.resolved && !canResolveCounterIntelCase(user)) {
    return { ok: false, error: "ONLY L-R5 MAY MARK A CASE RESOLVED." };
  }

  const run = await db.hackRun.findUnique({
    where: { id: runId },
    select: { id: true, caseStatus: true },
  });
  if (!run) return { ok: false, error: "CASE NOT FOUND." };
  if (run.caseStatus === status) return { ok: true };

  await db.hackRun.update({ where: { id: runId }, data: { caseStatus: status } });

  await logAudit({
    action: AUDIT_ACTIONS.hackCaseStatusSet,
    actor: user,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: `Case status set to ${CASE_STATUS_LABELS[status]}`,
  });

  revalidatePath("/counter-intel");
  revalidatePath(`/counter-intel/${run.id}`);
  return { ok: true };
}

// Pick a case up, so the rest of the desk can see it is being worked.
//
// ANY desk member may claim — a claim is investigative work, not a
// recordkeeping decision, so it carries none of the L-R5 gates that RESOLVED
// and delete do. It is also not a lock: nothing here prevents another officer
// tracing a claimed case. It is a coordination signal, and treating it as
// enforcement would mean a lapsed claim could strand a case nobody could touch.
//
// Claiming advances NEEDS_ACTION to IN_PROGRESS, because that is what picking a
// case up means; a case already past NEEDS_ACTION keeps whatever status it has.
export async function claimCaseAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { ok: false, error: "MISSING CASE ID." };

  const run = await db.hackRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      caseStatus: true,
      claimedById: true,
      claimedAt: true,
    },
  });
  if (!run) return { ok: false, error: "CASE NOT FOUND." };

  if (isClaimLive(run)) {
    if (run.claimedById === user.id) return { ok: true };
    const holder = await db.user.findUnique({
      where: { id: run.claimedById! },
      select: { displayName: true, email: true },
    });
    return {
      ok: false,
      error: `ALREADY CLAIMED BY ${holder?.displayName ?? holder?.email ?? "ANOTHER OFFICER"}.`,
    };
  }

  // Conditional on the claim still being free, so two officers clicking at
  // once produce one claim rather than a silent overwrite. Matches the
  // conditional-write pattern resolveDuel and consumeTool use.
  const { count } = await db.hackRun.updateMany({
    where: {
      id: runId,
      OR: [
        { claimedById: null },
        { claimedAt: { lt: claimTtlCutoff() } },
        { claimedById: user.id },
      ],
    },
    data: {
      claimedById: user.id,
      claimedAt: new Date(),
      caseStatus:
        run.caseStatus === CASE_STATUSES.needsAction
          ? CASE_STATUSES.inProgress
          : run.caseStatus,
    },
  });
  if (count !== 1) {
    return { ok: false, error: "CASE WAS CLAIMED BY ANOTHER OFFICER." };
  }

  await logAudit({
    action: AUDIT_ACTIONS.hackCaseClaimed,
    actor: user,
    targetType: "hack_run",
    targetId: runId,
    targetName: caseCode(runId),
    summary: `Case picked up — held for ${formatDuration(CLAIM_TTL_MS)}`,
  });

  revalidatePath("/counter-intel");
  revalidatePath(`/counter-intel/${runId}`);
  return { ok: true };
}

// Hand a case back to the queue.
//
// Only the holder may release, and only while the claim is live — an officer
// must not be able to clear somebody else's name off a case. A lapsed claim
// needs no release: it is already gone as far as every reader is concerned.
export async function releaseCaseAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { ok: false, error: "MISSING CASE ID." };

  // Releasing deliberately does NOT revert caseStatus. Work that was done on
  // the case was still done; putting it back to NEEDS_ACTION would erase that
  // and restart the SLA clock, which is exactly the wrong incentive for an
  // officer being honest about handing something over.
  const { count } = await db.hackRun.updateMany({
    where: { id: runId, claimedById: user.id },
    data: { claimedById: null, claimedAt: null },
  });
  if (count !== 1) {
    return { ok: false, error: "YOU DO NOT HOLD THIS CASE." };
  }

  await logAudit({
    action: AUDIT_ACTIONS.hackCaseReleased,
    actor: user,
    targetType: "hack_run",
    targetId: runId,
    targetName: caseCode(runId),
    summary: "Case released back to the queue",
  });

  revalidatePath("/counter-intel");
  revalidatePath(`/counter-intel/${runId}`);
  return { ok: true };
}

// Flag a case for attention. Any desk member may toggle this — unlike
// caseStatus it carries no closing authority, so it needs no L-R5 gate.
// Independent of caseStatus: a case can be IN_PROGRESS and flagged at once.
export async function toggleCaseFlagAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRaisa();
  if (!user) return { ok: false, error: "NOT AUTHORIZED." };

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { ok: false, error: "MISSING CASE ID." };

  const run = await db.hackRun.findUnique({
    where: { id: runId },
    select: { id: true, flagged: true },
  });
  if (!run) return { ok: false, error: "CASE NOT FOUND." };

  const flagged = !run.flagged;
  await db.hackRun.update({ where: { id: runId }, data: { flagged } });

  await logAudit({
    action: AUDIT_ACTIONS.hackCaseFlagToggled,
    actor: user,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: flagged ? "Case flagged" : "Case unflagged",
  });

  revalidatePath("/counter-intel");
  revalidatePath(`/counter-intel/${run.id}`);
  return { ok: true };
}

// Early, manual purge of a single case file — the L-R5 recordkeeper
// designation only. Desk membership (the department gate every other action
// here uses) is not enough on its own; see canDeleteCounterIntelLog().
export async function deleteHackRunAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canDeleteCounterIntelLog(user)) return { ok: false, error: "NOT AUTHORIZED." };

  const runId = String(formData.get("runId") ?? "");
  if (!runId) return { ok: false, error: "MISSING CASE ID." };

  const run = await db.hackRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "CASE NOT FOUND." };

  await logAudit({
    action: AUDIT_ACTIONS.hackRunDeleted,
    actor: user,
    targetType: "hack_run",
    targetId: run.id,
    targetName: caseCode(run.id),
    summary: "Case file deleted by L-R5",
  });

  await db.$transaction([
    db.hackChallenge.deleteMany({ where: { runId } }),
    db.hackDuel.deleteMany({ where: { runId } }),
    db.hackGrant.deleteMany({ where: { runId } }),
    db.hackRun.delete({ where: { id: runId } }),
  ]);

  revalidatePath("/counter-intel");
  redirect("/counter-intel");
}

// Multi-select purge of several case files at once, from the desk's list
// view. Same L-R5 gate as deleteHackRunAction; a bad or already-gone id in
// the batch is simply excluded rather than failing the whole submission —
// same shape as bulkMemberAction in admin/actions.ts.
export async function deleteHackRunsAction(
  _prevState: { ok: boolean; error?: string; message?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const user = await requireUser();
  if (!canDeleteCounterIntelLog(user)) return { ok: false, error: "NOT AUTHORIZED." };

  const runIds = [
    ...new Set(
      formData
        .getAll("runIds")
        .map((v) => String(v))
        .filter(Boolean)
    ),
  ];
  if (runIds.length === 0) return { ok: false, error: "NO CASES SELECTED." };

  const runs = await db.hackRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true },
  });
  if (runs.length === 0) return { ok: false, error: "NONE OF THOSE CASES EXIST." };

  // One audit entry per case, same as the single-delete verb, so a bulk
  // purge is no less traceable than deleting rows one at a time.
  for (const run of runs) {
    await logAudit({
      action: AUDIT_ACTIONS.hackRunDeleted,
      actor: user,
      targetType: "hack_run",
      targetId: run.id,
      targetName: caseCode(run.id),
      summary: "Case file deleted by L-R5 (bulk)",
    });
  }

  const ids = runs.map((r) => r.id);
  await db.$transaction([
    db.hackChallenge.deleteMany({ where: { runId: { in: ids } } }),
    db.hackDuel.deleteMany({ where: { runId: { in: ids } } }),
    db.hackGrant.deleteMany({ where: { runId: { in: ids } } }),
    db.hackRun.deleteMany({ where: { id: { in: ids } } }),
  ]);

  revalidatePath("/counter-intel");
  return { ok: true, message: `${ids.length} CASE FILE(S) DELETED.` };
}

// Nuke every case file on the desk, regardless of trace state. Same L-R5
// gate as the other two delete verbs. Logged as a single summary entry
// rather than one per row — a wipe is one deliberate act, not N of them,
// and by the time it runs the individual case codes are gone anyway.
// useActionState requires this exact (prevState, formData) signature; the
// verb itself takes no payload, hence the disable below.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function wipeAllHackRunsAction(
  _prevState: { ok: boolean; error?: string; message?: string } | null,
  _formData: FormData
): Promise<{ ok: boolean; error?: string; message?: string }> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const user = await requireUser();
  if (!canDeleteCounterIntelLog(user)) return { ok: false, error: "NOT AUTHORIZED." };

  const count = await db.hackRun.count();
  if (count === 0) return { ok: true, message: "NOTHING TO WIPE." };

  await db.$transaction([
    db.hackChallenge.deleteMany({}),
    db.hackDuel.deleteMany({}),
    db.hackGrant.deleteMany({}),
    db.hackRun.deleteMany({}),
  ]);

  await logAudit({
    action: AUDIT_ACTIONS.hackRunDeleted,
    actor: user,
    targetType: "hack_run",
    summary: `ALL case files wiped by L-R5 (${count} deleted)`,
  });

  revalidatePath("/counter-intel");
  return { ok: true, message: `${count} CASE FILE(S) WIPED.` };
}
