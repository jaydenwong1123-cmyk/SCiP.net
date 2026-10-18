import { db } from "@/lib/db";

// Total network wipe — the destructive half of OMEGA AUTHORITY.
//
// Deliberately not a loop over purgeUser(). That function unpicks one member
// from a network that continues to exist around them, which is exactly the
// wrong shape here: it costs ~25 queries per account to preserve relationships
// that are about to be deleted anyway. This issues one deleteMany per model
// instead, and the fact that relationMode = "prisma" means no foreign keys is,
// for once, a convenience — nothing can refuse to delete for referential
// reasons, so ordering is for a human reader's benefit only.
//
// Survivors, and only these:
//   - the root owner's User row (passed in), so the site remains recoverable
//   - the SiteConfig singleton, which holds the shutdown state itself
//   - the audit entry for the purge, written by the CALLER afterwards — see
//     the note on logAuditNow in app/(app)/admin/omega/actions.ts
//   - the Discord bots' tables (Engine*, Council*, BotAction). They hold the
//     Discord server's points and ranks, keyed by Discord ids rather than
//     member accounts, and are not part of the website's network
//
// Callers are responsible for authorization. Like purgeUser, this function
// will happily destroy everything for anyone who calls it.

// Children first, then their parents. Listed exhaustively against the schema
// rather than derived, so that adding a model to schema.prisma without adding
// it here is a visible omission rather than a silent survival — and
// purge-coverage.test.ts fails until it is added here or named as an exception.
//
// Keyed by Prisma model name so the test can read the list; object keys keep
// their insertion order, so the order below is the order of deletion.
const WIPES = {
  // Intrusion subsystem
  hackChallenge: () => db.hackChallenge.deleteMany({}),
  hackDuel: () => db.hackDuel.deleteMany({}),
  hackGrant: () => db.hackGrant.deleteMany({}),
  hackRun: () => db.hackRun.deleteMany({}),
  conductRecord: () => db.conductRecord.deleteMany({}),
  hackSanction: () => db.hackSanction.deleteMany({}),
  hackTool: () => db.hackTool.deleteMany({}),
  hackDrill: () => db.hackDrill.deleteMany({}),
  // Chaos Insurgency sieges
  ciSiegeChallenge: () => db.ciSiegeChallenge.deleteMany({}),
  ciSiegeSystem: () => db.ciSiegeSystem.deleteMany({}),
  ciLeak: () => db.ciLeak.deleteMany({}),
  ciSiege: () => db.ciSiege.deleteMany({}),
  ciCode: () => db.ciCode.deleteMany({}),
  // Anomaly files and everything hanging off them
  scpTestLog: () => db.scpTestLog.deleteMany({}),
  scpAccessGrant: () => db.scpAccessGrant.deleteMany({}),
  scpFile: () => db.scpFile.deleteMany({}),
  // Tickets
  ticketReply: () => db.ticketReply.deleteMany({}),
  ticket: () => db.ticket.deleteMany({}),
  // Forums
  forumPost: () => db.forumPost.deleteMany({}),
  forum: () => db.forum.deleteMany({}),
  // Invites
  inviteRedemption: () => db.inviteRedemption.deleteMany({}),
  inviteCode: () => db.inviteCode.deleteMany({}),
  // Correspondence and dossiers
  message: () => db.message.deleteMany({}),
  secureMessage: () => db.secureMessage.deleteMany({}),
  broadcast: () => db.broadcast.deleteMany({}),
  incidentReport: () => db.incidentReport.deleteMany({}),
  memberNote: () => db.memberNote.deleteMany({}),
  memberInfraction: () => db.memberInfraction.deleteMany({}),
  clearanceRequest: () => db.clearanceRequest.deleteMany({}),
  attachment: () => db.attachment.deleteMany({}),
  revision: () => db.revision.deleteMany({}),
  // Per-member state. The owner keeps their own notification settings; there
  // is no reason for a purge to reset their preferences.
  notification: () => db.notification.deleteMany({}),
  notificationPreference: (keepUserId: string) =>
    db.notificationPreference.deleteMany({
      where: { userId: { not: keepUserId } },
    }),
  // Ledgers. AuditLog goes too — a purge that left the old log standing
  // would be a half-measure — which is why the caller must write the record
  // of the purge itself only after this returns.
  auditLog: () => db.auditLog.deleteMany({}),
  authAttempt: () => db.authAttempt.deleteMany({}),
} satisfies Record<string, (keepUserId: string) => Promise<unknown>>;

export const PURGED_TABLES = Object.keys(WIPES);

export async function purgeSite(
  keepUserId: string
): Promise<{ models: number; usersDeleted: number }> {
  for (const wipe of Object.values(WIPES)) {
    await wipe(keepUserId);
  }

  const { count } = await db.user.deleteMany({
    where: { id: { not: keepUserId } },
  });

  return { models: PURGED_TABLES.length + 1, usersDeleted: count };
}
