"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { MAX_CLEARANCE, MIN_CLEARANCE } from "@/lib/clearance";

export async function createScpFileAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user.canPostScp) {
    return { ok: false, error: "YOU DO NOT HAVE PERMISSION TO POST SCP FILES." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const clearanceRequired = Number(formData.get("clearanceRequired"));

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

  await db.scpFile.create({
    data: {
      title: title.slice(0, 200),
      body: body.slice(0, 20000),
      clearanceRequired,
      authorId: user.id,
    },
  });

  revalidatePath("/scp");
  redirect("/scp");
}

export async function deleteScpFileAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.scpFile.deleteMany({ where: { id } });

  revalidatePath("/scp");
  redirect("/scp");
}
