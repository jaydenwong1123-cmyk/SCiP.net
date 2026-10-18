-- CHAOS INSURGENCY — owner-generated, one-use codes.
--
-- Replaces the CI_SIGNUP_CODE / CI_LAUNCH_CODE environment variables. Purely
-- additive: one new table, nothing existing touched.

-- CreateTable
CREATE TABLE "CiCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    "usedById" TEXT,
    "usedByName" TEXT NOT NULL DEFAULT '',
    "revokedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "CiCode_code_key" ON "CiCode"("code");

-- CreateIndex
CREATE INDEX "CiCode_kind_usedAt_revokedAt_idx" ON "CiCode"("kind", "usedAt", "revokedAt");
