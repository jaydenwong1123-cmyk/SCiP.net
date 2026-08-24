import { db } from "@/lib/db";
import { HACK_MAX_TIER } from "@/lib/clearance";
import { awardTools, toolsEarnedFor, type ToolKind } from "@/lib/hack/tools";
import {
  COOLDOWN_MS,
  FAILED_COOLDOWN_MS,
  RUN_STATUS,
  grantMsForStage,
  tierForStage,
} from "./config";

// The illicit clearance a completed intrusion bought, and the cooldown that
// governs when another may be attempted.
//
// Expiry is evaluated at query time and never by a job — this deployment has
// no cron, so anything job-based would silently never fire. The same rule
// governs ScpAccessGrant, broadcast scheduling and message retention; see the
// comment on lib/message-logs.ts.

export type ActiveHackGrant = {
  id: string;
  tier: number;
  expiresAt: Date;
  runId: string;
};

// The live grant for a member, or null.
//
// Called from getCurrentUser on every request, so it is deliberately a single
// narrow indexed lookup ([userId, expiresAt]) selecting four columns. Callers
// there short-circuit it entirely for anyone already at HACK_MAX_TIER.
export async function getActiveHackGrant(
  userId: string
): Promise<ActiveHackGrant | null> {
  const grant = await db.hackGrant.findFirst({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { tier: "desc" },
    select: { id: true, tier: true, expiresAt: true, runId: true },
  });
  return grant;
}

// Bank the tier a run reached. Returns the issued grant, plus any toolkit
// countermeasures the depth paid out.
//
// Tools are awarded HERE rather than at each call site because all three ways a
// run can end successfully — a clean EXTRACT, a dead man's switch firing, and
// winning a counter-intrusion duel — funnel through this function. Paying out
// in one place is what keeps the three from drifting apart.
export async function issueGrant(run: {
  id: string;
  userId: string;
  clearedStages: number;
}): Promise<{ tier: number; expiresAt: Date; tools: ToolKind[] }> {
  const tier = Math.min(tierForStage(run.clearedStages), HACK_MAX_TIER);
  const expiresAt = new Date(Date.now() + grantMsForStage(run.clearedStages));

  await db.hackGrant.create({
    data: { runId: run.id, userId: run.userId, tier, expiresAt },
  });

  const tools = await awardTools({
    userId: run.userId,
    runId: run.id,
    count: toolsEarnedFor(run.clearedStages),
  });

  return { tier, expiresAt, tools };
}

// RAISA revocation. Never deletes — the row is the record that the access was
// issued and then taken back.
export async function revokeGrant(
  grantId: string,
  revokedById: string
): Promise<void> {
  await db.hackGrant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: new Date(), revokedById },
  });
}

export type CooldownState = {
  blocked: boolean;
  // Milliseconds until another run may be started. 0 when not blocked.
  retryAfterMs: number;
  // True when the wait is the doubled penalty for a failed run.
  penalty: boolean;
  // Staff and above ignore the cooldown entirely.
  bypassed: boolean;
  // True when a RESTRICTED sanction is lengthening the wait, so the console can
  // say so rather than leaving the member to wonder why it grew.
  restricted: boolean;
};

// Read from the last run's startedAt, never from a cookie or from the client.
//
// `multiplier` carries a RESTRICTED sanction (see lib/hack/sanctions.ts). It is
// passed in rather than looked up here so this stays a pure function of the run
// history plus its inputs, and so the caller makes exactly one sanction query
// per request instead of this making a second one.
export async function hackCooldownState(
  userId: string,
  bypass: boolean,
  multiplier = 1
): Promise<CooldownState> {
  if (bypass) {
    return {
      blocked: false,
      retryAfterMs: 0,
      penalty: false,
      bypassed: true,
      restricted: false,
    };
  }

  const last = await db.hackRun.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, status: true },
  });
  if (!last) {
    return {
      blocked: false,
      retryAfterMs: 0,
      penalty: false,
      bypassed: false,
      restricted: false,
    };
  }

  const penalty = last.status === RUN_STATUS.failed;
  const base = penalty ? FAILED_COOLDOWN_MS : COOLDOWN_MS;
  // The sanction multiplies whichever window already applied, so a restricted
  // member who also failed their last run serves both — they compound rather
  // than one replacing the other.
  const window = base * Math.max(1, multiplier);
  const readyAt = last.startedAt.getTime() + window;
  const retryAfterMs = Math.max(0, readyAt - Date.now());

  return {
    blocked: retryAfterMs > 0,
    retryAfterMs,
    penalty,
    bypassed: false,
    restricted: multiplier > 1,
  };
}
