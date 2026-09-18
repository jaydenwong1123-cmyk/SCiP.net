-- THE ENGINE — the Discord bot's own tables.
--
-- Purely additive: five new tables, no change to any existing one. Nothing here
-- references User or ClearanceRequest. A member of the Discord server has
-- standing here without ever holding a site account, which is the whole point
-- of keeping the two apart.

-- CreateTable
CREATE TABLE "EngineGuildConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL DEFAULT '',
    "staffRoleId" TEXT NOT NULL DEFAULT '',
    "commandRoleId" TEXT NOT NULL DEFAULT '',
    "ownerRoleId" TEXT NOT NULL DEFAULT '',
    "memberRoleId" TEXT NOT NULL DEFAULT '',
    "reviewChannelId" TEXT NOT NULL DEFAULT '',
    "announceChannelId" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EngineMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL DEFAULT 0,
    "rankRoleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EnginePointEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EngineRank" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EnginePromotionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "fromRoleId" TEXT,
    "toRoleId" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL DEFAULT '',
    "pointsAtRequest" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "reviewerId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "EngineMember_guildId_discordId_key" ON "EngineMember"("guildId", "discordId");

-- CreateIndex
CREATE INDEX "EngineMember_guildId_points_idx" ON "EngineMember"("guildId", "points");

-- CreateIndex
CREATE INDEX "EnginePointEntry_guildId_discordId_createdAt_idx" ON "EnginePointEntry"("guildId", "discordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngineRank_guildId_roleId_key" ON "EngineRank"("guildId", "roleId");

-- CreateIndex
CREATE INDEX "EngineRank_guildId_points_idx" ON "EngineRank"("guildId", "points");

-- CreateIndex
CREATE INDEX "EnginePromotionRequest_guildId_status_idx" ON "EnginePromotionRequest"("guildId", "status");

-- CreateIndex
CREATE INDEX "EnginePromotionRequest_guildId_discordId_status_idx" ON "EnginePromotionRequest"("guildId", "discordId", "status");
