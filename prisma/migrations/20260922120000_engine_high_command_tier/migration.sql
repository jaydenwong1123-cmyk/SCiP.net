-- Split the old "Command" tier into two: High Rank (approves promotions,
-- what the old commandRoleId already meant) and a new High Command tier above
-- it (posts announcements). See lib/engine/permissions.ts.

-- RenameColumn
ALTER TABLE "EngineGuildConfig" RENAME COLUMN "commandRoleId" TO "highRankRoleId";

-- AddColumn
ALTER TABLE "EngineGuildConfig" ADD COLUMN "highCommandRoleId" TEXT NOT NULL DEFAULT '';
