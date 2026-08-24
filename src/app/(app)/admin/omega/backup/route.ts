import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { needsSentinel } from "@/lib/sentinel";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { buildBackup, backupFilename } from "@/lib/backup";

// Whole-database export, root owner only.
//
// Deliberately placed under /admin/omega rather than somewhere neutral: the
// export and the purge are the same decision viewed from two sides, and a
// member standing in front of the destroy button should be standing in front
// of the export button too.
//
// GATING, and why it is spelled out here rather than reusing requireRootOwner:
// that helper redirects, which is the right behaviour for a page and the wrong
// one for a download — a browser following a 307 to /login would save the login
// page as a .json file. This answers 404 instead, matching the convention used
// by /attachments/[id] and by every notFound() denial in the app: a refusal
// must not confirm that the endpoint is there.
//
// The sentinel check is repeated for the reason given in lib/session.ts — a
// route handler never renders the (app) layout, so nothing else in this request
// has run it.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.suspended || !user.isOwner) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (await needsSentinel(user)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Attachment bytes are opt-in: they live in the database, and the dump is
  // assembled in memory before any of it is sent, so including them on a large
  // site is how this endpoint runs a serverless function out of heap. The CLI
  // (prisma/backup.ts) includes them by default, because it has a real machine
  // underneath it.
  const url = new URL(req.url);
  const includeAttachmentData = url.searchParams.get("attachments") === "1";

  let backup;
  try {
    backup = await buildBackup({ includeAttachmentData });
  } catch (err) {
    console.error("[backup] export failed", err);
    return new NextResponse("Export failed", { status: 500 });
  }

  // Audited like any other privileged read. Exporting the network is a bigger
  // act than reading one message log, and that one is already audited.
  await logAudit({
    action: AUDIT_ACTIONS.siteBackupExported,
    actor: user,
    targetType: "site",
    targetId: "backup",
    targetName: backupFilename(new Date(backup.meta.takenAt)),
    summary: `Exported a full network backup (${Object.values(
      backup.meta.counts
    ).reduce((a, b) => a + b, 0)} rows${
      includeAttachmentData ? ", including attachment data" : ""
    })`,
  });

  const body = JSON.stringify(backup, null, 2);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body, "utf8")),
      "Content-Disposition": `attachment; filename="${backupFilename(
        new Date(backup.meta.takenAt)
      )}"`,
      // This file is the entire database. It must never touch a shared cache,
      // and there is no version of it that is safe to reuse.
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
