"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireStaff } from "@/lib/session";
import { MAX_CLEARANCE, MIN_CLEARANCE } from "@/lib/clearance";
import { DEFAULT_SEVERITY, isValidSeverity } from "@/lib/incident";

export async function createIncidentReportAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

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

export async function deleteIncidentReportAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.incidentReport.deleteMany({ where: { id } });

  revalidatePath("/incidents");
  redirect("/incidents");
}
