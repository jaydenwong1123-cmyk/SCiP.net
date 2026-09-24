import { db } from "@/lib/db";
import { rest, type DivisionConfigs } from "./config";
import { divisionLabel, isDivision, type DivisionKey } from "./divisions";
import { ensureStanding } from "./points";
import { cancelPending } from "./promotions";

// DIVISION MEMBERSHIP.
//
// A member is in at most one division at a time. Their standing in every
// division they have served in is kept (CouncilStanding), so a transfer does
// not destroy anything: leaving strips that division's roles, and coming back
// re-grants the rank they left with and restores their points there.

export async function currentDivision(
  guildId: string,
  discordId: string
): Promise<DivisionKey | null> {
  const member = await db.councilMember.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
  });
  return member?.division && isDivision(member.division) ? member.division : null;
}

/** Strip the division role and rank role a member wears for `division`. */
async function leave(
  divisions: DivisionConfigs,
  guildId: string,
  discordId: string,
  division: DivisionKey
): Promise<void> {
  const standing = await db.councilStanding.findUnique({
    where: { guildId_discordId_division: { guildId, discordId, division } },
  });
  if (standing?.rankRoleId) {
    await rest.removeRole(guildId, discordId, standing.rankRoleId);
  }
  if (divisions[division].divisionRoleId) {
    await rest.removeRole(guildId, discordId, divisions[division].divisionRoleId);
  }
  await cancelPending(
    guildId,
    discordId,
    `Withdrawn: left ${divisionLabel(division)}.`
  );
}

export type MoveOutcome = { ok: boolean; message: string };

export async function assignDivision(
  divisions: DivisionConfigs,
  guildId: string,
  discordId: string,
  username: string,
  division: DivisionKey
): Promise<MoveOutcome> {
  const previous = await currentDivision(guildId, discordId);
  if (previous === division) {
    return { ok: false, message: `They are already in ${divisionLabel(division)}.` };
  }

  // Roles first: if the bot cannot hand out the new division's role, nothing
  // has moved yet and the member keeps what they had.
  const problems: string[] = [];
  const divisionRole = divisions[division].divisionRoleId;
  if (divisionRole) {
    const granted = await rest.addRole(guildId, discordId, divisionRole);
    if (!granted.ok) {
      return { ok: false, message: granted.error ?? "The role change failed." };
    }
  }

  if (previous) await leave(divisions, guildId, discordId, previous);

  const standing = await ensureStanding(guildId, discordId, division, username);
  if (standing.rankRoleId) {
    const back = await rest.addRole(guildId, discordId, standing.rankRoleId);
    if (!back.ok) problems.push(`their old rank role could not be restored (${back.error})`);
  }

  await db.councilMember.upsert({
    where: { guildId_discordId: { guildId, discordId } },
    create: { guildId, discordId, username, division },
    update: { division, ...(username ? { username } : {}) },
  });

  const from = previous ? ` from ${divisionLabel(previous)}` : "";
  const restored =
    standing.points > 0 || standing.rankRoleId
      ? ` Their previous standing there was restored: **${standing.points}** points.`
      : "";
  const warn = problems.length ? `\n-# Note: ${problems.join("; ")}.` : "";
  return {
    ok: true,
    message: `Moved into **${divisionLabel(division)}**${from}.${restored}${warn}`,
  };
}

export async function removeFromDivision(
  divisions: DivisionConfigs,
  guildId: string,
  discordId: string
): Promise<MoveOutcome> {
  const previous = await currentDivision(guildId, discordId);
  if (!previous) return { ok: false, message: "They are not in a division." };
  await leave(divisions, guildId, discordId, previous);
  await db.councilMember.update({
    where: { guildId_discordId: { guildId, discordId } },
    data: { division: null },
  });
  return {
    ok: true,
    message: `Removed from **${divisionLabel(previous)}**. Their points there are kept in case they return.`,
  };
}
