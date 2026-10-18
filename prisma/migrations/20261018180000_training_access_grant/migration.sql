-- TRAINING RANGE — per-member access grant.
--
-- Lets a RAISA administrator open /training to a member who holds no Helper
-- role. Purely additive: one new column, defaulting to no access.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "canAccessTraining" BOOLEAN NOT NULL DEFAULT false;
