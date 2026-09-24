-- THE COUNCIL — shift timer.
--
-- Adds CouncilShift, and makes Council points fractional (INTEGER → REAL) so a
-- 10–17 minute shift can pay half a point. SQLite cannot change a column's
-- type in place, so the three tables holding points are rebuilt and their rows
-- copied across unchanged. Every existing whole-number value is exact as a REAL.

-- CreateTable
CREATE TABLE "CouncilShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "division" TEXT NOT NULL,
    "activeKey" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" DATETIME,
    "breakSeconds" INTEGER NOT NULL DEFAULT 0,
    "adjustSeconds" INTEGER NOT NULL DEFAULT 0,
    "endedAt" DATETIME,
    "durationSeconds" INTEGER,
    "pointsAwarded" REAL,
    "endedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CouncilStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "points" REAL NOT NULL DEFAULT 0,
    "rankRoleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CouncilStanding" ("createdAt", "discordId", "division", "guildId", "id", "points", "rankRoleId", "updatedAt", "username") SELECT "createdAt", "discordId", "division", "guildId", "id", "points", "rankRoleId", "updatedAt", "username" FROM "CouncilStanding";
DROP TABLE "CouncilStanding";
ALTER TABLE "new_CouncilStanding" RENAME TO "CouncilStanding";
CREATE INDEX "CouncilStanding_guildId_division_points_idx" ON "CouncilStanding"("guildId", "division", "points");
CREATE UNIQUE INDEX "CouncilStanding_guildId_discordId_division_key" ON "CouncilStanding"("guildId", "discordId", "division");
CREATE TABLE "new_CouncilPointEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "delta" REAL NOT NULL,
    "balance" REAL NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CouncilPointEntry" ("actorId", "balance", "createdAt", "delta", "discordId", "division", "guildId", "id", "reason") SELECT "actorId", "balance", "createdAt", "delta", "discordId", "division", "guildId", "id", "reason" FROM "CouncilPointEntry";
DROP TABLE "CouncilPointEntry";
ALTER TABLE "new_CouncilPointEntry" RENAME TO "CouncilPointEntry";
CREATE INDEX "CouncilPointEntry_guildId_discordId_division_createdAt_idx" ON "CouncilPointEntry"("guildId", "discordId", "division", "createdAt");
CREATE TABLE "new_CouncilPromotionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "division" TEXT NOT NULL,
    "toDivision" TEXT NOT NULL,
    "fromRoleId" TEXT,
    "toRoleId" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL DEFAULT '',
    "pointsAtRequest" REAL NOT NULL,
    "application" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channelId" TEXT,
    "messageId" TEXT,
    "reviewerId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME
);
INSERT INTO "new_CouncilPromotionRequest" ("application", "channelId", "createdAt", "decidedAt", "discordId", "division", "fromRoleId", "guildId", "id", "messageId", "pointsAtRequest", "reason", "reviewerId", "status", "toDivision", "toLabel", "toRoleId", "username") SELECT "application", "channelId", "createdAt", "decidedAt", "discordId", "division", "fromRoleId", "guildId", "id", "messageId", "pointsAtRequest", "reason", "reviewerId", "status", "toDivision", "toLabel", "toRoleId", "username" FROM "CouncilPromotionRequest";
DROP TABLE "CouncilPromotionRequest";
ALTER TABLE "new_CouncilPromotionRequest" RENAME TO "CouncilPromotionRequest";
CREATE INDEX "CouncilPromotionRequest_guildId_status_idx" ON "CouncilPromotionRequest"("guildId", "status");
CREATE INDEX "CouncilPromotionRequest_guildId_discordId_status_idx" ON "CouncilPromotionRequest"("guildId", "discordId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CouncilShift_activeKey_key" ON "CouncilShift"("activeKey");

-- CreateIndex
CREATE INDEX "CouncilShift_guildId_discordId_endedAt_idx" ON "CouncilShift"("guildId", "discordId", "endedAt");

-- CreateIndex
CREATE INDEX "CouncilShift_guildId_endedAt_idx" ON "CouncilShift"("guildId", "endedAt");

