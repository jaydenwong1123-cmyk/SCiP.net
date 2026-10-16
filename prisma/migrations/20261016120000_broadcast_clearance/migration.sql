-- Broadcasts gain a minimum clearance, so a directive can be aimed at L-1
-- through L-7 personnel. Every existing broadcast starts at 1 (all members),
-- which is how they were already visible.

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN "clearanceRequired" INTEGER NOT NULL DEFAULT 1;
