-- Scope the quartermaster gradient to whoever set it.
--
-- Purely additive: one nullable TEXT column on the singleton SiteConfig row.
-- No existing column is altered or dropped, so this applies cleanly to a
-- populated database with no backfill — the existing row picks up NULL, which
-- reads as "nobody has set a personal gradient".

-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN "quartermasterSetById" TEXT;
