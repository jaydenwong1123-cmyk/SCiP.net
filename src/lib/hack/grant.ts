import { db } from "@/lib/db";
import { HACK_MAX_TIER } from "@/lib/clearance";
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

// Bank the tier a run reached. Returns the issued grant.
export async function issueGrant(run: {
  id: string;
  userId: string;
  clearedStages: number;
}): Promise<{ tier: number; expiresAt: Date }> {
  const tier = Math.min(tierForStage(run.clearedStages), HACK_MAX_TIER);
  const expiresAt = new Date(Date.now() + grantMsForStage(run.clearedStages));

  await db.hackGrant.create({
    data: { runId: run.id, userId: run.userId, tier, expiresAt },
  });

  return { tier, expiresAt };
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
};

// Read from the last run's startedAt, never from a cookie or from the client.
export async function hackCooldownState(
  userId: string,
  bypass: boolean
): Promise<CooldownState> {
  if (bypass) {
    return { blocked: false, retryAfterMs: 0, penalty: false, bypassed: true };
  }

  const last = await db.hackRun.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, status: true },
  });
  if (!last) {
    return { blocked: false, retryAfterMs: 0, penalty: false, bypassed: false };
  }

  const penalty = last.status === RUN_STATUS.failed;
  const window = penalty ? FAILED_COOLDOWN_MS : COOLDOWN_MS;
  const readyAt = last.startedAt.getTime() + window;
  const retryAfterMs = Math.max(0, readyAt - Date.now());

  return {
    blocked: retryAfterMs > 0,
    retryAfterMs,
    penalty,
    bypassed: false,
  };
}
