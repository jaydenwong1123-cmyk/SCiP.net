"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canAccessForum, canDeleteForumPost } from "@/lib/forums";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  consumeRateLimit,
  contentLimitError,
  MESSAGE_RULE,
  CONTENT_SCOPES,
} from "@/lib/rate-limit";

export async function postForumMessageAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const forumId = String(formData.get("forumId") ?? "");
  if (!forumId) return { ok: false, error: "MISSING FORUM ID." };

  const forum = await db.forum.findUnique({ where: { id: forumId } });
  if (!forum) return { ok: false, error: "FORUM NOT FOUND." };
  if (!canAccessForum(user, forum)) {
    return { ok: false, error: "INSUFFICIENT CLEARANCE TO POST HERE." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { ok: false, error: "MESSAGE BODY IS REQUIRED." };
  }

  const limit = await consumeRateLimit(
    CONTENT_SCOPES.message,
    user.id,
    MESSAGE_RULE
  );
  if (limit.blocked) {
    return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  }

  await db.forumPost.create({
    data: {
      forumId,
      authorId: user.id,
      authorName: user.displayName ?? user.email,
      body: body.slice(0, 10000),
    },
  });

  revalidatePath(`/forums/${forumId}`);
  return { ok: true };
}

export async function deleteForumPostAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const forumId = String(formData.get("forumId") ?? "");
  if (!id || !forumId) return;

  const post = await db.forumPost.findUnique({ where: { id } });
  if (!post || post.forumId !== forumId) return;
  if (!canDeleteForumPost(user, post)) return;

  await db.forumPost.delete({ where: { id } });
  revalidatePath(`/forums/${forumId}`);
}
