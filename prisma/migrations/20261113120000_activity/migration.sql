-- ACTIVITY — visit tracking, forum reactions and post edits.
--
-- Purely additive: three nullable columns and two new tables. Nothing existing
-- is rewritten, so every current row stays valid as it is.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "prevVisitAt" DATETIME;

-- AlterTable
ALTER TABLE "ForumPost" ADD COLUMN "editedAt" DATETIME;

-- CreateTable
CREATE TABLE "ForumReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ForumReaction_userId_idx" ON "ForumReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReaction_postId_userId_kind_key" ON "ForumReaction"("postId", "userId", "kind");

-- CreateIndex
CREATE INDEX "ActivityDay_day_idx" ON "ActivityDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityDay_userId_day_key" ON "ActivityDay"("userId", "day");
