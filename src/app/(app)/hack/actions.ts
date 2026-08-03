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
import { hackCooldownState, issueGrant } from "@/lib/hack/grant";

export type HackActionState =
  | { ok: true; kind: "challenge"; challenge: PublicChallenge; feedback?: string }
  | { ok: true; kind: "checkpoint" }
  | { ok: true; kind: "failed"; reason: string }
  | { ok: true; kind: "extracted" }
  | { ok: false; error: string; resync?: boolean };

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
    const challenge = await getOrIssueChallenge(existing);
    return { ok: true, kind: "challenge", challenge: publicChallenge(challenge) };
  }

  const cooldown = await hackCooldownState(user.id, hasStaffPowers(user));
  if (cooldown.blocked) {
    return {
      ok: false,
      error: `TRACE COOLDOWN ACTIVE — RETRY IN ${formatDuration(cooldown.retryAfterMs)}.`,
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
  const throttle = await checkRateLimit("hack", user.id, HACK_RULE);
  if (throttle.blocked) {
    return {
      ok: false,
      error: `TERMINAL LOCKED — RETRY IN ${formatDuration(throttle.retryAfterMs)}.`,
    };
  }
  await recordAttempt("hack", user.id);

  const nonce = String(formData.get("nonce") ?? "");
  const answer = String(formData.get("answer") ?? "").slice(0, 400);
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  const outcome = await submitIntrusionAnswer(user.id, nonce, answer);

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
  }
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
  if (run.clearedStages < 1) {
    return { ok: false, error: "NOTHING BANKED — NO TIER REACHED." };
  }

  const { tier, expiresAt } = await issueGrant(run);
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
  return { ok: true, kind: "extracted" };
}

// Decline the checkpoint and take on the next stage.
export async function pushDeeperAction(): Promise<HackActionState> {
  const user = await requireUser();
  const run = await resolveStaleRuns(user.id);

  if (!run || run.status !== RUN_STATUS.active || !run.atCheckpoint) {
    return { ok: false, error: "NO ACTIVE EXTRACTION POINT.", resync: true };
  }
  if (run.stage >= MAX_STAGE) {
    return { ok: false, error: "NO DEEPER LAYER EXISTS." };
  }

  const advanced = await pushDeeper(run);
  const challenge = await getOrIssueChallenge(advanced);
  return { ok: true, kind: "challenge", challenge: publicChallenge(challenge) };
}

// Walk away mid-round. Counts as a failure, and carries the failure cooldown:
// disconnecting to dodge a puzzle must not be cheaper than losing to it.
export async function abortHackRunAction(): Promise<HackActionState> {
  const user = await requireUser();
  const run = await resolveStaleRuns(user.id);
  if (!run || run.status !== RUN_STATUS.active) {
    return { ok: false, error: "NO ACTIVE INTRUSION.", resync: true };
  }

  await failRun(run, "OPERATOR DISCONNECTED");
  await logHackFailure("OPERATOR DISCONNECTED");
  revalidatePath("/hack");
  return { ok: true, kind: "failed", reason: "OPERATOR DISCONNECTED" };
}
