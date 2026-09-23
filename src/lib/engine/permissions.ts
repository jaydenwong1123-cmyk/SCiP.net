import { ADMINISTRATOR, type InteractionMember } from "@/lib/discord/types";
import type { EngineConfig } from "./config";

// WHO MAY DO WHAT.
//
// Four configurable tiers, each inheriting everything below it:
//
//   OWNER         — edits the rank ladder and the bot's settings
//   HIGH COMMAND  — posts announcements
//   HIGH RANK     — approves and denies promotion requests
//   STAFF         — awards and removes points
//   MEMBER        — checks their own points, sees the leaderboard, asks to be
//                    promoted
//
// Inheritance is the point: Owner should not need the staff role pinned on as
// well just to award a point. A tier whose role is unconfigured is simply
// unreachable through roles — it does not silently fall open.

export const Tier = {
  None: 0,
  Member: 1,
  Staff: 2,
  HighRank: 3,
  HighCommand: 4,
  Owner: 5,
} as const;

export type TierValue = (typeof Tier)[keyof typeof Tier];

export const TIER_LABEL: Record<TierValue, string> = {
  [Tier.None]: "not authorised",
  [Tier.Member]: "Member",
  [Tier.Staff]: "Staff",
  [Tier.HighRank]: "High Rank",
  [Tier.HighCommand]: "High Command",
  [Tier.Owner]: "Owner",
};

/**
 * Does this member hold Discord's Administrator bit (or are they the guild
 * owner)?
 *
 * This is the bootstrap hatch and it exists for one reason: immediately after
 * the bot joins, NO roles are configured, so a purely role-driven check would
 * refuse `/engine setup` and leave the bot permanently unusable. Server admins
 * can already give themselves any role by hand, so this grants nothing they
 * could not take.
 */
export function isGuildAdmin(
  member: InteractionMember | undefined,
  guildOwnerId?: string
): boolean {
  if (!member) return false;
  if (guildOwnerId && member.user?.id === guildOwnerId) return true;
  if (!member.permissions) return false;
  try {
    return (BigInt(member.permissions) & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

/** The highest tier this member qualifies for. */
export function tierOf(
  member: InteractionMember | undefined,
  config: EngineConfig
): TierValue {
  if (!member) return Tier.None;
  if (isGuildAdmin(member)) return Tier.Owner;

  const roles = new Set(member.roles ?? []);
  const has = (id: string) => id !== "" && roles.has(id);

  if (has(config.ownerRoleId)) return Tier.Owner;
  if (has(config.highCommandRoleId)) return Tier.HighCommand;
  if (has(config.highRankRoleId)) return Tier.HighRank;
  if (has(config.staffRoleId)) return Tier.Staff;

  // The base tier. An unset memberRoleId means "everyone in the server", which
  // is the sane default for a brand-new install; set it to lock the everyday
  // commands to verified personnel.
  if (config.memberRoleId === "" || has(config.memberRoleId)) return Tier.Member;

  return Tier.None;
}

export function hasTier(
  member: InteractionMember | undefined,
  config: EngineConfig,
  required: TierValue
): boolean {
  return tierOf(member, config) >= required;
}

/**
 * The sentence shown when someone is refused.
 *
 * `action` names what they were actually trying to do, because one tier guards
 * several different things — being told "you cannot review promotions" after
 * trying to post an announcement is confusing enough to look like a bug. The
 * per-tier defaults cover the commonest case for each.
 *
 * Never names the missing role by id: an ephemeral refusal should be readable,
 * not a permissions dump.
 */
export function refusalFor(required: TierValue, action?: string): string {
  const what: Record<TierValue, string> = {
    [Tier.None]: "use this bot",
    [Tier.Member]: "use this bot",
    [Tier.Staff]: "adjust points",
    [Tier.HighRank]: "review promotions",
    [Tier.HighCommand]: "post announcements",
    [Tier.Owner]: "change The Engine's configuration",
  };
  return `You do not have clearance to ${action ?? what[required]}. This is limited to ${TIER_LABEL[required]}.`;
}
