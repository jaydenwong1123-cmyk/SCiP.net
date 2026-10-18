-- CHAOS INSURGENCY SIEGE.
--
-- Purely additive. User gains the insurgent and early-access flags, SiteConfig
-- gains the siege controls and hot-path hints, and four new tables hold the
-- sieges themselves. Every new column is defaulted off/NULL, so the existing
-- network is untouched until staff set SiteConfig.ciMode away from "off".

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isInsurgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "earlyAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN "ciMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "SiteConfig" ADD COLUMN "ciSignupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteConfig" ADD COLUMN "ciAttacksEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteConfig" ADD COLUMN "ciCooldownUntil" DATETIME;
ALTER TABLE "SiteConfig" ADD COLUMN "ciSiegeEndsAt" DATETIME;
ALTER TABLE "SiteConfig" ADD COLUMN "ciDefacedUntil" DATETIME;
ALTER TABLE "SiteConfig" ADD COLUMN "ciLockHorizon" DATETIME;

-- CreateTable
CREATE TABLE "CiSiege" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activeSlot" TEXT,
    "launchedById" TEXT NOT NULL,
    "launchedByName" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "abortedById" TEXT,
    "defacedUntil" DATETIME
);

-- CreateTable
CREATE TABLE "CiSiegeSystem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siegeId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "integrity" INTEGER NOT NULL,
    "maxIntegrity" INTEGER NOT NULL,
    "fallenAt" DATETIME,
    "lockedUntil" DATETIME,
    "restoreProgress" INTEGER NOT NULL DEFAULT 0,
    "restoredAt" DATETIME,
    "restoredById" TEXT
);

-- CreateTable
CREATE TABLE "CiSiegeChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siegeId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "side" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'siege',
    "seq" INTEGER NOT NULL,
    "game" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "attemptsLeft" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" DATETIME NOT NULL,
    "answeredAt" DATETIME,
    "correct" BOOLEAN,
    "delta" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CiLeak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siegeId" TEXT NOT NULL,
    "scpFileId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "User_isInsurgent_idx" ON "User"("isInsurgent");

-- CreateIndex
CREATE UNIQUE INDEX "CiSiege_activeSlot_key" ON "CiSiege"("activeSlot");

-- CreateIndex
CREATE INDEX "CiSiege_startedAt_idx" ON "CiSiege"("startedAt");

-- CreateIndex
CREATE INDEX "CiSiegeSystem_system_lockedUntil_idx" ON "CiSiegeSystem"("system", "lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CiSiegeSystem_siegeId_system_key" ON "CiSiegeSystem"("siegeId", "system");

-- CreateIndex
CREATE UNIQUE INDEX "CiSiegeChallenge_nonce_key" ON "CiSiegeChallenge"("nonce");

-- CreateIndex
CREATE INDEX "CiSiegeChallenge_siegeId_side_correct_idx" ON "CiSiegeChallenge"("siegeId", "side", "correct");

-- CreateIndex
CREATE INDEX "CiSiegeChallenge_userId_idx" ON "CiSiegeChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CiSiegeChallenge_siegeId_userId_seq_key" ON "CiSiegeChallenge"("siegeId", "userId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "CiLeak_siegeId_key" ON "CiLeak"("siegeId");
