"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, canAnnotateMembers, hasStaffPowers } from "@/lib/session";
import {
  ATTACHMENT_ENTITIES,
  PERSONNEL_ATTACH_CLEARANCE,
  validateUpload,
  storeAttachment,
  pruneExpiredAttachments,
} from "@/lib/attachments";

export async function addMemberNoteAction(formData: FormData) {
  const author = await requireUser();
  if (!canAnnotateMembers(author)) return;

  const subjectId = String(formData.get("subjectId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const flagged = formData.get("flagged") === "true";
  if (!subjectId || !body) return;

  // Can't annotate yourself; subject must exist.
  if (subjectId === author.id) return;
  const subject = await db.user.findUnique({ where: { id: subjectId } });
  if (!subject) return;

  await db.memberNote.create({
    data: {
      subjectId,
      authorId: author.id,
      body: body.slice(0, 5000),
      flagged,
    },
  });

  revalidatePath(`/personnel/${subjectId}`);
}

// Attach an image to a member's dossier. Restricted to L-4 and above — the
// same bar the serving route enforces when handing the bytes back, so a file
// can never be attached by someone whose peers cannot view it.
export async function addPersonnelAttachmentAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (user.clearance < PERSONNEL_ATTACH_CLEARANCE) {
    return { ok: false, error: "CLEARANCE L-4 OR HIGHER REQUIRED." };
  }

  const subjectId = String(formData.get("subjectId") ?? "");
  if (!subjectId) return { ok: false, error: "MISSING SUBJECT." };

  const subject = await db.user.findUnique({ where: { id: subjectId } });
  if (!subject) return { ok: false, error: "SUBJECT NOT FOUND." };

  const result = await validateUpload(formData.get("attachment"));
  if (!result.ok) return { ok: false, error: result.error };

  await storeAttachment({
    entityType: ATTACHMENT_ENTITIES.personnel,
    entityId: subjectId,
    file: result.file,
    uploader: user,
  });

  await pruneExpiredAttachments();

  revalidatePath(`/personnel/${subjectId}`);
  return { ok: true };
}

export async function deletePersonnelAttachmentAction(formData: FormData) {
  const user = await requireUser();
  if (user.clearance < PERSONNEL_ATTACH_CLEARANCE) return;

  const attachmentId = String(formData.get("attachmentId") ?? "");
  if (!attachmentId) return;

  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, entityId: true, entityType: true, uploaderId: true },
  });
  if (!attachment || attachment.entityType !== ATTACHMENT_ENTITIES.personnel) {
    return;
  }

  // Uploaders may remove their own; staff may remove any.
  if (attachment.uploaderId !== user.id && !hasStaffPowers(user)) return;

  await db.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/personnel/${attachment.entityId}`);
}

export async function deleteMemberNoteAction(formData: FormData) {
  const viewer = await requireUser();
  if (!canAnnotateMembers(viewer)) return;

  const noteId = String(formData.get("noteId") ?? "");
  if (!noteId) return;

  const note = await db.memberNote.findUnique({ where: { id: noteId } });
  if (!note) return;

  // Authors can delete their own notes; staff/admin/owner can delete any.
  const canDeleteAny = hasStaffPowers(viewer);
  if (note.authorId !== viewer.id && !canDeleteAny) return;

  await db.memberNote.delete({ where: { id: noteId } });
  revalidatePath(`/personnel/${note.subjectId}`);
}
