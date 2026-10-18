"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireAdminPowers } from "@/lib/session";
import {
  canPostBroadcast,
  authoringClearance,
  MIN_CLEARANCE,
  MAX_CLEARANCE,
} from "@/lib/clearance";
import { canEditBroadcast } from "@/lib/doc-permissions";
import {
  REVISION_ENTITIES,
  snapshotRevision,
  deleteRevisionsFor,
} from "@/lib/revisions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { parseScheduleInput } from "@/lib/broadcast-schedule";
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
import { systemOfflineError } from "@/lib/ci/lockdown";

// The audience a directive is aimed at: the minimum clearance needed to read
// it. A directive may be aimed no higher than the issuer's own authoring
// clearance — an intrusion grant or a "view as" simulation changes what you can
// read, never what you can broadcast — except that an unchanged value is always
// accepted, so an admin can amend the text of a directive aimed above their own
// rank without being forced to retarget it.
function parseAudience(
  raw: FormDataEntryValue | null,
  authorRank: number,
  unchangedFrom?: number
): { ok: true; rank: number } | { ok: false; error: string } {
  const rank = Number(raw);
  if (!Number.isInteger(rank) || rank < MIN_CLEARANCE || rank > MAX_CLEARANCE) {
    return { ok: false, error: "INVALID CLEARANCE LEVEL." };
  }
  if (rank > authorRank && rank !== unchangedFrom) {
    return {
      ok: false,
      error: "YOU CANNOT AIM A BROADCAST ABOVE YOUR OWN CLEARANCE LEVEL.",
    };
  }
  return { ok: true, rank };
}

export async function createBroadcastAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  // A section taken down by a siege refuses writes from anywhere, not only
  // from its own pages — see lib/ci/lockdown.ts.
  const offline = await systemOfflineError(user, "broadcasts");
  if (offline) return { ok: false, error: offline };
  if (!canPostBroadcast(authoringClearance(user))) {
    return { ok: false, error: "INSUFFICIENT CLEARANCE TO BROADCAST." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) {
    return { ok: false, error: "TITLE AND BODY ARE REQUIRED." };
  }
  const audience = parseAudience(
    formData.get("clearanceRequired"),
    authoringClearance(user)
  );
  if (!audience.ok) return { ok: false, error: audience.error };

  const redactCheck = checkRedactionAuthorization(`${title}\n${body}`, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(
        redactCheck.requiredRank,
        authoringClearance(user)
      ),
    };
  }

  const publishAt = parseScheduleInput(formData.get("publishAt"));
  const expiresAt = parseScheduleInput(formData.get("expiresAt"));
  if (publishAt === undefined || expiresAt === undefined) {
    return { ok: false, error: "INVALID SCHEDULE DATE." };
  }
  if (publishAt && expiresAt && expiresAt <= publishAt) {
    return { ok: false, error: "STAND-DOWN MUST BE AFTER THE PUBLISH TIME." };
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "STAND-DOWN TIME IS ALREADY IN THE PAST." };
  }

  const limit = await consumeRateLimit(
    CONTENT_SCOPES.document,
    user.id,
    CONTENT_RULE
  );
  if (limit.blocked) {
    return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  }

  await db.broadcast.create({
    data: {
      title: title.slice(0, 200),
      body: body.slice(0, 10000),
      clearanceRequired: audience.rank,
      authorId: user.id,
      publishAt,
      expiresAt,
    },
  });

  revalidatePath("/broadcasts");
  redirect("/broadcasts");
}

// Adjust an existing directive's window without touching its text, so
// extending or standing down a notice doesn't create a content revision.
export async function setBroadcastScheduleAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await db.broadcast.findUnique({ where: { id } });
  if (!existing || !canEditBroadcast(user, existing)) return;

  const publishAt = parseScheduleInput(formData.get("publishAt"));
  const expiresAt = parseScheduleInput(formData.get("expiresAt"));
  if (publishAt === undefined || expiresAt === undefined) return;
  if (publishAt && expiresAt && expiresAt <= publishAt) return;

  await db.broadcast.update({
    where: { id },
    data: { publishAt, expiresAt },
  });

  revalidatePath("/broadcasts");
}

export async function updateBroadcastAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "MISSING BROADCAST ID." };

  const existing = await db.broadcast.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "BROADCAST NOT FOUND." };
  if (!canEditBroadcast(user, existing)) {
    return {
      ok: false,
      error: "YOU DO NOT HAVE PERMISSION TO EDIT THIS BROADCAST.",
    };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!title || !body) {
    return { ok: false, error: "TITLE AND BODY ARE REQUIRED." };
  }

  const audience = parseAudience(
    formData.get("clearanceRequired"),
    authoringClearance(user),
    existing.clearanceRequired
  );
  if (!audience.ok) return { ok: false, error: audience.error };

  const redactCheck = checkRedactionAuthorization(`${title}\n${body}`, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(
        redactCheck.requiredRank,
        authoringClearance(user)
      ),
    };
  }

  const nextTitle = title.slice(0, 200);
  const nextBody = body.slice(0, 10000);
  if (
    nextTitle === existing.title &&
    nextBody === existing.body &&
    audience.rank === existing.clearanceRequired
  ) {
    redirect("/broadcasts");
  }

  const limit = await consumeRateLimit(
    CONTENT_SCOPES.document,
    user.id,
    CONTENT_RULE
  );
  if (limit.blocked) {
    return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  }

  await snapshotRevision({
    entityType: REVISION_ENTITIES.broadcast,
    entityId: id,
    title: existing.title,
    body: existing.body,
    meta: { clearanceRequired: existing.clearanceRequired },
    reason,
    editor: user,
  });

  await db.broadcast.update({
    where: { id },
    data: {
      title: nextTitle,
      body: nextBody,
      clearanceRequired: audience.rank,
      updatedAt: new Date(),
      revisionCount: { increment: 1 },
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.broadcastEdited,
    actor: user,
    targetType: "broadcast",
    targetId: id,
    targetName: nextTitle,
    summary: reason
      ? `Revised broadcast "${nextTitle}": ${reason}`
      : `Revised broadcast "${nextTitle}"`,
  });

  revalidatePath("/broadcasts");
  redirect("/broadcasts");
}

export async function deleteBroadcastAction(formData: FormData) {
  // Owner or admin may delete broadcasts.
  const actor = await requireAdminPowers();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await db.broadcast.findUnique({ where: { id } });
  if (!existing) return;

  await db.broadcast.deleteMany({ where: { id } });
  await deleteRevisionsFor(REVISION_ENTITIES.broadcast, id);

  await logAudit({
    action: AUDIT_ACTIONS.broadcastDeleted,
    actor,
    targetType: "broadcast",
    targetId: id,
    targetName: existing.title,
    summary: `Deleted broadcast "${existing.title}"`,
  });

  revalidatePath("/broadcasts");
}
