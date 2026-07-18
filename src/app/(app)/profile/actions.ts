"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isOpenDepartment, isRestrictedDepartment } from "@/lib/departments";

export async function updateDepartmentAction(formData: FormData) {
  const user = await requireUser();
  const department = String(formData.get("department") ?? "");

  // Members may only self-assign open departments (or clear to none). If they
  // currently hold a staff-assigned restricted department, they can't change it.
  if (user.department && isRestrictedDepartment(user.department)) return;
  if (department !== "" && !isOpenDepartment(department)) return;

  await db.user.update({
    where: { id: user.id },
    data: { department: department === "" ? null : department },
  });

  revalidatePath("/profile");
  revalidatePath("/personnel");
  revalidatePath(`/personnel/${user.id}`);
}

export async function updatePersonalFileAction(
  _prevState: { ok: boolean } | null,
  formData: FormData
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const content = String(formData.get("personalFile") ?? "");

  await db.user.update({
    where: { id: user.id },
    data: { personalFile: content.slice(0, 20000) },
  });

  revalidatePath("/profile");
  revalidatePath(`/personnel/${user.id}`);
  return { ok: true };
}
