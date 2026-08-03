import { db } from "@/lib/db";
import { authoringClearance } from "@/lib/clearance";

// Whether a member may read a given SCP file: either their clearance meets the
// file's requirement, or an unrevoked, unexpired temporary grant covers them.
//
// Lives here rather than inline on the detail page because the test-log
// actions need exactly the same gate — a researcher must not be able to append
// to (or read) a file they cannot open.
export async function canReadScpFile(
  user: { id: string; clearance: number },
  file: { id: string; clearanceRequired: number }
): Promise<boolean> {
  if (file.clearanceRequired <= user.clearance) return true;
  const grant = await db.scpAccessGrant.findFirst({
    where: {
      scpFileId: file.id,
      userId: user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return grant !== null;
}

// The write twin of canReadScpFile, for appending to or retracting from a
// file's test log.
//
// Filing a test result against an anomaly is authorship, so it resolves
// against the authoring rank: a terminal intrusion opens a document for
// reading and stops there. A staff-issued ScpAccessGrant still counts here —
// that one *is* real delegated authority, deliberately given to a named member
// for a named file.
export async function canWriteScpFile(
  user: { id: string; clearance: number; realClearance: number },
  file: { id: string; clearanceRequired: number }
): Promise<boolean> {
  return canReadScpFile(
    { id: user.id, clearance: authoringClearance(user) },
    file
  );
}
