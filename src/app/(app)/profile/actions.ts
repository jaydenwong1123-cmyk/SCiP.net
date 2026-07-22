"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  requireUser,
  hasOwnerPowers,
  canEditAnyPersonalFile,
} from "@/lib/session";
import {
  isOpenDepartment,
  isRestrictedDepartment,
  isValidDepartment,
} from "@/lib/departments";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  checkRedactionAuthorization,
  redactionAuthorizationError,
} from "@/lib/redact";

export async function updateDepartmentAction(formData: FormData) {
  const user = await requireUser();
  const department = String(formData.get("department") ?? "");

  // Owner-level personnel may self-assign any valid department (or clear to
  // none), bypassing the member restrictions below.
  if (hasOwnerPowers(user)) {
    if (department !== "" && !isValidDepartment(department)) return;
  } else {
    // Members may only self-assign open departments (or clear to none). If they
    // currently hold a staff-assigned restricted department, they can't change it.
    if (user.department && isRestrictedDepartment(user.department)) return;
    if (department !== "" && !isOpenDepartment(department)) return;
  }

  await db.user.update({
    where: { id: user.id },
    data: { department: department === "" ? null : department },
  });

  revalidatePath("/profile");
  revalidatePath("/personnel");
  revalidatePath(`/personnel/${user.id}`);
}

export async function updatePersonalFileAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (findNonAsciiFormField(formData)) return { ok: false, error: NON_ASCII_ERROR };
  const content = String(formData.get("personalFile") ?? "");

  // A member always edits their own file. RAISA (and staff) may also edit
  // another member's file by passing that member's id.
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const targetId = subjectId || user.id;
  if (targetId !== user.id && !canEditAnyPersonalFile(user)) {
    return { ok: false, error: "NOT AUTHORIZED TO EDIT THIS FILE." };
  }
  if (targetId !== user.id) {
    const subject = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!subject) return { ok: false, error: "MEMBER NOT FOUND." };
  }

  const redactCheck = checkRedactionAuthorization(content, user);
  if (!redactCheck.ok) {
    return {
      ok: false,
      error: redactionAuthorizationError(redactCheck.requiredRank, user.clearance),
    };
  }

  await db.user.update({
    where: { id: targetId },
    data: { personalFile: content.slice(0, 20000) },
  });

  revalidatePath("/profile");
  revalidatePath(`/personnel/${targetId}`);
  return { ok: true };
}
