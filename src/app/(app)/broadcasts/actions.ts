"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canPostBroadcast } from "@/lib/clearance";

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
