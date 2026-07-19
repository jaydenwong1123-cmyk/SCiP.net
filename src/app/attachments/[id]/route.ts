import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccessSecureChannel } from "@/lib/clearance";
import {
  ATTACHMENT_ENTITIES,
  PERSONNEL_ATTACH_CLEARANCE,
  pruneExpiredAttachments,
} from "@/lib/attachments";

// Serves attachment bytes behind a clearance check.
//
// This is the only path that reads the `data` column, and it is the security
// boundary for attachments: the id alone is not authorization. A viewer who
// isn't cleared for the attachment's context gets a 404 rather than a 403, so
// the endpoint cannot be used to probe which attachments exist.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.suspended) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;

  const attachment = await db.attachment.findUnique({ where: { id } });

  // Expired attachments are treated as gone even if the sweeper hasn't
  // physically deleted the row yet.
  if (!attachment || attachment.expiresAt.getTime() <= Date.now()) {
    await pruneExpiredAttachments();
    return new NextResponse("Not found", { status: 404 });
  }

  const allowed =
    attachment.entityType === ATTACHMENT_ENTITIES.secure
      ? canAccessSecureChannel(user.clearance)
      : attachment.entityType === ATTACHMENT_ENTITIES.personnel
        ? user.clearance >= PERSONNEL_ATTACH_CLEARANCE
        : false;

  if (!allowed) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = new Uint8Array(attachment.data);

  return new NextResponse(body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(body.byteLength),
      // The stored mime type is derived from verified magic bytes, but nosniff
      // keeps a browser from second-guessing it regardless.
      "X-Content-Type-Options": "nosniff",
      // Never render an attachment as a top-level document.
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
      // Private: responses depend on the viewer's clearance and must never be
      // held in a shared cache. Short client-side reuse is fine so a page with
      // several images doesn't refetch each one.
      "Cache-Control": "private, max-age=300, must-revalidate",
    },
  });
}
