import { db } from "@/lib/db";

// Whole-network export — the counterweight to lib/purge-site.ts.
//
// WHY THIS EXISTS: Turso holds the only copy of this site's data, and
// OMEGA AUTHORITY ships a one-click irreversible purge. A destroy control with
// no export path beside it is a foot-gun, not a feature. Every model that
// purgeSite() deletes is dumped here, so the two files are read as a pair —
// if you add a model to one, add it to the other.
//
// AUTHORIZATION IS THE CALLER'S JOB. Like purgeSite, this function will hand
// the entire database to anyone who calls it. The only callers are the
// root-owner-gated route handler and the CLI script, both of which say so.
//
// WHAT IS IN HERE, SAID PLAINLY: bcrypt password hashes, invite codes, the
// maintenance bypass code, unresolved puzzle SOLUTIONS, the run→member links
// that the counter-intel reveal ladder exists to keep hidden, and every private
// message on the site. A backup file is the single most sensitive artifact this
// application can produce. Treat it like the database itself, because it is.

// Bumped when the shape below changes in a way a restorer would care about.
export const BACKUP_FORMAT_VERSION = 1;

export type BackupOptions = {
  // Include Attachment.data (the file bytes) as base64.
  //
  // Off by default for the HTTP route: the bytes live IN the database, so a
  // site with a few hundred dossier photos produces a dump large enough to
  // exhaust a serverless function's memory, and it is built in memory before
  // any of it is sent. The CLI turns it on, because a backup that cannot
  // restore attachments is not really a backup.
  includeAttachmentData?: boolean;
};

export type BackupMeta = {
  formatVersion: number;
  takenAt: string;
  includesAttachmentData: boolean;
  counts: Record<string, number>;
};

export type Backup = {
  meta: BackupMeta;
  data: Record<string, unknown[]>;
};

// One entry per model in schema.prisma. Listed exhaustively rather than derived
// from the Prisma client's runtime metadata, for the same reason purgeSite()
// lists them: adding a model without adding it here should be a visible
// omission in a diff, not a table that silently stops being backed up.
//
// Attachment is handled separately below because of its Bytes column.
const TABLES = {
  user: () => db.user.findMany(),
  ticket: () => db.ticket.findMany(),
  ticketReply: () => db.ticketReply.findMany(),
  notification: () => db.notification.findMany(),
  notificationPreference: () => db.notificationPreference.findMany(),
  memberInfraction: () => db.memberInfraction.findMany(),
  memberNote: () => db.memberNote.findMany(),
  inviteCode: () => db.inviteCode.findMany(),
  inviteRedemption: () => db.inviteRedemption.findMany(),
  message: () => db.message.findMany(),
  scpFile: () => db.scpFile.findMany(),
  scpTestLog: () => db.scpTestLog.findMany(),
  scpAccessGrant: () => db.scpAccessGrant.findMany(),
  hackRun: () => db.hackRun.findMany(),
  hackDuel: () => db.hackDuel.findMany(),
  hackGrant: () => db.hackGrant.findMany(),
  hackChallenge: () => db.hackChallenge.findMany(),
  conductRecord: () => db.conductRecord.findMany(),
  broadcast: () => db.broadcast.findMany(),
  clearanceRequest: () => db.clearanceRequest.findMany(),
  secureMessage: () => db.secureMessage.findMany(),
  siteConfig: () => db.siteConfig.findMany(),
  incidentReport: () => db.incidentReport.findMany(),
  revision: () => db.revision.findMany(),
  auditLog: () => db.auditLog.findMany(),
  // AuthAttempt is deliberately NOT exported. It is a throttling ledger whose
  // rows are meaningless more than an hour after they are written, and it is
  // usually the largest table on the site. Restoring it would restore nothing
  // but stale lockouts.
} as const;

export type BackupTable = keyof typeof TABLES;

export const BACKUP_TABLES = Object.keys(TABLES) as BackupTable[];

/**
 * Read the whole database into a JSON-serializable snapshot.
 *
 * Sequential rather than concurrent on purpose: this runs against Turso over
 * the network, and firing twenty-five findMany() calls at once is a good way
 * to trip a connection limit on the exact operation you least want to fail.
 * A backup is allowed to be slow.
 */
export async function buildBackup(
  options: BackupOptions = {}
): Promise<Backup> {
  const includeAttachmentData = options.includeAttachmentData ?? false;

  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const rows = await TABLES[table]();
    data[table] = rows;
    counts[table] = rows.length;
  }

  // Attachments last and by hand: `data` is a Bytes column, which JSON cannot
  // represent. Base64 keeps the dump a single self-contained text file, at the
  // usual ~33% size cost.
  if (includeAttachmentData) {
    const rows = await db.attachment.findMany();
    data.attachment = rows.map((row) => ({
      ...row,
      data: Buffer.from(row.data).toString("base64"),
      dataEncoding: "base64",
    }));
    counts.attachment = rows.length;
  } else {
    // Metadata only. The rows are still listed so a restore knows what was
    // lost and a reader can see the omission rather than guess at it.
    const rows = await db.attachment.findMany({
      omit: { data: true },
    });
    data.attachment = rows.map((row) => ({ ...row, dataEncoding: "omitted" }));
    counts.attachment = rows.length;
  }

  return {
    meta: {
      formatVersion: BACKUP_FORMAT_VERSION,
      takenAt: new Date().toISOString(),
      includesAttachmentData: includeAttachmentData,
      counts,
    },
    data,
  };
}

/** `scip-net-backup-2026-08-24T09-14-02.json` — sortable, and filename-safe. */
export function backupFilename(takenAt = new Date()): string {
  const stamp = takenAt.toISOString().replace(/:/g, "-").replace(/\..+$/, "");
  return `scip-net-backup-${stamp}.json`;
}
