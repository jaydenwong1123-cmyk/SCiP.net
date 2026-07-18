"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, canAnnotateMembers } from "@/lib/session";

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

export async function deleteMemberNoteAction(formData: FormData) {
  const viewer = await requireUser();
  if (!canAnnotateMembers(viewer)) return;

  const noteId = String(formData.get("noteId") ?? "");
  if (!noteId) return;

  const note = await db.memberNote.findUnique({ where: { id: noteId } });
  if (!note) return;

  // Authors can delete their own notes; staff/admin/owner can delete any.
  const canDeleteAny = viewer.isOwner || viewer.isAdmin || viewer.isStaff;
  if (note.authorId !== viewer.id && !canDeleteAny) return;

  await db.memberNote.delete({ where: { id: noteId } });
  revalidatePath(`/personnel/${note.subjectId}`);
}
