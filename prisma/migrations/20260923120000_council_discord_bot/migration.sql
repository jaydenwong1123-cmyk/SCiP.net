-- THE COUNCIL — the second Discord bot's own tables.
--
-- Purely additive: seven new tables, no change to any existing one, and
-- nothing here references an Engine table or a site account.

-- CreateTable
CREATE TABLE "CouncilGuildConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "guildId" TEXT NOT NULL DEFAULT '',
    "handsRoleId" TEXT NOT NULL DEFAULT '',
    "scarletRoleId" TEXT NOT NULL DEFAULT '',
    "memberRoleId" TEXT NOT NULL DEFAULT '',
    "announceChannelId" TEXT NOT NULL DEFAULT '',
    "pointsWebhookUrl" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CouncilDivisionConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "reviewerRoleId" TEXT NOT NULL DEFAULT '',
    "staffRoleId" TEXT NOT NULL DEFAULT '',
    "reviewChannelId" TEXT NOT NULL DEFAULT '',
    "divisionRoleId" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CouncilRank" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "band" TEXT NOT NULL DEFAULT '',
    "requiresApplication" BOOLEAN NOT NULL DEFAULT false,
    "applicationUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CouncilMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "division" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CouncilStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL DEFAULT 0,
    "rankRoleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CouncilPointEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CouncilPromotionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "division" TEXT NOT NULL,
    "toDivision" TEXT NOT NULL,
    "fromRoleId" TEXT,
    "toRoleId" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL DEFAULT '',
    "pointsAtRequest" INTEGER NOT NULL,
    "application" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channelId" TEXT,
    "messageId" TEXT,
    "reviewerId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "CouncilDivisionConfig_guildId_division_key" ON "CouncilDivisionConfig"("guildId", "division");

-- CreateIndex
CREATE INDEX "CouncilRank_guildId_division_points_idx" ON "CouncilRank"("guildId", "division", "points");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilRank_guildId_roleId_key" ON "CouncilRank"("guildId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilMember_guildId_discordId_key" ON "CouncilMember"("guildId", "discordId");

-- CreateIndex
CREATE INDEX "CouncilStanding_guildId_division_points_idx" ON "CouncilStanding"("guildId", "division", "points");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilStanding_guildId_discordId_division_key" ON "CouncilStanding"("guildId", "discordId", "division");

-- CreateIndex
CREATE INDEX "CouncilPointEntry_guildId_discordId_division_createdAt_idx" ON "CouncilPointEntry"("guildId", "discordId", "division", "createdAt");

-- CreateIndex
CREATE INDEX "CouncilPromotionRequest_guildId_status_idx" ON "CouncilPromotionRequest"("guildId", "status");

-- CreateIndex
CREATE INDEX "CouncilPromotionRequest_guildId_discordId_status_idx" ON "CouncilPromotionRequest"("guildId", "discordId", "status");

