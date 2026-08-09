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
//
// Callers are responsible for authorization. Like purgeUser, this function
// will happily destroy everything for anyone who calls it.
export async function purgeSite(
  keepUserId: string
): Promise<{ models: number; usersDeleted: number }> {
  // Children first, then their parents. Listed exhaustively against the schema
  // rather than derived, so that adding a model to schema.prisma without adding
  // it here is a visible omission rather than a silent survival.
  const wipes: Array<() => Promise<unknown>> = [
    // Intrusion subsystem
    () => db.hackChallenge.deleteMany({}),
    () => db.hackDuel.deleteMany({}),
    () => db.hackGrant.deleteMany({}),
    () => db.hackRun.deleteMany({}),
    // Anomaly files and everything hanging off them
    () => db.scpTestLog.deleteMany({}),
    () => db.scpAccessGrant.deleteMany({}),
    () => db.scpFile.deleteMany({}),
    // Tickets
    () => db.ticketReply.deleteMany({}),
    () => db.ticket.deleteMany({}),
    // Invites
    () => db.inviteRedemption.deleteMany({}),
    () => db.inviteCode.deleteMany({}),
    // Correspondence and dossiers
    () => db.message.deleteMany({}),
    () => db.secureMessage.deleteMany({}),
    () => db.broadcast.deleteMany({}),
    () => db.incidentReport.deleteMany({}),
    () => db.memberNote.deleteMany({}),
    () => db.memberInfraction.deleteMany({}),
    () => db.clearanceRequest.deleteMany({}),
    () => db.attachment.deleteMany({}),
    () => db.revision.deleteMany({}),
    // Per-member state. The owner keeps their own notification settings; there
    // is no reason for a purge to reset their preferences.
    () => db.notification.deleteMany({}),
    () =>
      db.notificationPreference.deleteMany({
        where: { userId: { not: keepUserId } },
      }),
    // Ledgers. AuditLog goes too — a purge that left the old log standing
    // would be a half-measure — which is why the caller must write the record
    // of the purge itself only after this returns.
    () => db.auditLog.deleteMany({}),
    () => db.authAttempt.deleteMany({}),
  ];

  for (const wipe of wipes) {
    await wipe();
  }

  const { count } = await db.user.deleteMany({
    where: { id: { not: keepUserId } },
  });

  return { models: wipes.length + 1, usersDeleted: count };
}
