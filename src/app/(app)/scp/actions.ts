"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireStaff } from "@/lib/session";
import {
  canCreateScpFile,
  canEditScpFile,
  canLogScpTest,
  canDeleteScpTest,
} from "@/lib/doc-permissions";
import { MAX_CLEARANCE, MIN_CLEARANCE } from "@/lib/clearance";
import { canReadScpFile } from "@/lib/scp-access";
import { DEFAULT_CLASSIFICATION, isValidClassification } from "@/lib/classification";
import {
  REVISION_ENTITIES,
  snapshotRevision,
  deleteRevisionsFor,
} from "@/lib/revisions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  checkRedactionAuthorization,
  redactionAuthorizationError,
} from "@/lib/redact";

export async function createScpFileAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canCreateScpFile(user)) {
    return { ok: false, error: "YOU DO NOT HAVE PERMISSION TO POST SCP FILES." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const clearanceRequired = Number(formData.get("clearanceRequired"));
  const classificationRaw = String(formData.get("classification") ?? "");
  const classification = isValidClassification(classificationRaw)
    ? classificationRaw
    : DEFAULT_CLASSIFICATION;

  if (!title || !body) {
    return { ok: false, error: "TITLE AND BODY ARE REQUIRED." };
  }
  if (
    !Number.isInteger(clearanceRequired) ||
    clearanceRequired < MIN_CLEARANCE ||
    clearanceRequired > MAX_CLEARANCE
  ) {
    return { ok: false, error: "INVALID CLEARANCE LEVEL." };
  }
  if (clearanceRequired > user.clearance) {
    return {
      ok: false,
      error: "YOU CANNOT SET A CLEARANCE REQUIREMENT ABOVE YOUR OWN LEVEL.",
    };
  }
  const redactCheck = checkRedactionAuthorization(`${title}\n${body}`, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(redactCheck.requiredRank, user.clearance),
    };
  }

  await db.scpFile.create({
    data: {
      title: title.slice(0, 200),
      body: body.slice(0, 60000),
      clearanceRequired,
      classification,
      authorId: user.id,
    },
  });

  revalidatePath("/scp");
  redirect("/scp");
}

export async function updateScpFileAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "MISSING FILE ID." };

  const existing = await db.scpFile.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "FILE NOT FOUND." };
  if (!canEditScpFile(user, existing)) {
    return { ok: false, error: "YOU DO NOT HAVE PERMISSION TO EDIT THIS FILE." };
  }
  // An editor who cannot read the file at their clearance must not be able to
  // rewrite it either.
  if (existing.clearanceRequired > user.clearance) {
    return { ok: false, error: "INSUFFICIENT CLEARANCE FOR THIS FILE." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const clearanceRequired = Number(formData.get("clearanceRequired"));
  const classificationRaw = String(formData.get("classification") ?? "");
  const classification = isValidClassification(classificationRaw)
    ? classificationRaw
    : existing.classification;

  if (!title || !body) {
    return { ok: false, error: "TITLE AND BODY ARE REQUIRED." };
  }
  if (
    !Number.isInteger(clearanceRequired) ||
    clearanceRequired < MIN_CLEARANCE ||
    clearanceRequired > MAX_CLEARANCE
  ) {
    return { ok: false, error: "INVALID CLEARANCE LEVEL." };
  }
  if (clearanceRequired > user.clearance) {
    return {
      ok: false,
      error: "YOU CANNOT SET A CLEARANCE REQUIREMENT ABOVE YOUR OWN LEVEL.",
    };
  }
  const redactCheck = checkRedactionAuthorization(`${title}\n${body}`, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(redactCheck.requiredRank, user.clearance),
    };
  }

  const nextTitle = title.slice(0, 200);
  const nextBody = body.slice(0, 60000);

  // Nothing changed — skip the write so the history isn't padded with
  // identical revisions.
  const unchanged =
    nextTitle === existing.title &&
    nextBody === existing.body &&
    clearanceRequired === existing.clearanceRequired &&
    classification === existing.classification;
  if (unchanged) redirect(`/scp/${id}`);

  // Snapshot the outgoing version before overwriting it.
  await snapshotRevision({
    entityType: REVISION_ENTITIES.scp,
    entityId: id,
    title: existing.title,
    body: existing.body,
    meta: {
      classification: existing.classification,
      clearanceRequired: existing.clearanceRequired,
    },
    reason,
    editor: user,
  });

  await db.scpFile.update({
    where: { id },
    data: {
      title: nextTitle,
      body: nextBody,
      clearanceRequired,
      classification,
      updatedAt: new Date(),
      revisionCount: { increment: 1 },
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.scpEdited,
    actor: user,
    targetType: "scp",
    targetId: id,
    targetName: nextTitle,
    summary: reason
      ? `Revised "${nextTitle}": ${reason}`
      : `Revised "${nextTitle}"`,
  });

  revalidatePath("/scp");
  revalidatePath(`/scp/${id}`);
  redirect(`/scp/${id}`);
}

// How long a temporary grant may run, in whole days.
const MIN_GRANT_DAYS = 1;
const MAX_GRANT_DAYS = 30;

export async function grantScpAccessAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireStaff();
  const scpFileId = String(formData.get("scpFileId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const days = Number(formData.get("days"));

  if (!scpFileId || !userId) {
    return { ok: false, error: "MISSING FILE OR MEMBER." };
  }
  if (!Number.isInteger(days) || days < MIN_GRANT_DAYS || days > MAX_GRANT_DAYS) {
    return { ok: false, error: `DURATION MUST BE ${MIN_GRANT_DAYS}-${MAX_GRANT_DAYS} DAYS.` };
  }

  const [file, targetUser] = await Promise.all([
    db.scpFile.findUnique({ where: { id: scpFileId } }),
    db.user.findUnique({ where: { id: userId } }),
  ]);
  if (!file) return { ok: false, error: "FILE NOT FOUND." };
  if (!targetUser) return { ok: false, error: "MEMBER NOT FOUND." };
  if (targetUser.clearance >= file.clearanceRequired) {
    return { ok: false, error: "MEMBER ALREADY MEETS THE CLEARANCE REQUIREMENT." };
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await db.scpAccessGrant.create({
    data: {
      scpFileId,
      userId,
      grantedById: actor.id,
      expiresAt,
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.scpAccessGranted,
    actor,
    targetType: "scp",
    targetId: scpFileId,
    targetName: file.title,
    summary: `Granted ${targetUser.displayName ?? targetUser.email} temporary access to "${file.title}" for ${days} day(s)`,
  });

  revalidatePath(`/scp/${scpFileId}`);
  return { ok: true };
}

export async function revokeScpAccessAction(formData: FormData) {
  const actor = await requireStaff();
  const grantId = String(formData.get("grantId") ?? "");
  if (!grantId) return;

  const grant = await db.scpAccessGrant.findUnique({
    where: { id: grantId },
    include: { scpFile: true, user: true },
  });
  if (!grant) return;

  await db.scpAccessGrant.update({
    where: { id: grantId },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    action: AUDIT_ACTIONS.scpAccessRevoked,
    actor,
    targetType: "scp",
    targetId: grant.scpFileId,
    targetName: grant.scpFile.title,
    summary: `Revoked ${grant.user.displayName ?? grant.user.email}'s temporary access to "${grant.scpFile.title}"`,
  });

  revalidatePath(`/scp/${grant.scpFileId}`);
}

const MAX_TEST_FIELD = 8000;

export async function addScpTestLogAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const scpFileId = String(formData.get("scpFileId") ?? "");
  if (!scpFileId) return { ok: false, error: "MISSING FILE ID." };

  if (!canLogScpTest(user)) {
    return { ok: false, error: "YOU ARE NOT AUTHORIZED TO FILE TEST LOGS." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const file = await db.scpFile.findUnique({ where: { id: scpFileId } });
  if (!file) return { ok: false, error: "FILE NOT FOUND." };
  // Same gate as reading the document — no appending to a file you can't open.
  if (!(await canReadScpFile(user, file))) {
    return { ok: false, error: "INSUFFICIENT CLEARANCE FOR THIS FILE." };
  }

  const procedure = String(formData.get("procedure") ?? "").trim();
  const result = String(formData.get("result") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!procedure || !result) {
    return { ok: false, error: "PROCEDURE AND RESULT ARE REQUIRED." };
  }

  const redactCheck = checkRedactionAuthorization(
    `${procedure}\n${result}\n${notes}`,
    user
  );
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(redactCheck.requiredRank, user.clearance),
    };
  }

  // Sequence is per file and derived from the highest existing entry, so
  // retracting log 3 doesn't renumber 4 and 5 underneath the reader.
  const last = await db.scpTestLog.findFirst({
    where: { scpFileId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  await db.scpTestLog.create({
    data: {
      scpFileId,
      sequence: (last?.sequence ?? 0) + 1,
      procedure: procedure.slice(0, MAX_TEST_FIELD),
      result: result.slice(0, MAX_TEST_FIELD),
      notes: notes.slice(0, MAX_TEST_FIELD),
      authorId: user.id,
      authorName: user.displayName ?? user.email,
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.scpTestLogged,
    actor: user,
    targetType: "scp",
    targetId: scpFileId,
    targetName: file.title,
    summary: `Filed test log ${(last?.sequence ?? 0) + 1} on "${file.title}"`,
  });

  revalidatePath(`/scp/${scpFileId}`);
  return { ok: true };
}

export async function deleteScpTestLogAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("logId") ?? "");
  if (!id) return;

  const log = await db.scpTestLog.findUnique({
    where: { id },
    include: { scpFile: { select: { id: true, title: true, clearanceRequired: true } } },
  });
  if (!log) return;
  if (!canDeleteScpTest(user, log)) return;
  if (!(await canReadScpFile(user, log.scpFile))) return;

  await db.scpTestLog.deleteMany({ where: { id } });

  await logAudit({
    action: AUDIT_ACTIONS.scpTestDeleted,
    actor: user,
    targetType: "scp",
    targetId: log.scpFileId,
    targetName: log.scpFile.title,
    summary: `Retracted test log ${log.sequence} on "${log.scpFile.title}"`,
  });

  revalidatePath(`/scp/${log.scpFileId}`);
}

export async function deleteScpFileAction(formData: FormData) {
  const actor = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await db.scpFile.findUnique({ where: { id } });
  if (!existing) return;

  // No FK cascade under relationMode="prisma": the file's test logs and access
  // grants have to go with it explicitly.
  await db.scpTestLog.deleteMany({ where: { scpFileId: id } });
  await db.scpAccessGrant.deleteMany({ where: { scpFileId: id } });
  await db.scpFile.deleteMany({ where: { id } });
  await deleteRevisionsFor(REVISION_ENTITIES.scp, id);

  await logAudit({
    action: AUDIT_ACTIONS.scpDeleted,
    actor,
    targetType: "scp",
    targetId: id,
    targetName: existing.title,
    summary: `Deleted SCP file "${existing.title}"`,
  });

  revalidatePath("/scp");
  redirect("/scp");
}
