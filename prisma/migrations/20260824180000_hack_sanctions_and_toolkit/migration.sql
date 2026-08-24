-- Intrusion toolkit and the terminal-conduct sanction ladder.
--
-- Purely additive: two new tables and two new nullable/defaulted columns on
-- HackRun. No existing column is altered or dropped, so this applies cleanly to
-- a populated database with no data loss and no backfill.

-- AlterTable: intrusion toolkit effects carried on the run itself.
ALTER TABLE "HackRun" ADD COLUMN "deadmanArmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HackRun" ADD COLUMN "spoofedUntil" DATETIME;

-- CreateTable
CREATE TABLE "HackSanction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME,
    "issuedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" DATETIME,
    "liftedById" TEXT,
    "liftReason" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "HackTool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "earnedFromRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "usedOnRunId" TEXT
);

-- CreateIndex
CREATE INDEX "HackSanction_userId_createdAt_idx" ON "HackSanction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HackSanction_userId_liftedAt_expiresAt_idx" ON "HackSanction"("userId", "liftedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "HackTool_userId_usedAt_idx" ON "HackTool"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "HackTool_usedOnRunId_idx" ON "HackTool"("usedOnRunId");
