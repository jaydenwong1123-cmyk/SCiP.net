import type { GuildRole } from "./types";

// THE ANTI-NUKE RULES, shared by both bots.
//
// Neither bot holds a gateway connection, so neither can watch the server and
// undo what a person does to it by hand. What they can guarantee is that they
// are never the tool a nuke is done WITH. Both bots hold Manage Roles, and a
// bot with Manage Roles can hand any role below its own to anyone, including a
// role carrying Administrator. So:
//
//   1. Neither bot hands out a role that carries a server-wrecking permission,
//      whoever asks and however the role got onto a ladder (roleGrantProblem,
//      checked on every grant in rest.ts).
//   2. Neither bot runs while it holds one itself, because a leaked token is
//      only as dangerous as the bot's own role (botPermissionProblem).
//   3. Each answers only fresh requests (isFreshTimestamp), and only from its
//      own server (lib/discord/guard.ts).
//
// Everything here is pure, so the rules are tested without Discord.

const bit = (n: number) => BigInt(1) << BigInt(n);

const ADMINISTRATOR = bit(3);
const MANAGE_ROLES = bit(28);

/**
 * Permissions that let one account wreck the server: delete channels or roles,
 * remove or silence members, mass-delete messages, ping everyone, or hand the
 * same powers on. Named as Discord's Server Settings names them, since that is
 * where someone goes to turn them off.
 */
export const DANGEROUS_PERMISSIONS: readonly (readonly [bigint, string])[] = [
  [ADMINISTRATOR, "Administrator"],
  [bit(5), "Manage Server"],
  [MANAGE_ROLES, "Manage Roles"],
  [bit(4), "Manage Channels"],
  [bit(29), "Manage Webhooks"],
  [bit(2), "Ban Members"],
  [bit(1), "Kick Members"],
  [bit(40), "Timeout Members"],
  [bit(13), "Manage Messages"],
  [bit(34), "Manage Threads and Posts"],
  [bit(17), "Mention @everyone, @here and All Roles"],
  [bit(30), "Manage Expressions"],
];

function parseBits(bitfield: string | undefined | null): bigint | null {
  if (!bitfield || !/^\d+$/.test(bitfield)) return null;
  return BigInt(bitfield);
}

/**
 * The dangerous permissions in a bitfield, by name. Administrator stands
 * alone: it implies every other one, and listing the rest beside it would bury
 * the one that matters.
 */
export function dangerousPermissions(bitfield: string | undefined | null): string[] {
  const bits = parseBits(bitfield);
  if (bits === null) return [];
  if ((bits & ADMINISTRATOR) === ADMINISTRATOR) return ["Administrator"];
  return DANGEROUS_PERMISSIONS.filter(([b]) => (bits & b) === b).map(([, name]) => name);
}

/** "A", "A and B", "A, B and C". */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Why the bot must not hand out this role, or null when it may.
 *
 * Fails closed: a role whose permissions cannot be read is refused, since the
 * one thing this check exists to stop is exactly what an unreadable bitfield
 * could be hiding.
 */
export function roleGrantProblem(role: GuildRole, guildId: string): string | null {
  if (role.id === guildId) return "@everyone is not a role that can be handed out.";
  if (role.managed) {
    return `**${role.name}** belongs to a bot or integration, so Discord manages it and it cannot be handed out.`;
  }
  if (parseBits(role.permissions) === null) {
    return `The permissions on **${role.name}** could not be read, so it was not handed out.`;
  }
  const danger = dangerousPermissions(role.permissions);
  if (danger.length === 0) return null;
  return `**${role.name}** has ${listOf(danger)}. The bot never hands out a role with server-control permissions, so it cannot be used to take over the server. Turn those off on the role in Server Settings → Roles, or give it out by hand.`;
}

/**
 * Why the bot should refuse to run with the permissions it holds, or null.
 *
 * The bot needs Manage Roles and nothing else from the dangerous list. Holding
 * more does nothing for it, and turns a leaked token into a nuke, so the bot
 * stops working until the extra permissions are taken away. Absent (an old
 * payload) reads as fine: this is a nudge towards a safe setup, and refusing
 * on missing data would take the bot down for no reason.
 */
export function botPermissionProblem(
  appPermissions: string | undefined,
  botName: string
): string | null {
  const extra = dangerousPermissions(appPermissions).filter((p) => p !== "Manage Roles");
  if (extra.length === 0) return null;
  return `${botName} is switched off because its role has ${listOf(extra)}. A bot holding those can wreck the server if its token ever leaks, and ${botName} needs none of them. In Server Settings → Roles → ${botName}, turn them off. It only needs Manage Roles, View Channels, Send Messages and Embed Links. If they are already off there, check this channel's permission overrides.`;
}

export type RoleAudit = {
  /** The role Discord made for the bot, or null if it could not be found. */
  botRole: GuildRole | null;
  /** Dangerous permissions every member has through @everyone. */
  everyone: string[];
  /**
   * Roles below the bot's own that carry dangerous permissions. Discord lets
   * the bot hand out anything below it, so these are what someone holding a
   * leaked token could give themselves. The role guard stops the bot's own
   * commands doing it, but not a stolen token.
   */
  exposed: { role: GuildRole; permissions: string[] }[];
};

export function auditRoles(
  roles: GuildRole[],
  guildId: string,
  applicationId: string
): RoleAudit {
  const botRole = roles.find((r) => r.tags?.bot_id === applicationId) ?? null;
  const everyoneRole = roles.find((r) => r.id === guildId);
  const below = botRole?.position ?? 0;

  const exposed = roles
    .filter((r) => r.id !== guildId && !r.managed && (r.position ?? 0) < below)
    .map((role) => ({ role, permissions: dangerousPermissions(role.permissions) }))
    .filter((r) => r.permissions.length > 0)
    .sort((a, b) => (b.role.position ?? 0) - (a.role.position ?? 0));

  return {
    botRole,
    everyone: dangerousPermissions(everyoneRole?.permissions),
    exposed,
  };
}

/**
 * Was this request signed recently?
 *
 * The signature covers the timestamp, so it cannot be forged, but a captured
 * request could otherwise be replayed forever. Five minutes either way is far
 * more than Discord's delivery needs and far less than a replay would.
 */
export function isFreshTimestamp(
  timestamp: string | null,
  nowMs: number,
  windowSeconds = 300
): boolean {
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= windowSeconds;
}

// --- the throttle -----------------------------------------------------------

export const THROTTLE_WINDOW_MINUTES = 10;

/**
 * How many of each destructive action one person may take in the window
 * before the bot locks itself. Set well above what a busy HR shift does, and
 * well below what it takes to strip a division or wipe a leaderboard.
 * Server administrators are never counted.
 */
export const THROTTLES = {
  roles: { limit: 10, label: "division moves" },
  points: { limit: 15, label: "point removals, resets and shift deletions" },
  announce: { limit: 5, label: "announcements" },
} as const;

export type ThrottleKind = keyof typeof THROTTLES;

/** Has this person gone past the limit, counting the action just taken? */
export function overLimit(kind: ThrottleKind, countInWindow: number): boolean {
  return countInWindow > THROTTLES[kind].limit;
}
