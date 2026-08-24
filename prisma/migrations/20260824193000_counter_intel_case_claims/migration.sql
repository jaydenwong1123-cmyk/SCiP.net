-- Counter-intel case claims and the escalation SLA.
--
-- Purely additive: two nullable columns on HackRun plus one index. Existing
-- rows read as unclaimed, which is the correct starting state for every case
-- already on the desk.

-- AlterTable
ALTER TABLE "HackRun" ADD COLUMN "claimedById" TEXT;
ALTER TABLE "HackRun" ADD COLUMN "claimedAt" DATETIME;

-- CreateIndex
CREATE INDEX "HackRun_claimedById_claimedAt_idx" ON "HackRun"("claimedById", "claimedAt");
