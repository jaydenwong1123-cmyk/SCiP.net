import { db } from "@/lib/db";

// The points economy.
//
// `EngineMember.points` is the balance and the only column the leaderboard
// reads; `EnginePointEntry` is the history. Keeping a running balance rather
// than summing the ledger is what lets the top-15 query be a single indexed
// ORDER BY instead of an aggregate over every award ever made.

export type Adjustment = {
  guildId: string;
  discordId: string;
  /** Cached for the leaderboard; refreshed on every adjustment. */
  username: string;
  /** Discord id of the staff member responsible, or "system". */
  actorId: string;
  reason: string;
};

export type AdjustResult = {
  before: number;
  after: number;
  delta: number;
  /** True when the requested removal was larger than the balance. */
  clamped: boolean;
};

/** Points can never go below zero: a negative balance has no meaning on a
 *  ladder whose rungs are all thresholds, and "you owe the Foundation four
 *  points" is not a state anyone wants to explain in a promotion review. */
export function clampDelta(current: number, delta: number): number {
  // Expressed as "the move that lands on the clamped total" rather than as a
  // conditional returning -current, which produces negative zero when the
  // balance is already 0 — harmless arithmetically, but it shows up in the
  // ledger as "-0" and in a test as a failure.
  return Math.max(0, current + delta) - current;
}

async function ensureMember(
  guildId: string,
  discordId: string,
  username: string
) {
  return db.engineMember.upsert({
    where: { guildId_discordId: { guildId, discordId } },
    create: { guildId, discordId, username },
    update: username ? { username } : {},
  });
}

/**
 * Move a member's balance by `delta` and record why.
 *
 * The write uses `increment` rather than writing a total computed in JS, so two
 * staff awarding points in the same second cannot lose one another's change.
 * Prisma returns the row as it stands after the update, which is what goes into
 * the ledger — so the recorded balance is the real one, not a guess.
 */
export async function adjustPoints(
  input: Adjustment & { delta: number }
): Promise<AdjustResult> {
  const { guildId, discordId, username, actorId, reason, delta } = input;

  const existing = await ensureMember(guildId, discordId, username);
  const applied = clampDelta(existing.points, delta);

  const updated =
    applied === 0
      ? existing
      : await db.engineMember.update({
          where: { guildId_discordId: { guildId, discordId } },
          data: { points: { increment: applied } },
        });

  // A concurrent removal could still land the total below zero between the read
  // and the increment. Rare, cheap to correct, and corrected here rather than
  // left for someone to notice on the leaderboard.
  const after =
    updated.points < 0
      ? (
          await db.engineMember.update({
            where: { guildId_discordId: { guildId, discordId } },
            data: { points: 0 },
          })
        ).points
      : updated.points;

  await db.enginePointEntry.create({
    data: {
      guildId,
      discordId,
      delta: applied,
      balance: after,
      reason,
      actorId,
    },
  });

  return {
    before: existing.points,
    after,
    delta: applied,
    clamped: applied !== delta,
  };
}

/** Overwrite a balance outright. Recorded in the ledger as the delta it worked
 *  out to, so history still reads as a continuous line. */
export async function setPoints(
  input: Adjustment & { total: number }
): Promise<AdjustResult> {
  const { guildId, discordId, username, actorId, reason, total } = input;
  const target = Math.max(0, total);

  const existing = await ensureMember(guildId, discordId, username);
  const updated = await db.engineMember.update({
    where: { guildId_discordId: { guildId, discordId } },
    data: { points: target },
  });

  await db.enginePointEntry.create({
    data: {
      guildId,
      discordId,
      delta: target - existing.points,
      balance: updated.points,
      reason,
      actorId,
    },
  });

  return {
    before: existing.points,
    after: updated.points,
    delta: target - existing.points,
    clamped: target !== total,
  };
}

export async function getMember(guildId: string, discordId: string) {
  return db.engineMember.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
  });
}

/** Top `limit` members by points. Ties break on who reached the total first,
 *  so a leaderboard does not reshuffle itself between two equal members. */
export async function leaderboard(guildId: string, limit = 15) {
  return db.engineMember.findMany({
    where: { guildId, points: { gt: 0 } },
    orderBy: [{ points: "desc" }, { updatedAt: "asc" }],
    take: limit,
  });
}

/**
 * 1-based leaderboard position, or null for a member with no points.
 *
 * Counted rather than read from a stored column: the position of one member
 * changes every time anybody else is awarded points, so storing it would mean
 * rewriting the whole table on every award.
 */
export async function rankPosition(
  guildId: string,
  discordId: string
): Promise<number | null> {
  const me = await getMember(guildId, discordId);
  if (!me || me.points <= 0) return null;
  const ahead = await db.engineMember.count({
    where: { guildId, points: { gt: me.points } },
  });
  return ahead + 1;
}

export async function pointHistory(
  guildId: string,
  discordId: string,
  limit = 10
) {
  return db.enginePointEntry.findMany({
    where: { guildId, discordId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
