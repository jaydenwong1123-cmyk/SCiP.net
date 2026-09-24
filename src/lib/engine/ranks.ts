import { db } from "@/lib/db";

// THE RANK LADDER.
//
// A rung is a Discord role plus the points it costs. The ladder is those rungs
// sorted by cost ascending — there is no separate ordering column, so repricing
// a rank is one edit and the ladder can never disagree with itself.
//
// Promotion is one rung at a time, deliberately. A member sitting on 900 points
// with no rank is eligible for the FIRST rung, not the top one: the ladder is a
// record of progression through the roleplay, and skipping it wholesale would
// make the approval step meaningless.

export type Rung = {
  id: string;
  roleId: string;
  label: string;
  points: number;
  /** Needs an application as well as the points. */
  requiresApplication: boolean;
  /** Link to the application form; "" when there is none. */
  applicationUrl: string;
};

export type LadderPosition<R extends Rung = Rung> = {
  /** The rung the member currently holds, or null if unranked. */
  current: R | null;
  /** The rung immediately above, or null if they are at the top. */
  next: R | null;
  /** Do they have the points for `next`? False when `next` is null. */
  eligible: boolean;
  /** Points still needed for `next`; 0 when eligible or at the top. */
  shortfall: number;
};

/** Sort a ladder into climbing order. */
export function sortLadder<R extends Rung>(rungs: R[]): R[] {
  return [...rungs].sort((a, b) => a.points - b.points);
}

/**
 * Where a member stands.
 *
 * `currentRoleId` is the role THE BOT last granted (EngineMember.rankRoleId),
 * not whatever rank-shaped roles they happen to wear. A role handed out by a
 * human before the bot existed reads as unranked, and their first approved
 * request puts them on the bottom rung — which is recoverable with one
 * `/points set` and one manual role change, unlike the alternative of the bot
 * guessing at someone's rank from a role list it did not write.
 */
export function positionOf<R extends Rung>(
  rungs: R[],
  points: number,
  currentRoleId: string | null
): LadderPosition<R> {
  const ladder = sortLadder(rungs);
  const index = currentRoleId
    ? ladder.findIndex((r) => r.roleId === currentRoleId)
    : -1;

  const current = index >= 0 ? ladder[index] : null;
  const next = ladder[index + 1] ?? null;

  if (!next) return { current, next: null, eligible: false, shortfall: 0 };

  const eligible = points >= next.points;
  return {
    current,
    next,
    eligible,
    shortfall: eligible ? 0 : next.points - points,
  };
}

export async function getLadder(guildId: string): Promise<Rung[]> {
  const rows = await db.engineRank.findMany({
    where: { guildId },
    orderBy: { points: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    roleId: r.roleId,
    label: r.label,
    points: r.points,
    requiresApplication: r.requiresApplication,
    applicationUrl: r.applicationUrl,
  }));
}

/**
 * Add a rung, or reprice/rename one that already exists for this role.
 *
 * The application settings are only touched when passed, so repricing a rank
 * with a plain `/engine rank add role points` does not quietly switch its
 * application off.
 */
export async function upsertRung(
  guildId: string,
  roleId: string,
  label: string,
  points: number,
  /** A form link to require an application, "" to stop requiring one,
   *  undefined to leave it as it is. */
  applicationUrl?: string
) {
  const extra =
    applicationUrl === undefined
      ? {}
      : { applicationUrl, requiresApplication: applicationUrl !== "" };
  return db.engineRank.upsert({
    where: { guildId_roleId: { guildId, roleId } },
    create: { guildId, roleId, label, points: Math.max(0, points), ...extra },
    update: { label, points: Math.max(0, points), ...extra },
  });
}

export async function removeRung(guildId: string, roleId: string) {
  const existing = await db.engineRank.findUnique({
    where: { guildId_roleId: { guildId, roleId } },
  });
  if (!existing) return null;
  await db.engineRank.delete({ where: { id: existing.id } });
  return existing;
}
