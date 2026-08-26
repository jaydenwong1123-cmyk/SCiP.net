-- Forums: L-5+ personnel open a clearance-gated discussion topic; members
-- meeting that clearance chat in it. Purely additive: two new tables, no
-- change to any existing one.

-- CreateTable
CREATE TABLE "Forum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "minClearance" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creatorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forumId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE INDEX "Forum_creatorId_idx" ON "Forum"("creatorId");

-- CreateIndex
CREATE INDEX "Forum_createdAt_idx" ON "Forum"("createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_forumId_createdAt_idx" ON "ForumPost"("forumId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_authorId_idx" ON "ForumPost"("authorId");
