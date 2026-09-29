import { db } from "@/lib/db";
import { isGuildAdmin } from "@/lib/engine/permissions";
import type { DiscordRest } from "./rest";
import {
  THROTTLES,
  THROTTLE_WINDOW_MINUTES,
  auditRoles,
  botPermissionProblem,
  dangerousPermissions,
  listOf,
  overLimit,
  type ThrottleKind,
} from "./security";
import {
  COLOR,
  actorOf,
  type Embed,
  type Interaction,
  type MessagePayload,
} from "./types";

// THE ANTI-NUKE GATE, shared by both bots.
//
// lib/discord/security.ts holds the rules; this applies them to live
// interactions, which needs the database and Discord. Each bot describes
// itself with a SecurityProfile and gets the same protection:
//
//   - it answers only its own server, and never while it holds dangerous
//     permissions itself (securityGate);
//   - anyone at its top tiers can freeze it with /security lockdown, and only
//     a server administrator can lift that (handleSecurity);
//   - one person taking too many destructive actions in a few minutes locks
//     it automatically (throttle);
//   - all of the above, and every settings change, is reported to its
//     security channel (securityAlert).
//
// Server administrators are exempt from the lockdown and the throttle. They
// can already do anything to the server by hand, so holding them back gains
// nothing, and they are who has to repair things while the bot is frozen.

export type LockState = {
  lockedAt: Date | null;
  /** Discord id, or "system" when the throttle locked it. */
  lockedById: string;
  lockReason: string;
};

/** The slice of a bot's settings the gate reads. Both bots' configs have it. */
export type SecurityConfig = LockState & {
  guildId: string;
  securityChannelId: string;
};

export type SecurityProfile = {
  bot: "engine" | "council";
  /** How messages refer to the bot: "The Engine". */
  name: string;
  /** The environment variable naming the one server this bot serves. */
  guildEnv: string;
  /** The command that sets the security channel. */
  setupCommand: string;
  /** Who may engage a lockdown and read /security status, for refusals. */
  engageLabel: string;
  /** The throttles this bot applies, for /security status. */
  throttles: ThrottleKind[];
  rest: DiscordRest;
  panel: (
    heading: string,
    body?: string,
    rest?: Omit<Embed, "title" | "description" | "author">
  ) => Embed;
  saveLock: (state: LockState) => Promise<unknown>;
};

/** Does an interaction only look things up, or change something? */
export type Access = "read" | "write";

const mention = (id: string) => `<@${id}>`;

const since = (config: LockState) =>
  config.lockedAt ? ` since <t:${Math.floor(config.lockedAt.getTime() / 1000)}:R>` : "";

/**
 * The checks every interaction passes before its handler runs. Returns the
 * sentence to refuse with, or null to carry on.
 *
 * The home server is the one named in the environment, or failing that the
 * one the bot's setup was first run in. A bot invited anywhere else answers
 * nothing there, so nobody can rewrite its settings from a server they own.
 */
export function securityGate(
  profile: SecurityProfile,
  interaction: Interaction,
  config: SecurityConfig,
  access: Access
): string | null {
  const home = process.env[profile.guildEnv] || config.guildId;
  if (home && interaction.guild_id !== home) {
    return `${profile.name} only works in its own server.`;
  }

  const unsafe = botPermissionProblem(interaction.app_permissions, profile.name);
  if (unsafe) return unsafe;

  if (access === "read" || !config.lockedAt) return null;
  if (isGuildAdmin(interaction.member)) return null;
  return `${profile.name} is in lockdown${since(config)}, so nothing that changes roles, points or settings works right now. Look-ups still do. A server administrator can lift it with \`/security unlock\`.`;
}

/**
 * Count one destructive action against the person taking it, and lock the bot
 * if that takes them past the limit. Returns the refusal, or null to go ahead.
 *
 * Called by handlers only AFTER their own permission check has passed. Counting
 * attempts that were going to be refused anyway would let any member lock the
 * bot by spamming a command they are not allowed to use.
 */
export async function throttle(
  profile: SecurityProfile,
  interaction: Interaction,
  config: SecurityConfig,
  kind: ThrottleKind
): Promise<string | null> {
  if (isGuildAdmin(interaction.member)) return null;

  const actorId = actorOf(interaction).id;
  const guildId = interaction.guild_id ?? "";
  const now = Date.now();
  const where = { bot: profile.bot, guildId, actorId, kind };

  await db.botAction.create({ data: where });
  const [count] = await Promise.all([
    db.botAction.count({
      where: {
        ...where,
        createdAt: { gte: new Date(now - THROTTLE_WINDOW_MINUTES * 60 * 1000) },
      },
    }),
    db.botAction.deleteMany({
      where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  if (!overLimit(kind, count)) return null;

  const { limit, label } = THROTTLES[kind];
  const reason = `Automatic: ${mention(actorId)} went past ${limit} ${label} in ${THROTTLE_WINDOW_MINUTES} minutes.`;
  await profile.saveLock({ lockedAt: new Date(now), lockedById: "system", lockReason: reason });
  await securityAlert(
    profile,
    config,
    "Automatic Lockdown",
    `${reason} The last one was refused.\n\nNothing that changes roles, points or settings will work until a server administrator runs \`/security unlock\`. If this was not expected, check what ${mention(actorId)} has been doing and whether their account has been taken over.`
  );
  return `That is more ${label} than ${profile.name} allows one person in ${THROTTLE_WINDOW_MINUTES} minutes, so it has locked itself as a precaution. Nothing was changed. A server administrator can lift the lockdown with \`/security unlock\`.`;
}

/**
 * Post to the bot's security channel, if one is set. Never throws and never
 * blocks what it reports on: a missing alert is logged, not fatal.
 */
export async function securityAlert(
  profile: SecurityProfile,
  config: SecurityConfig,
  heading: string,
  body: string,
  color: number = COLOR.denied
): Promise<void> {
  if (!config.securityChannelId) return;
  const posted = await profile.rest.createMessage(config.securityChannelId, {
    embeds: [profile.panel(heading, body, { color, timestamp: new Date().toISOString() })],
  });
  if (!posted.ok) {
    console.error(`[${profile.bot}] security alert could not be posted`, posted.error);
  }
}

/**
 * /security lockdown | unlock | status.
 *
 * The brake is within reach of the bot's top tiers, so whoever spots trouble
 * first can stop it. The release is for server administrators only, so an
 * account that has been taken over cannot simply lift the lockdown and carry
 * on.
 */
export async function handleSecurity(
  profile: SecurityProfile,
  interaction: Interaction,
  config: SecurityConfig,
  path: string,
  { canEngage, reason }: { canEngage: boolean; reason: string }
): Promise<MessagePayload> {
  const actorId = actorOf(interaction).id;

  if (path === "unlock") {
    if (!isGuildAdmin(interaction.member)) {
      return {
        content:
          "Only server administrators can lift a lockdown, so an account that has been taken over cannot undo one.",
      };
    }
    if (!config.lockedAt) return { content: `${profile.name} is not in lockdown.` };
    await profile.saveLock({ lockedAt: null, lockedById: "", lockReason: "" });
    // The counts go too. Otherwise whoever tripped the throttle would trip it
    // again with their very next action.
    await db.botAction.deleteMany({
      where: { bot: profile.bot, guildId: interaction.guild_id ?? "" },
    });
    await securityAlert(
      profile,
      config,
      "Lockdown Lifted",
      `${mention(actorId)} lifted the lockdown. ${profile.name} is working normally again.`,
      COLOR.approved
    );
    return { content: `Lockdown lifted. ${profile.name} is working normally again.` };
  }

  if (!canEngage) {
    return {
      content: `You do not have clearance to use /security. This is limited to ${profile.engageLabel}.`,
    };
  }

  if (path === "lockdown") {
    if (config.lockedAt) {
      return { content: `${profile.name} is already in lockdown${since(config)}.` };
    }
    const why = reason.trim().slice(0, 300);
    await profile.saveLock({ lockedAt: new Date(), lockedById: actorId, lockReason: why });
    await securityAlert(
      profile,
      config,
      "Lockdown",
      `${mention(actorId)} locked ${profile.name}.${why ? `\n> ${why}` : ""}\n\nNothing that changes roles, points or settings works until a server administrator runs \`/security unlock\`.`
    );
    return {
      content: `${profile.name} is locked. Nothing that changes roles, points or settings will work for anyone but server administrators until one of them runs \`/security unlock\`. Look-ups still work.`,
    };
  }

  return { embeds: [await statusEmbed(profile, interaction, config)] };
}

/** /security status: the lockdown, and whether the server is set up safely. */
async function statusEmbed(
  profile: SecurityProfile,
  interaction: Interaction,
  config: SecurityConfig
): Promise<Embed> {
  const guildId = interaction.guild_id ?? "";
  let warnings = 0;
  const fields: { name: string; value: string; inline?: boolean }[] = [];

  const lockedBy =
    config.lockedById === "system" ? "the throttle" : mention(config.lockedById);
  fields.push({
    name: "Lockdown",
    value: config.lockedAt
      ? `**On**${since(config)}, by ${lockedBy}${config.lockReason ? `\n${config.lockReason}` : ""}`
      : "Off",
    inline: true,
  });

  if (!config.securityChannelId) warnings += 1;
  fields.push({
    name: "Security alerts",
    value: config.securityChannelId
      ? `<#${config.securityChannelId}>`
      : `⚠️ Not set. A server administrator can run \`${profile.setupCommand} security_channel\`.`,
    inline: true,
  });

  const own = dangerousPermissions(interaction.app_permissions).filter(
    (p) => p !== "Manage Roles"
  );
  if (own.length) warnings += 1;
  fields.push({
    name: `${profile.name}'s permissions`,
    value: own.length
      ? `⚠️ Has ${listOf(own)}. Take them away in Server Settings → Roles.`
      : "Safe. Nothing dangerous beyond Manage Roles.",
    inline: false,
  });

  const roles = await profile.rest.getRoles(guildId);
  if (!roles.ok || !roles.data) {
    warnings += 1;
    fields.push({
      name: "Role check",
      value: `Could not read the server's roles: ${roles.error ?? "no data"}`,
    });
  } else {
    const audit = auditRoles(roles.data, guildId, interaction.application_id);
    if (audit.everyone.length) {
      warnings += 1;
      fields.push({
        name: "⚠️ @everyone",
        value: `Every member of the server has ${listOf(audit.everyone)}, so anyone could wreck it. Turn these off on @everyone in Server Settings → Roles.`,
      });
    }
    let value: string;
    if (!audit.botRole) {
      warnings += 1;
      value = `Could not find ${profile.name}'s own role.`;
    } else if (audit.exposed.length === 0) {
      value = "None of them have server-control permissions, so even a leaked bot token could not hand out anything dangerous.";
    } else {
      warnings += 1;
      const shown = audit.exposed.slice(0, 8);
      const more = audit.exposed.length - shown.length;
      value = [
        `⚠️ ${profile.name}'s role sits above these, so anyone holding a leaked bot token could give them out:`,
        ...shown.map(({ role, permissions }) => `<@&${role.id}>: ${listOf(permissions)}`),
        ...(more > 0 ? [`…and ${more} more.`] : []),
        `Drag ${profile.name}'s role below them (it must stay above the rank roles), or turn those permissions off.`,
      ].join("\n");
    }
    fields.push({ name: "Roles below the bot", value: value.slice(0, 1024) });
  }

  const limits = profile.throttles.map((kind) => `${THROTTLES[kind].limit} ${THROTTLES[kind].label}`);
  fields.push({
    name: "Throttle",
    value: `Per person, per ${THROTTLE_WINDOW_MINUTES} minutes: ${listOf(limits)}. Going past any of them locks ${profile.name}. Server administrators are not counted.`,
  });

  return profile.panel("Security", undefined, {
    color: warnings > 0 ? COLOR.pending : COLOR.approved,
    fields,
    footer: {
      text: warnings > 0
        ? `${warnings} thing${warnings === 1 ? "" : "s"} to fix.`
        : "Nothing to fix.",
    },
  });
}
