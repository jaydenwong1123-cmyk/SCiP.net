"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

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
