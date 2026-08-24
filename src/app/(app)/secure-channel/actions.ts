"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canAccessSecureChannel, authoringClearance } from "@/lib/clearance";
import {
  ATTACHMENT_ENTITIES,
  validateUpload,
  countUploads,
  MAX_ATTACHMENTS_PER_MESSAGE,
  storeAttachment,
  pruneExpiredAttachments,
} from "@/lib/attachments";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  consumeRateLimit,
  contentLimitError,
  MESSAGE_RULE,
  ATTACHMENT_RULE,
  CONTENT_SCOPES,
} from "@/lib/rate-limit";

export async function postSecureMessageAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  // Posting only. Reading the channel still honors the effective clearance —
  // an intrusion that reaches L-5 may listen in, but not speak.
  if (!canAccessSecureChannel(authoringClearance(user))) {
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

  // Two buckets, because a transmission carrying a file costs the database far
  // more than one carrying text. Both are checked before either is spent, so a
  // post that is going to be refused for its attachment does not first burn the
  // author's message slot.
  const messageLimit = await consumeRateLimit(
    CONTENT_SCOPES.message,
    user.id,
    MESSAGE_RULE
  );
  if (messageLimit.blocked) {
    return { ok: false, error: contentLimitError(messageLimit.retryAfterMs) };
  }
  if (file) {
    const uploadLimit = await consumeRateLimit(
      CONTENT_SCOPES.attachment,
      user.id,
      ATTACHMENT_RULE
    );
    if (uploadLimit.blocked) {
      return { ok: false, error: contentLimitError(uploadLimit.retryAfterMs) };
    }
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
