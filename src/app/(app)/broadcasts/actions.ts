"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireAdminPowers } from "@/lib/session";
import { canPostBroadcast } from "@/lib/clearance";
import { canEditBroadcast } from "@/lib/doc-permissions";
import {
  REVISION_ENTITIES,
  snapshotRevision,
  deleteRevisionsFor,
} from "@/lib/revisions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function createBroadcastAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canPostBroadcast(user.clearance)) {
    return { ok: false, error: "INSUFFICIENT CLEARANCE TO BROADCAST." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) {
    return { ok: false, error: "TITLE AND BODY ARE REQUIRED." };
  }

  await db.broadcast.create({
    data: {
      title: title.slice(0, 200),
      body: body.slice(0, 10000),
      authorId: user.id,
    },
  });

  revalidatePath("/broadcasts");
  redirect("/broadcasts");
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

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!title || !body) {
    return { ok: false, error: "TITLE AND BODY ARE REQUIRED." };
  }

  const nextTitle = title.slice(0, 200);
  const nextBody = body.slice(0, 10000);
  if (nextTitle === existing.title && nextBody === existing.body) {
    redirect("/broadcasts");
  }

  await snapshotRevision({
    entityType: REVISION_ENTITIES.broadcast,
    entityId: id,
    title: existing.title,
    body: existing.body,
    meta: {},
    reason,
    editor: user,
  });

  await db.broadcast.update({
    where: { id },
    data: {
      title: nextTitle,
      body: nextBody,
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
