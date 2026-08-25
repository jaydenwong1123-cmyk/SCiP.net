-- Training range drills.
--
-- Purely additive: one new table, nothing else. No existing column is altered
-- or dropped and no existing table is touched, so this applies cleanly to a
-- populated database with no data loss and no backfill.
--
-- Deliberately not a HackChallenge row. See the HackDrill comment in
-- schema.prisma for why the ladder's table is left alone.

-- CreateTable
CREATE TABLE "HackDrill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "attemptsLeft" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" DATETIME,
    "correct" BOOLEAN
);

-- CreateIndex
CREATE UNIQUE INDEX "HackDrill_nonce_key" ON "HackDrill"("nonce");

-- CreateIndex
CREATE INDEX "HackDrill_userId_issuedAt_idx" ON "HackDrill"("userId", "issuedAt");
