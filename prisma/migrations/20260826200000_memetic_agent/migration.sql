-- MEMETIC AGENT: one live exposure at a time, on the singleton SiteConfig row.
--
-- Purely additive: five nullable/defaulted columns, no existing column altered
-- or dropped, so this applies cleanly to a populated database with no backfill.
-- The existing row picks up NULL/"" across the set, which reads as "nobody is
-- under exposure".

-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN "memeticTargetId" TEXT;
ALTER TABLE "SiteConfig" ADD COLUMN "memeticAgent" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteConfig" ADD COLUMN "memeticCadence" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteConfig" ADD COLUMN "memeticEndsAt" DATETIME;
ALTER TABLE "SiteConfig" ADD COLUMN "memeticIssuedById" TEXT;
