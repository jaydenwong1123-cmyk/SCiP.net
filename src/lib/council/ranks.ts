import { db } from "@/lib/db";
import { positionOf, type LadderPosition, type Rung } from "@/lib/engine/ranks";
import {
  DIVISION_KEYS,
  DIVISIONS,
  type DivisionKey,
} from "./divisions";

// THE LADDERS — one per division.
//
// Each ladder works exactly like The Engine's (rungs sorted by cost, one step
// at a time, see lib/engine/ranks.ts, whose positionOf is reused as-is). The
// one addition is the feed-in: past the top of a subdivision's ladder, the
// next step is the lowest rung of the division it feeds into.

export type CouncilRung = Rung & {
  division: DivisionKey;
  /** LR | MR | HR, or "" — display grouping only. */
  band: string;
};

export type Ladders = Record<DivisionKey, CouncilRung[]>;

export type CouncilPosition = LadderPosition<CouncilRung> & {
  /** The division `next` belongs to. Differs from the member's own only for a
   *  feed-in promotion. Null when there is no next step. */
  toDivision: DivisionKey | null;
};

/**
 * Where a member stands in their division, and what they may ask for next.
 *
 * Pure, so the feed-in rule can be tested without a database.
 */
export function nextStep(
  ladders: Ladders,
  division: DivisionKey,
  points: number,
  currentRoleId: string | null
): CouncilPosition {
  const here = positionOf(ladders[division], points, currentRoleId);
  if (here.next) return { ...here, toDivision: division };

  // At the top of this ladder (or it is empty). Only a subdivision whose
  // member actually holds its top rung carries on upward — an unranked member
  // of an empty ladder has not earned a place in the parent.
  const parent = DIVISIONS[division].feedsInto;
  if (!parent || !here.current) return { ...here, toDivision: null };

  const above = positionOf(ladders[parent], points, null);
  if (!above.next) return { ...here, toDivision: null };

  return {
    current: here.current,
    next: above.next,
    eligible: above.eligible,
    shortfall: above.shortfall,
    toDivision: parent,
  };
}

type RankRow = {
  id: string;
  division: string;
  roleId: string;
  label: string;
  points: number;
  band: string;
  requiresApplication: boolean;
  applicationUrl: string;
};

const toRung = (r: RankRow): CouncilRung => ({
  id: r.id,
  division: r.division as DivisionKey,
  roleId: r.roleId,
  label: r.label,
  points: r.points,
  band: r.band,
  requiresApplication: r.requiresApplication,
  applicationUrl: r.applicationUrl,
});

/** Every division's ladder, in climbing order. One query for all five. */
export async function getLadders(guildId: string): Promise<Ladders> {
  const ladders = Object.fromEntries(
    DIVISION_KEYS.map((key) => [key, [] as CouncilRung[]])
  ) as Ladders;
  const rows = await db.councilRank.findMany({
    where: { guildId },
    orderBy: { points: "asc" },
  });
  for (const row of rows) {
    if (row.division in ladders) {
      ladders[row.division as DivisionKey].push(toRung(row));
    }
  }
  return ladders;
}

export async function findRung(
  guildId: string,
  roleId: string
): Promise<CouncilRung | null> {
  const row = await db.councilRank.findUnique({
    where: { guildId_roleId: { guildId, roleId } },
  });
  return row ? toRung(row) : null;
}

/**
 * Add a rung, or reprice/rename/move one that already exists for this role.
 * Returns the division it was in before, when it has moved between ladders.
 *
 * As in The Engine, the application settings are only touched when passed.
 */
export async function upsertRung(input: {
  guildId: string;
  division: DivisionKey;
  roleId: string;
  label: string;
  points: number;
  band?: string;
  applicationUrl?: string;
}): Promise<{ rung: CouncilRung; movedFrom: DivisionKey | null }> {
  const { guildId, division, roleId, label } = input;
  const points = Math.max(0, input.points);
  const before = await findRung(guildId, roleId);

  const extra = {
    ...(input.band === undefined ? {} : { band: input.band }),
    ...(input.applicationUrl === undefined
      ? {}
      : {
          applicationUrl: input.applicationUrl,
          requiresApplication: input.applicationUrl !== "",
        }),
  };
  const row = await db.councilRank.upsert({
    where: { guildId_roleId: { guildId, roleId } },
    create: { guildId, division, roleId, label, points, ...extra },
    update: { division, label, points, ...extra },
  });

  return {
    rung: toRung(row),
    movedFrom: before && before.division !== division ? before.division : null,
  };
}

export async function removeRung(
  guildId: string,
  roleId: string
): Promise<CouncilRung | null> {
  const existing = await findRung(guildId, roleId);
  if (!existing) return null;
  await db.councilRank.delete({ where: { id: existing.id } });
  return existing;
}
