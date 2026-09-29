-- THE CRIMSON HAND (code name "council") — double shift points.
--
-- CouncilGuildConfig gains the end time of a double-points window and who
-- opened it. The table is rebuilt rather than altered so the new columns sit
-- before updatedAt, as Prisma lays them out; every existing row is copied
-- across unchanged and starts with double points off.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "doublePointsUntil" DATETIME,
    "doublePointsById" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CouncilGuildConfig" ("announceChannelId", "guildId", "handsRoleId", "id", "lockReason", "lockedAt", "lockedById", "memberRoleId", "pointsWebhookUrl", "scarletRoleId", "securityChannelId", "updatedAt") SELECT "announceChannelId", "guildId", "handsRoleId", "id", "lockReason", "lockedAt", "lockedById", "memberRoleId", "pointsWebhookUrl", "scarletRoleId", "securityChannelId", "updatedAt" FROM "CouncilGuildConfig";
DROP TABLE "CouncilGuildConfig";
ALTER TABLE "new_CouncilGuildConfig" RENAME TO "CouncilGuildConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
