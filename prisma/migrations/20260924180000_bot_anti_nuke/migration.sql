-- ANTI-NUKE SAFEGUARDS for both Discord bots (lib/discord/guard.ts).
--
-- Each bot's settings row gains a security alert channel and a lockdown
-- switch; BotAction logs destructive actions so one person taking too many in
-- a few minutes locks the bot. The two settings tables are rebuilt rather than
-- altered so the new columns sit before updatedAt, as Prisma lays them out;
-- every existing row is copied across unchanged and starts unlocked.

-- CreateTable
CREATE TABLE "BotAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bot" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EngineGuildConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "guildId" TEXT NOT NULL DEFAULT '',
    "staffRoleId" TEXT NOT NULL DEFAULT '',
    "highRankRoleId" TEXT NOT NULL DEFAULT '',
    "highCommandRoleId" TEXT NOT NULL DEFAULT '',
    "ownerRoleId" TEXT NOT NULL DEFAULT '',
    "memberRoleId" TEXT NOT NULL DEFAULT '',
    "reviewChannelId" TEXT NOT NULL DEFAULT '',
    "announceChannelId" TEXT NOT NULL DEFAULT '',
    "pointsWebhookUrl" TEXT NOT NULL DEFAULT '',
    "securityChannelId" TEXT NOT NULL DEFAULT '',
    "lockedAt" DATETIME,
    "lockedById" TEXT NOT NULL DEFAULT '',
    "lockReason" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_EngineGuildConfig" ("announceChannelId", "guildId", "highCommandRoleId", "highRankRoleId", "id", "memberRoleId", "ownerRoleId", "pointsWebhookUrl", "reviewChannelId", "staffRoleId", "updatedAt") SELECT "announceChannelId", "guildId", "highCommandRoleId", "highRankRoleId", "id", "memberRoleId", "ownerRoleId", "pointsWebhookUrl", "reviewChannelId", "staffRoleId", "updatedAt" FROM "EngineGuildConfig";
DROP TABLE "EngineGuildConfig";
ALTER TABLE "new_EngineGuildConfig" RENAME TO "EngineGuildConfig";
CREATE TABLE "new_CouncilGuildConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "guildId" TEXT NOT NULL DEFAULT '',
    "handsRoleId" TEXT NOT NULL DEFAULT '',
    "scarletRoleId" TEXT NOT NULL DEFAULT '',
    "memberRoleId" TEXT NOT NULL DEFAULT '',
    "announceChannelId" TEXT NOT NULL DEFAULT '',
    "pointsWebhookUrl" TEXT NOT NULL DEFAULT '',
    "securityChannelId" TEXT NOT NULL DEFAULT '',
    "lockedAt" DATETIME,
    "lockedById" TEXT NOT NULL DEFAULT '',
    "lockReason" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CouncilGuildConfig" ("announceChannelId", "guildId", "handsRoleId", "id", "memberRoleId", "pointsWebhookUrl", "scarletRoleId", "updatedAt") SELECT "announceChannelId", "guildId", "handsRoleId", "id", "memberRoleId", "pointsWebhookUrl", "scarletRoleId", "updatedAt" FROM "CouncilGuildConfig";
DROP TABLE "CouncilGuildConfig";
ALTER TABLE "new_CouncilGuildConfig" RENAME TO "CouncilGuildConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BotAction_bot_guildId_actorId_kind_createdAt_idx" ON "BotAction"("bot", "guildId", "actorId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "BotAction_createdAt_idx" ON "BotAction"("createdAt");

