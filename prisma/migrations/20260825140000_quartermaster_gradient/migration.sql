-- Custom gradient for the admin quartermaster panel.
--
-- Purely additive: two nullable-free TEXT columns with an empty-string default
-- on the singleton SiteConfig row. No existing column is altered or dropped, so
-- this applies cleanly to a populated database with no backfill — the existing
-- row picks up "" for both, which reads as "no custom banner".
--
-- Stored normalised to `#rrggbb` by lib/hex-color.ts before it ever reaches
-- here; the column is not the validation boundary and must not be treated as
-- one.

-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN "quartermasterFrom" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteConfig" ADD COLUMN "quartermasterTo" TEXT NOT NULL DEFAULT '';
