"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireStaff } from "@/lib/session";
import { MAX_CLEARANCE, MIN_CLEARANCE } from "@/lib/clearance";
import { DEFAULT_SEVERITY, isValidSeverity } from "@/lib/incident";
import { canCreateIncident, canEditIncident } from "@/lib/doc-permissions";
import {
  REVISION_ENTITIES,
  snapshotRevision,
  deleteRevisionsFor,
} from "@/lib/revisions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";

export async function createIncidentReportAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canCreateIncident(user)) {
    return { ok: false, error: "YOU DO NOT HAVE PERMISSION TO FILE INCIDENT REPORTS." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const clearanceRequired = Number(formData.get("clearanceRequired"));
  const severityRaw = String(formData.get("severity") ?? "");
  const severity = isValidSeverity(severityRaw) ? severityRaw : DEFAULT_SEVERITY;

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

  await db.incidentReport.create({
    data: {
      title: title.slice(0, 200),
      location: location.slice(0, 200),
      body: body.slice(0, 20000),
      severity,
      clearanceRequired,
      authorId: user.id,
    },
  });

  revalidatePath("/incidents");
  redirect("/incidents");
}

export async function updateIncidentReportAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "MISSING REPORT ID." };

  const existing = await db.incidentReport.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "REPORT NOT FOUND." };
  if (!canEditIncident(user, existing)) {
    return { ok: false, error: "YOU DO NOT HAVE PERMISSION TO EDIT THIS REPORT." };
  }
  if (existing.clearanceRequired > user.clearance) {
    return { ok: false, error: "INSUFFICIENT CLEARANCE FOR THIS REPORT." };
  }
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const title = String(formData.get("title") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const clearanceRequired = Number(formData.get("clearanceRequired"));
  const severityRaw = String(formData.get("severity") ?? "");
  const severity = isValidSeverity(severityRaw) ? severityRaw : existing.severity;

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

  const nextTitle = title.slice(0, 200);
  const nextLocation = location.slice(0, 200);
  const nextBody = body.slice(0, 20000);

  const unchanged =
    nextTitle === existing.title &&
    nextBody === existing.body &&
    nextLocation === existing.location &&
    severity === existing.severity &&
    clearanceRequired === existing.clearanceRequired;
  if (unchanged) redirect(`/incidents/${id}`);

  await snapshotRevision({
    entityType: REVISION_ENTITIES.incident,
    entityId: id,
    title: existing.title,
    body: existing.body,
    meta: {
      severity: existing.severity,
      location: existing.location,
      clearanceRequired: existing.clearanceRequired,
    },
    reason,
    editor: user,
  });

  await db.incidentReport.update({
    where: { id },
    data: {
      title: nextTitle,
      location: nextLocation,
      body: nextBody,
      severity,
      clearanceRequired,
      updatedAt: new Date(),
      revisionCount: { increment: 1 },
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.incidentEdited,
    actor: user,
    targetType: "incident",
    targetId: id,
    targetName: nextTitle,
    summary: reason
      ? `Revised incident "${nextTitle}": ${reason}`
      : `Revised incident "${nextTitle}"`,
  });

  revalidatePath("/incidents");
  revalidatePath(`/incidents/${id}`);
  redirect(`/incidents/${id}`);
}

export async function deleteIncidentReportAction(formData: FormData) {
  const actor = await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await db.incidentReport.findUnique({ where: { id } });
  if (!existing) return;

  await db.incidentReport.deleteMany({ where: { id } });
  await deleteRevisionsFor(REVISION_ENTITIES.incident, id);

  await logAudit({
    action: AUDIT_ACTIONS.incidentDeleted,
    actor,
    targetType: "incident",
    targetId: id,
    targetName: existing.title,
    summary: `Deleted incident report "${existing.title}"`,
  });

  revalidatePath("/incidents");
  redirect("/incidents");
}
