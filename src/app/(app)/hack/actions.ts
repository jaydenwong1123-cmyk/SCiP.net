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
  checkIntrusionAnswer,
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

export type HackActionState =
  | { ok: true; kind: "challenge"; challenge: PublicChallenge; feedback?: string }
  | { ok: true; kind: "checkpoint" }
  | { ok: true; kind: "failed"; reason: string }
  | { ok: true; kind: "extracted" }
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

// Preview an answer's feedback without spending an attempt or advancing
// anything. Throttled identically to a real submission — otherwise CHECK
// would be a free, unlimited oracle for brute-forcing the guess-carrying
// games (icebreaker's letters-correct count above all).
export async function checkHackAnswerAction(
  _prevState: { ok: boolean; feedback?: string; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; feedback?: string; error?: string }> {
  const user = await requireUser();

  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

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
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  const outcome = await checkIntrusionAnswer(user.id, nonce, answer);
  if (!outcome.ok) {
    return { ok: false, error: "STALE CHALLENGE — RESYNCHRONIZING." };
  }
  return { ok: true, feedback: outcome.feedback };
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
  if (!nonce) return { ok: false, error: "MISSING CHALLENGE HANDLE." };

  return duelActionState(await submitDuelAnswer(user.id, nonce, answer));
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
