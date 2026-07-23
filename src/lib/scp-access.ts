import { db } from "@/lib/db";

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
