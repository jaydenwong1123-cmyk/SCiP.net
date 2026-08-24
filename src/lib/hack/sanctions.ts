import { db } from "@/lib/db";
import { formatDuration } from "@/lib/hack/config";

// The escalation ladder for terminal misconduct.
//
// BEFORE THIS EXISTED, a conduct flag produced a log entry and nothing else:
// lib/hack/conduct.ts would mark the run, /admin/conduct would show the
// evidence, and there the matter ended. This is the acting-on half.
//
// WHO ISSUES THESE, AND WHY IT IS NOT RAISA. The desk at /counter-intel can
// uncover a name through the trace ladder; it cannot punish one. That split is
// argued at the head of lib/counter-intel.ts — the people deciding whose
// anonymity gets stripped must not also be the people deciding what happens to
// them afterwards. Sanctions are therefore an Admin action taken from
// /admin/conduct, which is where the name-keyed evidence already lives.
//
// VISIBILITY IS THE POINT. The conduct flag is deliberately silent: telling a
// member their solve pattern looked automated would just teach them to pace
// themselves. A sanction is the opposite — it is announced on /hack, in full,
// with its reason and its expiry, because an unannounced punishment cannot be
// appealed and this ladder is explicitly appealable (TICKET_TYPES.conductAppeal).

export const SANCTION_LEVELS = {
  // On file and shown to the member. No effect on access whatsoever — this
  // rung exists so that a first offence can be answered with a word rather
  // than a lockout.
  warning: "warning",
  // The intrusion cooldown is multiplied for the duration.
  restricted: "restricted",
  // No run may be started at all for the duration.
  blacklisted: "blacklisted",
} as const;

export type SanctionLevel =
  (typeof SANCTION_LEVELS)[keyof typeof SANCTION_LEVELS];

export const SANCTION_ORDER: SanctionLevel[] = [
  SANCTION_LEVELS.warning,
  SANCTION_LEVELS.restricted,
  SANCTION_LEVELS.blacklisted,
];

export const SANCTION_LABELS: Record<SanctionLevel, string> = {
  [SANCTION_LEVELS.warning]: "FORMAL WARNING",
  [SANCTION_LEVELS.restricted]: "TERMINAL RESTRICTED",
  [SANCTION_LEVELS.blacklisted]: "TERMINAL BLACKLISTED",
};

export const SANCTION_BLURBS: Record<SanctionLevel, string> = {
  [SANCTION_LEVELS.warning]:
    "Recorded on the member's file and shown to them. Access is not affected.",
  [SANCTION_LEVELS.restricted]:
    "Intrusion cooldown is multiplied while this holds. Runs are still permitted.",
  [SANCTION_LEVELS.blacklisted]:
    "No intrusion may be started while this holds. The strongest step available.",
};

export function isSanctionLevel(value: string): value is SanctionLevel {
  return (SANCTION_ORDER as string[]).includes(value);
}

// How much longer a RESTRICTED member waits between runs. Four times the
// normal 24h is punitive without being a ban — which is the entire point of
// having a rung between "a word" and "a lockout".
export const RESTRICTED_COOLDOWN_MULTIPLIER = 4;

// Bounds on the duration an Admin may set, in whole days. The floor stops a
// sanction being issued as a no-op; the ceiling stops an indefinite ban being
// issued by accident in a field that takes a number.
export const MIN_SANCTION_DAYS = 1;
export const MAX_SANCTION_DAYS = 90;

export type ActiveSanction = {
  id: string;
  level: SanctionLevel;
  reason: string;
  // null = indefinite.
  expiresAt: Date | null;
  createdAt: Date;
};

/**
 * The member's most severe sanction currently in force, or null.
 *
 * Expiry is evaluated at query time and never by a job, exactly as
 * HackGrant and ScpAccessGrant are — this deployment has no cron, so anything
 * job-based would silently never fire. A lapsed row simply stops matching.
 *
 * Ordered by severity rather than recency: holding a warning and a blacklist at
 * once must resolve to the blacklist, and `level` sorts the wrong way
 * alphabetically ("blacklisted" < "restricted" < "warning"), so the comparison
 * is done in application code against SANCTION_ORDER instead of in SQL.
 */
export async function activeSanction(
  userId: string
): Promise<ActiveSanction | null> {
  const now = new Date();
  const rows = await db.hackSanction.findMany({
    where: {
      userId,
      liftedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      level: true,
      reason: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  let worst: ActiveSanction | null = null;
  for (const row of rows) {
    if (!isSanctionLevel(row.level)) continue;
    const candidate: ActiveSanction = { ...row, level: row.level };
    if (
      !worst ||
      SANCTION_ORDER.indexOf(candidate.level) >
        SANCTION_ORDER.indexOf(worst.level)
    ) {
      worst = candidate;
    }
  }
  return worst;
}

/** Does this sanction stop a run from being started outright? */
export function blocksRuns(sanction: ActiveSanction | null): boolean {
  return sanction?.level === SANCTION_LEVELS.blacklisted;
}

/** Cooldown multiplier implied by a sanction. 1 when it does not lengthen it. */
export function cooldownMultiplier(sanction: ActiveSanction | null): number {
  return sanction?.level === SANCTION_LEVELS.restricted
    ? RESTRICTED_COOLDOWN_MULTIPLIER
    : 1;
}

/**
 * The refusal text shown to a blacklisted member.
 *
 * Says what happened, why, and for how long — all three, because this notice
 * is the only thing standing between the member and an appeal they cannot
 * write. Contrast the deliberately uninformative "stale" string in
 * lib/hack/engine.ts: that one is hiding a mechanism from an attacker, this
 * one is explaining a decision to its subject.
 */
export function sanctionRefusal(sanction: ActiveSanction): string {
  const until = sanction.expiresAt
    ? ` LIFTS IN ${formatDuration(sanction.expiresAt.getTime() - Date.now())}.`
    : " NO EXPIRY SET.";
  const reason = sanction.reason ? ` REASON: ${sanction.reason}` : "";
  return `TERMINAL BLACKLISTED BY ADMINISTRATION.${reason}${until} FILE A CONDUCT REVIEW APPEAL VIA IT SUPPORT TO CONTEST THIS.`;
}

/**
 * The next rung up from whatever the member currently holds.
 *
 * Used to preselect the escalation in the admin form, so the ladder is walked
 * rather than jumped by default. Returns "warning" for a member with a clean
 * record and stays at "blacklisted" once there — there is nothing above it.
 */
export function nextLevel(current: ActiveSanction | null): SanctionLevel {
  if (!current) return SANCTION_LEVELS.warning;
  const i = SANCTION_ORDER.indexOf(current.level);
  return SANCTION_ORDER[Math.min(i + 1, SANCTION_ORDER.length - 1)]!;
}

/** Full sanction history for one member, newest first. */
export async function sanctionHistory(userId: string, take = 20) {
  return db.hackSanction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      issuedBy: { select: { displayName: true, email: true } },
    },
  });
}
