import { db } from "@/lib/db";

// The bot's own settings row. Mirrors lib/site-config.ts's singleton shape:
// one row, fetched through a helper that invents the defaults when the row does
// not exist yet, so nothing downstream ever has to handle a null config.

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
  securityChannelId: row.securityChannelId,
  lockedAt: row.lockedAt,
  lockedById: row.lockedById,
  lockReason: row.lockReason,
});

export async function getEngineConfig(): Promise<EngineConfig> {
  const row = await db.engineGuildConfig.findUnique({
    where: { id: SINGLETON },
  });
  return row ? pickConfig(row) : EMPTY_CONFIG;
}

/**
 * Write the settings a run of `/engine setup` supplied.
 *
 * Only the keys present are touched, so setup can be run repeatedly to adjust
 * one channel without having to re-pick every role each time.
 */
export async function saveEngineConfig(
  patch: Partial<EngineConfig>
): Promise<EngineConfig> {
  const row = await db.engineGuildConfig.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, ...EMPTY_CONFIG, ...patch },
    update: patch,
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
