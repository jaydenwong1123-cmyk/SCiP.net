"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canAccessSecureChannel } from "@/lib/clearance";
import {
  ATTACHMENT_ENTITIES,
  validateUpload,
  countUploads,
  MAX_ATTACHMENTS_PER_MESSAGE,
  storeAttachment,
  pruneExpiredAttachments,
} from "@/lib/attachments";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";

export async function postSecureMessageAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canAccessSecureChannel(user.clearance)) {
    return { ok: false, error: "CLEARANCE L-5 OR HIGHER REQUIRED." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const body = String(formData.get("body") ?? "").trim();
  const upload = formData.get("attachment");
  const hasUpload = upload instanceof File && upload.size > 0;

  // A transmission needs to carry something — text, an image, or both.
  if (!body && !hasUpload) {
    return { ok: false, error: "TRANSMISSION BODY OR ATTACHMENT REQUIRED." };
  }

  if (countUploads(formData) > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, error: "ONE ATTACHMENT PER TRANSMISSION." };
  }

  // Validate the upload before writing the message, so a rejected file doesn't
  // leave a stray transmission behind.
  let file = null;
  if (hasUpload) {
    const result = await validateUpload(upload);
    if (!result.ok) return { ok: false, error: result.error };
    file = result.file;
  }

  const message = await db.secureMessage.create({
    data: { authorId: user.id, body: body.slice(0, 10000) },
  });

  if (file) {
    await storeAttachment({
      entityType: ATTACHMENT_ENTITIES.secure,
      entityId: message.id,
      file,
      uploader: user,
    });
  }

  await pruneExpiredAttachments();

  revalidatePath("/secure-channel");
  return { ok: true };
}
