"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  canCreateForum,
  authoringClearance,
  MIN_CLEARANCE,
  MAX_CLEARANCE,
  clearanceLabel,
} from "@/lib/clearance";
import { canDeleteForum } from "@/lib/forums";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  checkRedactionAuthorization,
  redactionAuthorizationError,
} from "@/lib/redact";
import {
  consumeRateLimit,
  contentLimitError,
  CONTENT_RULE,
  CONTENT_SCOPES,
} from "@/lib/rate-limit";

export async function createForumAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canCreateForum(authoringClearance(user))) {
    return { ok: false, error: "CLEARANCE L-5 OR HIGHER REQUIRED TO OPEN A FORUM." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const minClearance = parseInt(String(formData.get("minClearance") ?? ""), 10);
  if (!title) {
    return { ok: false, error: "TITLE IS REQUIRED." };
  }
  if (
    !Number.isInteger(minClearance) ||
    minClearance < MIN_CLEARANCE ||
    minClearance > MAX_CLEARANCE
  ) {
    return { ok: false, error: "INVALID CLEARANCE LEVEL." };
  }
  // A forum may not be pitched above the clearance of the member opening it.
  if (minClearance > authoringClearance(user)) {
    return {
      ok: false,
      error: `YOU CANNOT SET A REQUIREMENT ABOVE YOUR OWN CLEARANCE (${clearanceLabel(
        authoringClearance(user)
      )}).`,
    };
  }

  const redactCheck = checkRedactionAuthorization(`${title}\n${description}`, user);
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
    CONTENT_SCOPES.document,
    user.id,
    CONTENT_RULE
  );
  if (limit.blocked) {
    return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  }

  const forum = await db.forum.create({
    data: {
      title: title.slice(0, 200),
      description: description.slice(0, 2000),
      minClearance,
      creatorId: user.id,
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.forumCreated,
    actor: user,
    targetType: "forum",
    targetId: forum.id,
    targetName: forum.title,
    summary: `Opened forum "${forum.title}" (${clearanceLabel(minClearance)}+)`,
  });

  revalidatePath("/forums");
  redirect(`/forums/${forum.id}`);
}

export async function deleteForumAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await db.forum.findUnique({ where: { id } });
  if (!existing || !canDeleteForum(user, existing)) return;

  await db.forumPost.deleteMany({ where: { forumId: id } });
  await db.forum.delete({ where: { id } });

  await logAudit({
    action: AUDIT_ACTIONS.forumDeleted,
    actor: user,
    targetType: "forum",
    targetId: id,
    targetName: existing.title,
    summary: `Deleted forum "${existing.title}"`,
  });

  revalidatePath("/forums");
  redirect("/forums");
}
