import { db } from "@/lib/db";
import { discordRest } from "@/lib/discord/rest";
import { DIVISION_KEYS, DIVISIONS, type DivisionKey } from "./divisions";

// The Council's settings: one server-wide row, plus one row per division.
// Both are read through helpers that invent the defaults when nothing has been
// saved yet, so no caller ever has to handle a missing config.

/** Every REST call The Council makes goes out under its own token. */
export const rest = discordRest("COUNCIL_BOT_TOKEN", "The Council");

const SINGLETON = "singleton";

export type CouncilConfig = {
  guildId: string;
  handsRoleId: string;
  scarletRoleId: string;
  memberRoleId: string;
  announceChannelId: string;
  pointsWebhookUrl: string;
};

export const EMPTY_CONFIG: CouncilConfig = {
  guildId: "",
  handsRoleId: "",
  scarletRoleId: "",
  memberRoleId: "",
  announceChannelId: "",
  pointsWebhookUrl: "",
};

export type DivisionConfig = {
  reviewerRoleId: string;
  staffRoleId: string;
  reviewChannelId: string;
  divisionRoleId: string;
};

export type DivisionConfigs = Record<DivisionKey, DivisionConfig>;

export const EMPTY_DIVISION: DivisionConfig = {
  reviewerRoleId: "",
  staffRoleId: "",
  reviewChannelId: "",
  divisionRoleId: "",
};

export function emptyDivisionConfigs(): DivisionConfigs {
  return Object.fromEntries(
    DIVISION_KEYS.map((key) => [key, { ...EMPTY_DIVISION }])
  ) as DivisionConfigs;
}

const pickConfig = (row: CouncilConfig): CouncilConfig => ({
  guildId: row.guildId,
  handsRoleId: row.handsRoleId,
  scarletRoleId: row.scarletRoleId,
  memberRoleId: row.memberRoleId,
  announceChannelId: row.announceChannelId,
  pointsWebhookUrl: row.pointsWebhookUrl,
});

const pickDivision = (row: DivisionConfig): DivisionConfig => ({
  reviewerRoleId: row.reviewerRoleId,
  staffRoleId: row.staffRoleId,
  reviewChannelId: row.reviewChannelId,
  divisionRoleId: row.divisionRoleId,
});

export async function getCouncilConfig(): Promise<CouncilConfig> {
  const row = await db.councilGuildConfig.findUnique({
    where: { id: SINGLETON },
  });
  return row ? pickConfig(row) : EMPTY_CONFIG;
}

/** Only the keys present are written, so setup can adjust one thing at a time. */
export async function saveCouncilConfig(
  patch: Partial<CouncilConfig>
): Promise<CouncilConfig> {
  const row = await db.councilGuildConfig.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, ...EMPTY_CONFIG, ...patch },
    update: patch,
  });
  return pickConfig(row);
}

export async function getDivisionConfigs(
  guildId: string
): Promise<DivisionConfigs> {
  const configs = emptyDivisionConfigs();
  const rows = await db.councilDivisionConfig.findMany({ where: { guildId } });
  for (const row of rows) {
    if (row.division in configs) {
      configs[row.division as DivisionKey] = pickDivision(row);
    }
  }
  return configs;
}

export async function saveDivisionConfig(
  guildId: string,
  division: DivisionKey,
  patch: Partial<DivisionConfig>
): Promise<DivisionConfig> {
  const row = await db.councilDivisionConfig.upsert({
    where: { guildId_division: { guildId, division } },
    create: { guildId, division, ...EMPTY_DIVISION, ...patch },
    update: patch,
  });
  return pickDivision(row);
}

/**
 * Where a division's promotion requests are posted: its own review channel,
 * or its parent's when it has none — so the Judicial subdivisions can share
 * Judicial's channel without being configured twice.
 */
export function reviewChannelFor(
  divisions: DivisionConfigs,
  division: DivisionKey
): string {
  return (
    divisions[division].reviewChannelId ||
    divisions[DIVISIONS[division].parent].reviewChannelId
  );
}
