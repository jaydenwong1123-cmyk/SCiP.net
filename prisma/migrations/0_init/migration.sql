-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "clearance" INTEGER NOT NULL DEFAULT 1,
    "canPostScp" BOOLEAN NOT NULL DEFAULT false,
    "canFileIncident" BOOLEAN NOT NULL DEFAULT false,
    "canLogTest" BOOLEAN NOT NULL DEFAULT false,
    "canEditPersonnel" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isCoOwner" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "isHelper" BOOLEAN NOT NULL DEFAULT false,
    "department" TEXT,
    "designation" TEXT,
    "personalFile" TEXT NOT NULL DEFAULT '',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "closedAt" DATETIME,
    "resolution" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT NOT NULL,
    "closedById" TEXT,
    "scpFileId" TEXT,
    "requestedDays" INTEGER
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "silenced" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MemberInfraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "severity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subjectId" TEXT NOT NULL,
    "issuerId" TEXT,
    "issuerName" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "MemberNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subjectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "createdById" TEXT,
    "usedById" TEXT
);

-- CreateTable
CREATE TABLE "InviteRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ScpFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "clearanceRequired" INTEGER NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'Safe',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ScpTestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "procedure" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scpFileId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ScpAccessGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "scpFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT
);

-- CreateTable
CREATE TABLE "HackRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'active',
    "clearedStages" INTEGER NOT NULL DEFAULT 0,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "round" INTEGER NOT NULL DEFAULT 1,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "atCheckpoint" BOOLEAN NOT NULL DEFAULT false,
    "stageDeadlineAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "failReason" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "terminal" TEXT NOT NULL DEFAULT '',
    "actorClearance" INTEGER NOT NULL DEFAULT 1,
    "actorDepartment" TEXT NOT NULL DEFAULT '',
    "revealLevel" INTEGER NOT NULL DEFAULT 0,
    "traceCursor" INTEGER NOT NULL DEFAULT 0,
    "traceLockedUntil" DATETIME,
    "traceById" TEXT,
    "identifiedAt" DATETIME,
    "suspicionScore" INTEGER NOT NULL DEFAULT 0,
    "caseStatus" TEXT NOT NULL DEFAULT 'NEEDS_ACTION',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "HackDuel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "defenderId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "attackerNonce" TEXT NOT NULL,
    "defenderNonce" TEXT NOT NULL,
    "attackerAttemptsLeft" INTEGER NOT NULL DEFAULT 3,
    "defenderAttemptsLeft" INTEGER NOT NULL DEFAULT 3,
    "defenderSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    "attackerDeadlineAt" DATETIME,
    "defenderDeadlineAt" DATETIME NOT NULL,
    "winner" TEXT,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "HackGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tier" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "revokedById" TEXT,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "HackChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'intrusion',
    "game" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "cursor" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "attemptsLeft" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" DATETIME NOT NULL,
    "answeredAt" DATETIME,
    "correct" BOOLEAN
);

-- CreateTable
CREATE TABLE "ConductRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "runId" TEXT,
    "elapsedMs" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT NOT NULL DEFAULT '',
    "signals" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "publishAt" DATETIME,
    "expiresAt" DATETIME,
    "authorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "uploaderId" TEXT,
    "uploaderName" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ClearanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestedLevel" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "userId" TEXT NOT NULL,
    "reviewedById" TEXT
);

-- CreateTable
CREATE TABLE "SecureMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "bypassCode" TEXT NOT NULL DEFAULT '',
    "maintenanceMessage" TEXT NOT NULL DEFAULT '',
    "lockdownUntil" DATETIME,
    "shutdownMode" BOOLEAN NOT NULL DEFAULT false,
    "shutdownMessage" TEXT NOT NULL DEFAULT '',
    "shutdownAt" DATETIME,
    "omegaArmedOp" TEXT,
    "omegaArmedAt" DATETIME,
    "omegaArmedBy" TEXT
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'Minor',
    "clearanceRequired" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editorId" TEXT,
    "editorName" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "targetType" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "targetName" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Ticket_authorId_idx" ON "Ticket"("authorId");

-- CreateIndex
CREATE INDEX "Ticket_type_status_idx" ON "Ticket"("type", "status");

-- CreateIndex
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_createdAt_idx" ON "TicketReply"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");

-- CreateIndex
CREATE INDEX "MemberInfraction_subjectId_idx" ON "MemberInfraction"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_usedById_key" ON "InviteCode"("usedById");

-- CreateIndex
CREATE INDEX "InviteCode_createdById_idx" ON "InviteCode"("createdById");

-- CreateIndex
CREATE INDEX "InviteRedemption_inviteId_idx" ON "InviteRedemption"("inviteId");

-- CreateIndex
CREATE INDEX "InviteRedemption_userId_idx" ON "InviteRedemption"("userId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "ScpTestLog_scpFileId_sequence_idx" ON "ScpTestLog"("scpFileId", "sequence");

-- CreateIndex
CREATE INDEX "ScpTestLog_authorId_idx" ON "ScpTestLog"("authorId");

-- CreateIndex
CREATE INDEX "ScpAccessGrant_scpFileId_userId_idx" ON "ScpAccessGrant"("scpFileId", "userId");

-- CreateIndex
CREATE INDEX "ScpAccessGrant_userId_idx" ON "ScpAccessGrant"("userId");

-- CreateIndex
CREATE INDEX "ScpAccessGrant_expiresAt_idx" ON "ScpAccessGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "HackRun_userId_startedAt_idx" ON "HackRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "HackRun_status_idx" ON "HackRun"("status");

-- CreateIndex
CREATE INDEX "HackRun_startedAt_idx" ON "HackRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HackDuel_runId_key" ON "HackDuel"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "HackDuel_attackerNonce_key" ON "HackDuel"("attackerNonce");

-- CreateIndex
CREATE UNIQUE INDEX "HackDuel_defenderNonce_key" ON "HackDuel"("defenderNonce");

-- CreateIndex
CREATE INDEX "HackDuel_winner_idx" ON "HackDuel"("winner");

-- CreateIndex
CREATE INDEX "HackDuel_startedAt_idx" ON "HackDuel"("startedAt");

-- CreateIndex
CREATE INDEX "HackDuel_defenderId_idx" ON "HackDuel"("defenderId");

-- CreateIndex
CREATE UNIQUE INDEX "HackGrant_runId_key" ON "HackGrant"("runId");

-- CreateIndex
CREATE INDEX "HackGrant_userId_expiresAt_idx" ON "HackGrant"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "HackGrant_expiresAt_idx" ON "HackGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HackChallenge_nonce_key" ON "HackChallenge"("nonce");

-- CreateIndex
CREATE INDEX "HackChallenge_deadlineAt_idx" ON "HackChallenge"("deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "HackChallenge_runId_kind_cursor_key" ON "HackChallenge"("runId", "kind", "cursor");

-- CreateIndex
CREATE INDEX "ConductRecord_userId_createdAt_idx" ON "ConductRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConductRecord_score_createdAt_idx" ON "ConductRecord"("score", "createdAt");

-- CreateIndex
CREATE INDEX "ConductRecord_runId_idx" ON "ConductRecord"("runId");

-- CreateIndex
CREATE INDEX "ConductRecord_createdAt_idx" ON "ConductRecord"("createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_publishAt_idx" ON "Broadcast"("publishAt");

-- CreateIndex
CREATE INDEX "Broadcast_expiresAt_idx" ON "Broadcast"("expiresAt");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Attachment_expiresAt_idx" ON "Attachment"("expiresAt");

-- CreateIndex
CREATE INDEX "Attachment_uploaderId_idx" ON "Attachment"("uploaderId");

-- CreateIndex
CREATE INDEX "Revision_entityType_entityId_createdAt_idx" ON "Revision"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_editorId_idx" ON "Revision"("editorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- CreateIndex
CREATE INDEX "AuthAttempt_key_createdAt_idx" ON "AuthAttempt"("key", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_createdAt_idx" ON "AuthAttempt"("createdAt");

