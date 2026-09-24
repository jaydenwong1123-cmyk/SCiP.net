import type { InteractionMember } from "@/lib/discord/types";
import { isGuildAdmin } from "@/lib/engine/permissions";
import type { CouncilConfig, DivisionConfigs } from "./config";
import { DIVISION_KEYS, DIVISIONS, type DivisionKey } from "./divisions";

// WHO MAY DO WHAT.
//
// Unlike The Engine's single stack of tiers, authority here is per division:
//
//   HANDS OF THE O5         — everything, including the bot's configuration
//   SCARLET REPRESENTATIVE  — reviews, assigns and awards points in every
//                             division, and posts announcements
//   DIVISION HR (reviewer)  — reviews, assigns and awards points in their own
//                             division; Judicial HR also covers Enforcers and
//                             Legislators
//   DIVISION STAFF          — awards points in their own division only
//   MEMBER                  — checks points, the leaderboard, requests promotion
//
// Server administrators always count as Hands, so the bot cannot be locked out
// of its own setup. A role left unconfigured grants nothing.

const holds = (member: InteractionMember | undefined, roleId: string) =>
  roleId !== "" && (member?.roles ?? []).includes(roleId);

export function isHands(
  member: InteractionMember | undefined,
  config: CouncilConfig
): boolean {
  return isGuildAdmin(member) || holds(member, config.handsRoleId);
}

export function isScarlet(
  member: InteractionMember | undefined,
  config: CouncilConfig
): boolean {
  return isHands(member, config) || holds(member, config.scarletRoleId);
}

/** May approve and deny this division's promotions, and assign members to it. */
export function canReview(
  member: InteractionMember | undefined,
  config: CouncilConfig,
  divisions: DivisionConfigs,
  division: DivisionKey
): boolean {
  if (isScarlet(member, config)) return true;
  const parent = DIVISIONS[division].parent;
  return (
    holds(member, divisions[division].reviewerRoleId) ||
    holds(member, divisions[parent].reviewerRoleId)
  );
}

/** May add, remove and set points for members of this division. */
export function canAward(
  member: InteractionMember | undefined,
  config: CouncilConfig,
  divisions: DivisionConfigs,
  division: DivisionKey
): boolean {
  if (canReview(member, config, divisions, division)) return true;
  const parent = DIVISIONS[division].parent;
  return (
    holds(member, divisions[division].staffRoleId) ||
    holds(member, divisions[parent].staffRoleId)
  );
}

/** The divisions whose requests this member may review. */
export function reviewableDivisions(
  member: InteractionMember | undefined,
  config: CouncilConfig,
  divisions: DivisionConfigs
): DivisionKey[] {
  return DIVISION_KEYS.filter((key) =>
    canReview(member, config, divisions, key)
  );
}

/**
 * The base gate for everything the bot does.
 *
 * An unset member role means everyone in the server. When it is set, anyone
 * holding a role the bot itself recognises still gets through — a division HR
 * should not be locked out for lacking the generic member role.
 */
export function isMember(
  member: InteractionMember | undefined,
  config: CouncilConfig,
  divisions: DivisionConfigs
): boolean {
  if (!member) return false;
  if (config.memberRoleId === "" || holds(member, config.memberRoleId)) {
    return true;
  }
  if (isScarlet(member, config)) return true;
  return DIVISION_KEYS.some((key) => {
    const d = divisions[key];
    return (
      holds(member, d.reviewerRoleId) ||
      holds(member, d.staffRoleId) ||
      holds(member, d.divisionRoleId)
    );
  });
}
