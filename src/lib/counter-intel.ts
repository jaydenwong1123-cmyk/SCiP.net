import type { HackRun } from "@prisma/client";
import { db } from "@/lib/db";
import { REVEAL_MAX, RUN_STATUS } from "@/lib/hack/config";
import { clearanceLabel, R5_DESIGNATION } from "@/lib/clearance";

// RAISA's counter-intrusion desk.
//
// Access is the DEPARTMENT STRING and nothing else — not the L-R5 designation,
// not clearance rank, not staff powers. This is deliberate and differs from
// canAccessMessageLogs(), which admits staff: an intrusion case file names a
// member who has done something they will be disciplined for, and the people
// who hold the discipline power are exactly the people who should not also be
// the ones deciding whose name gets uncovered.
//
// The department sits in RESTRICTED_DEPARTMENTS (lib/departments.ts), so only
// staff may assign it — a member cannot walk into this section by editing
// their own profile.
export const RAISA_DEPARTMENT =
  "Recordkeeping & Information Security Administration";

export function canAccessCounterIntel(user: {
  department?: string | null;
}): boolean {
  return user.department === RAISA_DEPARTMENT;
}

// Deleting a case file is a step further than reading one: it also requires
// the L-R5 recordkeeper designation specifically, not just desk membership.
// Staff powers do not substitute here, same as everywhere else in this file.
export function canDeleteCounterIntelLog(user: {
  department?: string | null;
  designation?: string | null;
}): boolean {
  return canAccessCounterIntel(user) && user.designation === R5_DESIGNATION;
}

// Closing a case is a step further than working it: any desk member may pick
// a case up (IN_PROGRESS) or flag it (NEEDS_ACTION), but only the L-R5
// recordkeeper designation may mark it RESOLVED — same gate as deleting a
// case file, for the same reason: closing the book on a case is a
// recordkeeping decision, not an investigative one.
export function canResolveCounterIntelCase(user: {
  department?: string | null;
  designation?: string | null;
}): boolean {
  return canDeleteCounterIntelLog(user);
}

export { REVEAL_MAX };

// RAISA's manual investigative workflow tag. Independent of both the
// intrusion's own status and the auto-derived technical resolution below —
// this one tracks what the desk has done, not what the intrusion did.
// Every new case starts at NEEDS_ACTION (see the default on HackRun.caseStatus)
// — there is no separate "unseen" state, NEEDS_ACTION already means that.
export const CASE_STATUSES = {
  needsAction: "NEEDS_ACTION",
  inProgress: "IN_PROGRESS",
  resolved: "RESOLVED",
} as const;

export type CaseStatus = (typeof CASE_STATUSES)[keyof typeof CASE_STATUSES];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  [CASE_STATUSES.needsAction]: "NEEDS ACTION",
  [CASE_STATUSES.inProgress]: "IN PROGRESS",
  [CASE_STATUSES.resolved]: "RESOLVED",
};

export function isCaseStatus(value: string): value is CaseStatus {
  return (Object.values(CASE_STATUSES) as string[]).includes(value);
}

// Case files are purged 30 days after the intrusion attempt started, whether
// or not it was ever traced. Enforced lazily rather than by a cron (this
// deployment has none — see MESSAGE_LOG_RETENTION_DAYS in lib/message-logs.ts
// for the same reasoning) by sweeping expired rows on every visit to the desk.
export const COUNTER_INTEL_RETENTION_DAYS = 30;

export function counterIntelRetentionCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - COUNTER_INTEL_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

// Physically deletes case files older than the retention window, along with
// their challenges and any grant — HackChallenge/HackGrant carry no cascade,
// so the children must go first. Safe to call on every desk visit: a run with
// nothing past the cutoff is a no-op query.
export async function purgeExpiredCounterIntelLogs(): Promise<void> {
  const cutoff = counterIntelRetentionCutoff();
  const stale = await db.hackRun.findMany({
    where: { startedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return;
  const ids = stale.map((r) => r.id);
  await db.$transaction([
    db.hackChallenge.deleteMany({ where: { runId: { in: ids } } }),
    db.hackGrant.deleteMany({ where: { runId: { in: ids } } }),
    db.hackRun.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

// What each completed trace uncovers, in order.
export const REVEAL_LABELS = [
  "SIGNAL METADATA — TIMESTAMP, DEPTH REACHED, TIER GRANTED",
  "TERMINAL SIGNATURE — ORIGIN ADDRESS AND CLIENT",
  "ORGANISATIONAL VECTOR — DEPARTMENT AND CLEARANCE OF ORIGIN",
  "PERSONNEL IDENTITY — FULL DOSSIER LINK",
] as const;

// Case designation shown in place of the intruder's name.
//
// Derived from the RUN id, never the user id: two runs by the same member must
// not share a code, or the anonymity is defeated by collation alone.
export function caseCode(runId: string): string {
  return `INTRUSION-${runId.slice(-6).toUpperCase()}`;
}

// The desk's resolution log classifies every case into exactly one bucket,
// independent of trace progress — RAISA can tell whether a case still needs
// action (a live illicit grant) without ever identifying who holds it.
export const CASE_RESOLUTIONS = {
  active: "ACTIVE_INTRUSION",
  repelled: "REPELLED",
  accessLive: "ACCESS_LIVE",
  accessExpired: "ACCESS_EXPIRED",
  accessRevoked: "ACCESS_REVOKED",
} as const;

export type CaseResolution = (typeof CASE_RESOLUTIONS)[keyof typeof CASE_RESOLUTIONS];

export const CASE_RESOLUTION_LABELS: Record<CaseResolution, string> = {
  [CASE_RESOLUTIONS.active]: "INTRUSION IN PROGRESS",
  [CASE_RESOLUTIONS.repelled]: "REPELLED — NO ACCESS GAINED",
  [CASE_RESOLUTIONS.accessLive]: "ACCESS LIVE — REVOKE PENDING",
  [CASE_RESOLUTIONS.accessExpired]: "ACCESS EXPIRED — NO ACTION NEEDED",
  [CASE_RESOLUTIONS.accessRevoked]: "ACCESS REVOKED",
};

export function caseResolution(
  run: {
    status: string;
    grant: { expiresAtMs: number; revoked: boolean } | null;
  },
  now = Date.now()
): CaseResolution {
  if (run.status === RUN_STATUS.active) return CASE_RESOLUTIONS.active;
  if (run.status !== RUN_STATUS.extracted || !run.grant) {
    return CASE_RESOLUTIONS.repelled;
  }
  if (run.grant.revoked) return CASE_RESOLUTIONS.accessRevoked;
  if (run.grant.expiresAtMs <= now) return CASE_RESOLUTIONS.accessExpired;
  return CASE_RESOLUTIONS.accessLive;
}

export type AnonymisedRun = {
  id: string;
  code: string;
  revealLevel: number;
  status: string;
  resolution: CaseResolution;
  caseStatus: CaseStatus;
  flagged: boolean;
  // Which RAISA officer's trace last advanced this case. Not gated by
  // revealLevel — this names one of RAISA's own, not the intruder, so the
  // anonymity boundary the rest of this projection enforces doesn't apply.
  tracedByName: string | null;
  traceLockedUntilMs: number | null;
  // Reveal 1.
  startedAtLabel: string | null;
  depthReached: number | null;
  tierLabel: string | null;
  // Reveal 2.
  ip: string | null;
  terminal: string | null;
  // Reveal 3.
  department: string | null;
  clearanceLabelAtBreach: string | null;
  // Reveal 4.
  userId: string | null;
  displayName: string | null;
  // Grant state, shown from reveal 1 so RAISA knows whether it is still live.
  grant: { id: string; tier: number; expiresAtMs: number; revoked: boolean } | null;
};

type RunWithExtras = HackRun & {
  user?: { id: string; displayName: string | null; email: string } | null;
  traceBy?: { id: string; displayName: string | null; email: string } | null;
  grant?: {
    id: string;
    tier: number;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null;
};

// Field-by-field projection, gated on revealLevel.
//
// THIS IS A SECURITY BOUNDARY, not a display helper. Gating must happen here
// and not as conditional JSX over a hydrated row: React would serialize the
// whole row into the RSC payload and the un-revealed values would ship to the
// browser regardless of what rendered. Same rule renderRedacted() follows in
// lib/redact.tsx — never emit the hidden content.
//
// Consequently the page MUST pass only this function's output into JSX, and
// must not hand a raw run (or an `include: { user: true }` result) any further.
export function anonymiseRun(run: RunWithExtras): AnonymisedRun {
  const level = Math.max(0, Math.min(run.revealLevel, REVEAL_MAX));

  const grant = run.grant
    ? {
        id: run.grant.id,
        tier: run.grant.tier,
        expiresAtMs: run.grant.expiresAt.getTime(),
        revoked: run.grant.revokedAt !== null,
      }
    : null;

  return {
    id: run.id,
    code: caseCode(run.id),
    revealLevel: level,
    status: run.status,
    resolution: caseResolution({ status: run.status, grant }),
    // isCaseStatus() should always hold — the DB column only ever gets a
    // value through setCaseStatusAction(), which validates it — but a
    // corrupt or pre-migration row falls back to NEEDS_ACTION rather than
    // crashing the page.
    caseStatus: isCaseStatus(run.caseStatus)
      ? run.caseStatus
      : CASE_STATUSES.needsAction,
    flagged: run.flagged,
    tracedByName: run.traceById
      ? (run.traceBy?.displayName ?? run.traceBy?.email ?? "UNKNOWN")
      : null,
    traceLockedUntilMs: run.traceLockedUntil
      ? run.traceLockedUntil.getTime()
      : null,

    startedAtLabel:
      level >= 1
        ? run.startedAt.toISOString().slice(0, 16).replace("T", " ")
        : null,
    depthReached: level >= 1 ? run.clearedStages : null,
    tierLabel: level >= 1 && grant ? clearanceLabel(grant.tier) : null,

    ip: level >= 2 ? run.ip || "UNRECORDED" : null,
    terminal: level >= 2 ? run.terminal || "UNRECORDED" : null,

    department: level >= 3 ? run.actorDepartment || "UNASSIGNED" : null,
    clearanceLabelAtBreach: level >= 3 ? clearanceLabel(run.actorClearance) : null,

    userId: level >= REVEAL_MAX ? run.userId : null,
    displayName:
      level >= REVEAL_MAX
        ? (run.user?.displayName ?? run.user?.email ?? "UNKNOWN")
        : null,

    grant: level >= 1 ? grant : null,
  };
}
