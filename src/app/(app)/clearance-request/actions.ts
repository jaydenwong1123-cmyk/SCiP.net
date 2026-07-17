"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { MAX_CLEARANCE, MIN_CLEARANCE } from "@/lib/clearance";

export async function createClearanceRequestAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const requestedLevel = Number(formData.get("requestedLevel"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (
    !Number.isInteger(requestedLevel) ||
    requestedLevel < MIN_CLEARANCE ||
    requestedLevel > MAX_CLEARANCE
  ) {
    return { ok: false, error: "INVALID CLEARANCE LEVEL." };
  }
  if (requestedLevel <= user.clearance) {
    return { ok: false, error: "REQUESTED LEVEL MUST BE ABOVE YOUR CURRENT CLEARANCE." };
  }
  if (!reason) {
    return { ok: false, error: "REASON IS REQUIRED." };
  }

  const existingPending = await db.clearanceRequest.findFirst({
    where: { userId: user.id, status: "pending" },
  });
  if (existingPending) {
    return { ok: false, error: "YOU ALREADY HAVE A PENDING REQUEST." };
  }

  await db.clearanceRequest.create({
    data: {
      userId: user.id,
      requestedLevel,
      reason: reason.slice(0, 2000),
    },
  });

  revalidatePath("/clearance-request");
  redirect("/clearance-request");
}
