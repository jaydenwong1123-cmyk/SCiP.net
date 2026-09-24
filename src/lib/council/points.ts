import { db } from "@/lib/db";
import { clampDelta, type AdjustResult } from "@/lib/engine/points";
import type { DivisionKey } from "./divisions";

// The points economy, per division.
//
// Same rules as lib/engine/points.ts — balances never go below zero, every
// change is written to the ledger with the balance it produced — but the
// balance lives on CouncilStanding, one row per member per division, so a
// member's Clerical points and their Operational points never mix.

export type Adjustment = {
  guildId: string;
  discordId: string;
  division: DivisionKey;
  username: string;
  actorId: string;
  reason: string;
};

const key = (guildId: string, discordId: string, division: DivisionKey) => ({
  guildId_discordId_division: { guildId, discordId, division },
});

export async function ensureStanding(
  guildId: string,
  discordId: string,
  division: DivisionKey,
  username = ""
) {
  return db.councilStanding.upsert({
    where: key(guildId, discordId, division),
    create: { guildId, discordId, division, username },
    update: username ? { username } : {},
  });
}

export async function getStanding(
  guildId: string,
  discordId: string,
  division: DivisionKey
) {
  return db.councilStanding.findUnique({
    where: key(guildId, discordId, division),
  });
}

export async function standingsOf(guildId: string, discordId: string) {
  return db.councilStanding.findMany({
    where: { guildId, discordId },
    orderBy: { updatedAt: "desc" },
  });
}

async function record(
  input: Adjustment,
  delta: number,
  balance: number
): Promise<void> {
  await db.councilPointEntry.create({
    data: {
      guildId: input.guildId,
      discordId: input.discordId,
      division: input.division,
      delta,
      balance,
      reason: input.reason,
      actorId: input.actorId,
    },
  });
}

export async function adjustPoints(
  input: Adjustment & { delta: number }
): Promise<AdjustResult> {
  const { guildId, discordId, division, username, delta } = input;
  const existing = await ensureStanding(guildId, discordId, division, username);
  const applied = clampDelta(existing.points, delta);

  const updated =
    applied === 0
      ? existing
      : await db.councilStanding.update({
          where: key(guildId, discordId, division),
          data: { points: { increment: applied } },
        });

  // A concurrent removal can still land below zero; correct it here.
  const after =
    updated.points < 0
      ? (
          await db.councilStanding.update({
            where: key(guildId, discordId, division),
            data: { points: 0 },
          })
        ).points
      : updated.points;

  await record(input, applied, after);
  return {
    before: existing.points,
    after,
    delta: applied,
    clamped: applied !== delta,
  };
}

export async function setPoints(
  input: Adjustment & { total: number }
): Promise<AdjustResult> {
  const { guildId, discordId, division, username, total } = input;
  const target = Math.max(0, total);
  const existing = await ensureStanding(guildId, discordId, division, username);
  const updated = await db.councilStanding.update({
    where: key(guildId, discordId, division),
    data: { points: target },
  });
  await record(input, target - existing.points, updated.points);
  return {
    before: existing.points,
    after: updated.points,
    delta: target - existing.points,
    clamped: target !== total,
  };
}

/** Top members of one division by points; ties go to whoever got there first. */
export async function leaderboard(
  guildId: string,
  division: DivisionKey,
  limit = 15
) {
  return db.councilStanding.findMany({
    where: { guildId, division, points: { gt: 0 } },
    orderBy: [{ points: "desc" }, { updatedAt: "asc" }],
    take: limit,
  });
}

export async function rankPosition(
  guildId: string,
  discordId: string,
  division: DivisionKey
): Promise<number | null> {
  const me = await getStanding(guildId, discordId, division);
  if (!me || me.points <= 0) return null;
  const ahead = await db.councilStanding.count({
    where: { guildId, division, points: { gt: me.points } },
  });
  return ahead + 1;
}

export async function pointHistory(
  guildId: string,
  discordId: string,
  division: DivisionKey,
  limit = 10
) {
  return db.councilPointEntry.findMany({
    where: { guildId, discordId, division },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
