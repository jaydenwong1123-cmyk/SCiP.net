"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canAccessSecureChannel } from "@/lib/clearance";

export async function postSecureMessageAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!canAccessSecureChannel(user.clearance)) {
    return { ok: false, error: "CLEARANCE L-5 OR HIGHER REQUIRED." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { ok: false, error: "TRANSMISSION BODY REQUIRED." };
  }

  await db.secureMessage.create({
    data: { authorId: user.id, body: body.slice(0, 10000) },
  });

  revalidatePath("/secure-channel");
  return { ok: true };
}
