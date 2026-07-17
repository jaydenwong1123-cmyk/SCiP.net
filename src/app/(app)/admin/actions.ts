"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/session";
import { generateInviteCode } from "@/lib/codeword";
import { MAX_CLEARANCE, MIN_CLEARANCE, OWNER_CLEARANCE } from "@/lib/clearance";

export async function setClearanceAction(formData: FormData) {
  await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const clearance = Number(formData.get("clearance"));

  if (!userId || !Number.isInteger(clearance)) return;
  if (clearance < MIN_CLEARANCE || clearance >= OWNER_CLEARANCE) return;

  await db.user.update({
    where: { id: userId, isOwner: false },
    data: { clearance },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function toggleCanPostScpAction(formData: FormData) {
  await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const canPostScp = formData.get("canPostScp") === "true";

  if (!userId) return;

  await db.user.update({
    where: { id: userId },
    data: { canPostScp },
  });

  revalidatePath("/admin");
}

export async function generateInviteCodeAction() {
  await requireOwner();
  await db.inviteCode.create({ data: { code: generateInviteCode() } });
  revalidatePath("/admin");
}

export async function revokeInviteCodeAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.inviteCode.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
}

export async function reviewClearanceRequestAction(formData: FormData) {
  const owner = await requireOwner();
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  const request = await db.clearanceRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "pending") return;

  await db.clearanceRequest.update({
    where: { id: requestId },
    data: {
      status: decision === "approve" ? "approved" : "denied",
      reviewedById: owner.id,
      reviewedAt: new Date(),
    },
  });

  if (decision === "approve" && request.requestedLevel <= MAX_CLEARANCE) {
    await db.user.update({
      where: { id: request.userId, isOwner: false },
      data: { clearance: request.requestedLevel },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/personnel");
  revalidatePath("/clearance-request");
}
