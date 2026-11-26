import { db } from "@/lib/db";

// The bot's settings, one row per server, fetched through a helper that
// invents the defaults when the row does not exist yet, so nothing downstream
// ever has to handle a null config.

const SINGLETON = "singleton";

export type EngineConfig = {
  guildId: string;
  staffRoleId: string;
  highRankRoleId: string;
  highCommandRoleId: string;
  ownerRoleId: string;
  memberRoleId: string;
  reviewChannelId: string;
  announceChannelId: string;
  pointsWebhookUrl: string;
  /** Public copy of every command's reply; see command-log.ts. */
  commandLogWebhookUrl: string;
  /** Anti-nuke: see lib/discord/guard.ts. */
  securityChannelId: string;
  lockedAt: Date | null;
  lockedById: string;
  lockReason: string;
};

export const EMPTY_CONFIG: EngineConfig = {
  guildId: "",
  staffRoleId: "",
  highRankRoleId: "",
  highCommandRoleId: "",
  ownerRoleId: "",
  memberRoleId: "",
  reviewChannelId: "",
  announceChannelId: "",
  pointsWebhookUrl: "",
  commandLogWebhookUrl: "",
  securityChannelId: "",
  lockedAt: null,
  lockedById: "",
  lockReason: "",
};

const pickConfig = (row: EngineConfig): EngineConfig => ({
  guildId: row.guildId,
  staffRoleId: row.staffRoleId,
  highRankRoleId: row.highRankRoleId,
  highCommandRoleId: row.highCommandRoleId,
  ownerRoleId: row.ownerRoleId,
  memberRoleId: row.memberRoleId,
  reviewChannelId: row.reviewChannelId,
  announceChannelId: row.announceChannelId,
  pointsWebhookUrl: row.pointsWebhookUrl,
  commandLogWebhookUrl: row.commandLogWebhookUrl,
  securityChannelId: row.securityChannelId,
  lockedAt: row.lockedAt,
  lockedById: row.lockedById,
  lockReason: row.lockReason,
});

// One settings row per server, keyed by the server's id, so each server The
// Engine is in has its own roles, channels and lockdown.
//
// Before multi-server support there was a single row with id "singleton". It
// still belongs to the server it was set up in (its guildId, or
// DISCORD_GUILD_ID if setup never saved one), and is moved to that server's id
// the first time settings are saved there. Reads fall back to it until then.

async function legacyRow(guildId: string) {
  const row = await db.engineGuildConfig.findUnique({ where: { id: SINGLETON } });
  if (!row) return null;
  const owner = row.guildId || process.env.DISCORD_GUILD_ID || "";
  return owner === guildId ? row : null;
}

export async function getEngineConfig(guildId: string): Promise<EngineConfig> {
  const row =
    (await db.engineGuildConfig.findUnique({ where: { id: guildId } })) ??
    (await legacyRow(guildId));
  return row ? pickConfig(row) : { ...EMPTY_CONFIG, guildId };
}

/**
 * Write the settings a run of `/engine setup` supplied, for one server.
 *
 * Only the keys present are touched, so setup can be run repeatedly to adjust
 * one channel without having to re-pick every role each time.
 */
export async function saveEngineConfig(
  guildId: string,
  patch: Partial<EngineConfig>
): Promise<EngineConfig> {
  const data = { ...patch, guildId };
  const existing = await db.engineGuildConfig.findUnique({ where: { id: guildId } });
  if (!existing) {
    const legacy = await legacyRow(guildId);
    if (legacy) {
      const moved = await db.engineGuildConfig.update({
        where: { id: SINGLETON },
        data: { ...data, id: guildId },
      });
      return pickConfig(moved);
    }
  }
  const row = await db.engineGuildConfig.upsert({
    where: { id: guildId },
    create: { ...EMPTY_CONFIG, ...data, id: guildId },
    update: data,
  });
  return pickConfig(row);
}

/**
 * Is this a Discord webhook URL? Checked on the way in so a pasted channel link
 * or a typo is refused at setup, rather than failing silently on every award.
 */
export function isWebhookUrl(value: string): boolean {
  return /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(
    value.trim()
  );
}
