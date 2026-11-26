"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  canAccessForum,
  canDeleteForumPost,
  canEditForumPost,
  isForumReactionKind,
} from "@/lib/forums";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import { authoringClearance } from "@/lib/clearance";
import {
  checkRedactionAuthorization,
  redactionAuthorizationError,
  redactToText,
} from "@/lib/redact";
import {
  consumeRateLimit,
  contentLimitError,
  MESSAGE_RULE,
  REACTION_RULE,
  CONTENT_SCOPES,
} from "@/lib/rate-limit";
import { getMentionCandidates, resolveMentionedUsers } from "@/lib/mentions";
import {
  createNotifications,
  NOTIFICATION_TYPES,
} from "@/lib/notifications";

type FormState = { ok: boolean; error?: string } | null;

// Tell the people with a stake in a thread that it moved.
//
// Two audiences: members named with an @mention, and everyone else who opened
// the topic or has posted in it. Both are narrowed to members who can open the
// topic RIGHT NOW (clearance at or above its floor, not suspended), because the
// alert names the topic and a member below the floor is not supposed to know it
// exists.
//
// The title and the mention scan both go through redactToText at the topic's
// own floor, so text hidden above that floor is neither quoted in an alert nor
// allowed to trigger one.
async function notifyForumActivity(
  forum: { id: string; title: string; minClearance: number; creatorId: string },
  author: { id: string; displayName: string | null },
  body: string
): Promise<void> {
  const [posters, candidates] = await Promise.all([
    db.forumPost.findMany({
      where: { forumId: forum.id, authorId: { not: null } },
      distinct: ["authorId"],
      select: { authorId: true },
    }),
    getMentionCandidates(),
  ]);

  const visibleBody = redactToText(body, forum.minClearance);
  const mentionedIds = resolveMentionedUsers(visibleBody, candidates)
    .map((m) => m.id)
    .filter((id) => id !== author.id);
  const participantIds = [forum.creatorId, ...posters.map((p) => p.authorId!)]
    .filter((id) => id !== author.id)
    .filter((id) => !mentionedIds.includes(id));

  const eligible = new Set(
    (
      await db.user.findMany({
        where: {
          id: { in: [...mentionedIds, ...participantIds] },
          clearance: { gte: forum.minClearance },
          suspended: false,
          isInsurgent: false,
        },
        select: { id: true },
      })
    ).map((u) => u.id)
  );

  const name = author.displayName ?? "A member";
  const title = redactToText(forum.title, forum.minClearance);
  const link = `/forums/${forum.id}`;

  await Promise.all([
    createNotifications({
      userIds: mentionedIds.filter((id) => eligible.has(id)),
      type: NOTIFICATION_TYPES.mention,
      body: `${name} mentioned you in the forum: ${title}`,
      link,
    }),
    createNotifications({
      userIds: participantIds.filter((id) => eligible.has(id)),
      type: NOTIFICATION_TYPES.forum,
      body: `${name} replied in the forum: ${title}`,
      link,
      // One alert per thread until it is read, however many replies land.
      skipIfUnread: true,
    }),
  ]);
}

export async function postForumMessageAction(
  _prevState: FormState,
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

  const redactCheck = checkRedactionAuthorization(body, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(
        redactCheck.requiredRank,
        authoringClearance(user)
      ),
    };
  }

  const limit = await consumeRateLimit(
    CONTENT_SCOPES.message,
    user.id,
    MESSAGE_RULE
  );
  if (limit.blocked) {
    return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  }

  const stored = body.slice(0, 10000);
  await db.forumPost.create({
    data: {
      forumId,
      authorId: user.id,
      authorName: user.displayName ?? user.email,
      body: stored,
    },
  });

  // The post is already saved. A failure to fan out alerts must not turn a
  // successful post into an error the member would retry.
  try {
    await notifyForumActivity(forum, user, stored);
  } catch {
    // Alerts are best-effort.
  }

  revalidatePath(`/forums/${forumId}`);
  revalidatePath("/forums");
  return { ok: true };
}

// Amend your own post. The same checks as posting, minus the rate limit: an
// edit creates no new row and sends no alerts.
export async function editForumPostAction(
  _prevState: FormState,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "MISSING POST ID." };

  const post = await db.forumPost.findUnique({
    where: { id },
    include: { forum: true },
  });
  if (!post || !canAccessForum(user, post.forum)) {
    return { ok: false, error: "POST NOT FOUND." };
  }
  if (!canEditForumPost(user, post)) {
    return { ok: false, error: "ONLY THE AUTHOR MAY AMEND A POST." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "MESSAGE BODY IS REQUIRED." };

  const redactCheck = checkRedactionAuthorization(body, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(
        redactCheck.requiredRank,
        authoringClearance(user)
      ),
    };
  }

  const stored = body.slice(0, 10000);
  if (stored !== post.body) {
    await db.forumPost.update({
      where: { id },
      data: { body: stored, editedAt: new Date() },
    });
  }

  revalidatePath(`/forums/${post.forumId}`);
  return { ok: true };
}

// Add the reaction if the member has not left it, remove it if they have.
export async function toggleForumReactionAction(formData: FormData) {
  const user = await requireUser();
  const postId = String(formData.get("postId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!postId || !isForumReactionKind(kind)) return;

  const post = await db.forumPost.findUnique({
    where: { id: postId },
    include: { forum: true },
  });
  if (!post || !canAccessForum(user, post.forum)) return;

  const key = { postId_userId_kind: { postId, userId: user.id, kind } };
  const existing = await db.forumReaction.findUnique({ where: key });
  if (existing) {
    await db.forumReaction.delete({ where: key });
  } else {
    const limit = await consumeRateLimit(
      CONTENT_SCOPES.reaction,
      user.id,
      REACTION_RULE
    );
    if (limit.blocked) return;
    await db.forumReaction.create({ data: { postId, userId: user.id, kind } });
  }

  revalidatePath(`/forums/${post.forumId}`);
}

export async function deleteForumPostAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const forumId = String(formData.get("forumId") ?? "");
  if (!id || !forumId) return;

  const post = await db.forumPost.findUnique({ where: { id } });
  if (!post || post.forumId !== forumId) return;
  if (!canDeleteForumPost(user, post)) return;

  await db.forumReaction.deleteMany({ where: { postId: id } });
  await db.forumPost.delete({ where: { id } });
  revalidatePath(`/forums/${forumId}`);
  revalidatePath("/forums");
}
