"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import { clearanceLabel } from "@/lib/clearance";
import {
  canAccessCounterIntel,
  caseCode,
  REVEAL_MAX,
} from "@/lib/counter-intel";
import {
  CHALLENGE_KINDS,
  DEADLINE_GRACE_MS,
  TRACE_LOCKOUT_MS,
  formatDuration,
} from "@/lib/hack/config";
import {
  getOrIssueChallenge,
  publicChallenge,
  type PublicChallenge,
} from "@/lib/hack/engine";
import { gradeAnswer } from "@/lib/hack/games";
import { revokeGrant } from "@/lib/hack/grant";

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
  if (run.traceLockedUntil && run.traceLockedUntil.getTime() > Date.now()) {
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

  await db.hackChallenge.update({
    where: { id: challenge.id },
    data: { correct: result.correct, answeredAt: new Date() },
  });

  if (!result.correct) {
    // A failed trace never REGRESSES the reveal level — RAISA does not lose
    // ground they already covered. It costs them a backoff instead, so the
    // ladder cannot be brute-forced by resubmitting garbage.
    await db.hackRun.update({
      where: { id: run.id },
      data: {
        traceCursor: run.traceCursor + 1,
        traceLockedUntil: new Date(Date.now() + TRACE_LOCKOUT_MS),
      },
    });
    revalidatePath(`/counter-intel/${run.id}`);
    return {
      ok: true,
      kind: "locked",
      reason: `${result.feedback ?? "TRACE LOST"} — BACKOFF ${formatDuration(
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
