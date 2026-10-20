-- CHAOS INSURGENCY — command ranks (operative / squadron_leader / delta_command).
--
-- Purely additive: one column, defaulting every existing CI account (and every
-- member, who never reads it) to operative.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "ciRank" TEXT NOT NULL DEFAULT 'operative';
