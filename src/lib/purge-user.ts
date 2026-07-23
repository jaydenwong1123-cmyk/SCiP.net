import { db } from "@/lib/db";

// Physically remove a member and everything that must not outlive them.
//
// Lives here rather than in the admin action module so the single-account
// delete and the bulk delete run the exact same cleanup — there is no FK
// cascade under relationMode="prisma", so a divergence here leaves orphaned
// rows pointing at a user id that no longer exists.
//
// Callers are responsible for authorization: this function does no permission
// checking and will happily delete anyone handed to it.
export async function purgeUser(userId: string): Promise<void> {
  await db.message.deleteMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
  });
  // Their SCP files go with them — and so must anything hanging off those
  // files.
  const ownScpFiles = await db.scpFile.findMany({
    where: { authorId: userId },
    select: { id: true },
  });
  const ownScpFileIds = ownScpFiles.map((f) => f.id);
  if (ownScpFileIds.length > 0) {
    await db.scpTestLog.deleteMany({ where: { scpFileId: { in: ownScpFileIds } } });
    await db.scpAccessGrant.deleteMany({
      where: { scpFileId: { in: ownScpFileIds } },
    });
  }
  await db.scpFile.deleteMany({ where: { authorId: userId } });
  await db.broadcast.deleteMany({ where: { authorId: userId } });
  await db.incidentReport.deleteMany({ where: { authorId: userId } });
  await db.secureMessage.deleteMany({ where: { authorId: userId } });
  await db.clearanceRequest.deleteMany({ where: { userId } });
  await db.clearanceRequest.updateMany({
    where: { reviewedById: userId },
    data: { reviewedById: null },
  });
  await db.inviteCode.updateMany({
    where: { usedById: userId },
    data: { usedById: null },
  });
  await db.inviteRedemption.deleteMany({ where: { userId } });
  await db.memberNote.deleteMany({
    where: { OR: [{ subjectId: userId }, { authorId: userId }] },
  });
  // Tickets they opened go with them, replies and all. Replies they left on
  // *other* people's tickets stay: the thread has to remain readable, and
  // `authorName` is denormalized precisely so it survives this.
  const ownTickets = await db.ticket.findMany({
    where: { authorId: userId },
    select: { id: true },
  });
  await db.ticketReply.deleteMany({
    where: { ticketId: { in: ownTickets.map((t) => t.id) } },
  });
  await db.ticket.deleteMany({ where: { authorId: userId } });
  await db.ticketReply.updateMany({
    where: { authorId: userId },
    data: { authorId: null },
  });
  await db.ticket.updateMany({
    where: { closedById: userId },
    data: { closedById: null },
  });
  await db.scpAccessGrant.deleteMany({ where: { userId } });
  await db.scpAccessGrant.updateMany({
    where: { grantedById: userId },
    data: { grantedById: null },
  });
  await db.notification.deleteMany({ where: { userId } });
  await db.memberInfraction.deleteMany({ where: { subjectId: userId } });
  await db.memberInfraction.updateMany({
    where: { issuerId: userId },
    data: { issuerId: null },
  });
  // Test logs stay attached to the anomaly's file — `authorName` is
  // denormalized for exactly this case — but detach from the deleted account.
  await db.scpTestLog.updateMany({
    where: { authorId: userId },
    data: { authorId: null },
  });
  await db.attachment.updateMany({
    where: { uploaderId: userId },
    data: { uploaderId: null },
  });
  // Audit rows and revisions deliberately survive: both denormalize the
  // actor's name so the history stays readable, and detaching the id keeps
  // the record without dangling at a deleted user.
  await db.auditLog.updateMany({
    where: { actorId: userId },
    data: { actorId: null },
  });
  await db.revision.updateMany({
    where: { editorId: userId },
    data: { editorId: null },
  });
  await db.user.delete({ where: { id: userId } });
}
