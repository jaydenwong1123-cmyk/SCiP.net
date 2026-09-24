import type { CouncilShift } from "@prisma/client";
import { db } from "@/lib/db";
import type { AdjustResult } from "@/lib/engine/points";
import { isDivision, type DivisionKey } from "./divisions";
import { adjustPoints } from "./points";
import { formatDuration, shiftPoints } from "./shift-points";

// THE SHIFT TIMER.
//
// A shift is a row with a start time. Nothing counts while it runs: this bot
// only exists for the length of one interaction, so the time on shift is
// worked out from the timestamps every time it is shown —
//
//   (end or now) − start − finished breaks − the break in progress
//                + whatever HR has added or taken away
//
// Ending a shift freezes that number, converts it to points
// (./shift-points.ts), and pays them into the division the shift was worked in.

const activeKey = (guildId: string, discordId: string) => `${guildId}:${discordId}`;

const secondsBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / 1000);

/** Time on shift so far, before HR's adjustment. */
function workedSeconds(shift: CouncilShift, now: Date): number {
  const end = shift.endedAt ?? now;
  const onBreak = shift.pausedAt ? secondsBetween(shift.pausedAt, end) : 0;
  return secondsBetween(shift.startedAt, end) - shift.breakSeconds - onBreak;
}

/** The shift's length as it stands. */
export function shiftSeconds(shift: CouncilShift, now = new Date()): number {
  if (shift.durationSeconds !== null) return shift.durationSeconds;
  return Math.max(0, workedSeconds(shift, now) + shift.adjustSeconds);
}

export async function getActiveShift(guildId: string, discordId: string) {
  return db.councilShift.findUnique({
    where: { activeKey: activeKey(guildId, discordId) },
  });
}

export async function activeShifts(guildId: string) {
  return db.councilShift.findMany({
    where: { guildId, endedAt: null },
    orderBy: { startedAt: "asc" },
  });
}

export type ShiftTotals = {
  count: number;
  totalSeconds: number;
  averageSeconds: number;
  points: number;
};

/** Finished shifts only: a live one has no length yet. */
export async function shiftTotals(guildId: string, discordId: string): Promise<ShiftTotals> {
  const agg = await db.councilShift.aggregate({
    where: { guildId, discordId, endedAt: { not: null } },
    _count: { _all: true },
    _sum: { durationSeconds: true, pointsAwarded: true },
  });
  const count = agg._count._all;
  const totalSeconds = agg._sum.durationSeconds ?? 0;
  return {
    count,
    totalSeconds,
    averageSeconds: count ? Math.round(totalSeconds / count) : 0,
    points: agg._sum.pointsAwarded ?? 0,
  };
}

export type ShiftOutcome<T = CouncilShift> =
  | { ok: true; shift: T }
  | { ok: false; message: string };

export async function startShift(
  guildId: string,
  discordId: string,
  username: string,
  division: DivisionKey
): Promise<ShiftOutcome> {
  try {
    const shift = await db.councilShift.create({
      data: {
        guildId,
        discordId,
        username,
        division,
        activeKey: activeKey(guildId, discordId),
      },
    });
    return { ok: true, shift };
  } catch (err) {
    // The unique activeKey: a shift is already running.
    if ((err as { code?: string }).code === "P2002") {
      return { ok: false, message: "Already on shift." };
    }
    throw err;
  }
}

/** Go on break, or come back from one. */
export async function togglePause(
  guildId: string,
  discordId: string
): Promise<ShiftOutcome> {
  const shift = await getActiveShift(guildId, discordId);
  if (!shift) return { ok: false, message: "Not on shift." };
  const now = new Date();
  const updated = await db.councilShift.update({
    where: { id: shift.id },
    data: shift.pausedAt
      ? {
          pausedAt: null,
          breakSeconds: shift.breakSeconds + secondsBetween(shift.pausedAt, now),
        }
      : { pausedAt: now },
  });
  return { ok: true, shift: updated };
}

/** Add time to a live shift (HR). Negative minutes take it away. */
export async function addShiftTime(
  guildId: string,
  discordId: string,
  minutes: number
): Promise<ShiftOutcome> {
  const shift = await getActiveShift(guildId, discordId);
  if (!shift) return { ok: false, message: "They are not on shift." };
  const updated = await db.councilShift.update({
    where: { id: shift.id },
    data: { adjustSeconds: { increment: minutes * 60 } },
  });
  return { ok: true, shift: updated };
}

/** Make a live shift read exactly `minutes` (HR). It keeps running from there. */
export async function setShiftTime(
  guildId: string,
  discordId: string,
  minutes: number
): Promise<ShiftOutcome> {
  const shift = await getActiveShift(guildId, discordId);
  if (!shift) return { ok: false, message: "They are not on shift." };
  const updated = await db.councilShift.update({
    where: { id: shift.id },
    data: { adjustSeconds: minutes * 60 - workedSeconds(shift, new Date()) },
  });
  return { ok: true, shift: updated };
}

/** Throw a live shift away without paying for it (HR). */
export async function deleteShift(
  guildId: string,
  discordId: string
): Promise<ShiftOutcome> {
  const shift = await getActiveShift(guildId, discordId);
  if (!shift) return { ok: false, message: "They are not on shift." };
  await db.councilShift.delete({ where: { id: shift.id } });
  return { ok: true, shift };
}

export type EndedShift = {
  shift: CouncilShift;
  seconds: number;
  points: number;
  division: DivisionKey | null;
  /** The balance change, when any points were paid. */
  paid: AdjustResult | null;
  reason: string;
};

export async function endShift(
  guildId: string,
  discordId: string,
  actorId: string
): Promise<ShiftOutcome<EndedShift>> {
  const shift = await getActiveShift(guildId, discordId);
  if (!shift) return { ok: false, message: "Not on shift." };

  const now = new Date();
  const seconds = shiftSeconds(shift, now);
  const points = shiftPoints(seconds / 60);

  // Claim the shift before paying for it: clearing activeKey only succeeds
  // once, so a double-pressed End cannot pay out twice.
  const claimed = await db.councilShift.updateMany({
    where: { id: shift.id, activeKey: { not: null } },
    data: {
      activeKey: null,
      endedAt: now,
      pausedAt: null,
      durationSeconds: seconds,
      pointsAwarded: points,
      endedById: actorId,
      ...(shift.pausedAt
        ? { breakSeconds: shift.breakSeconds + secondsBetween(shift.pausedAt, now) }
        : {}),
    },
  });
  if (claimed.count === 0) return { ok: false, message: "That shift has already ended." };

  const division = isDivision(shift.division) ? shift.division : null;
  const reason = `Shift: ${formatDuration(seconds)}`;
  const paid =
    points > 0 && division
      ? await adjustPoints({
          guildId,
          discordId,
          division,
          username: shift.username,
          actorId,
          reason,
          delta: points,
        })
      : null;

  return {
    ok: true,
    shift: {
      shift: { ...shift, endedAt: now, durationSeconds: seconds },
      seconds,
      points,
      division,
      paid,
      reason,
    },
  };
}
