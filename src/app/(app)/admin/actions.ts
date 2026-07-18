"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  requireOwner,
  requireAdminPowers,
  requireStaff,
} from "@/lib/session";
import { generateInviteCode } from "@/lib/codeword";
import { MAX_CLEARANCE, MIN_CLEARANCE, OWNER_CLEARANCE } from "@/lib/clearance";
import { isValidDepartment } from "@/lib/departments";

export async function setClearanceAction(formData: FormData) {
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const clearance = Number(formData.get("clearance"));

  if (!userId || !Number.isInteger(clearance)) return;
  if (clearance < MIN_CLEARANCE || clearance > OWNER_CLEARANCE) return;

  // Only owner/admin may grant the top clearance (L-OMNI). Staff cap below it.
  const canGrantTop = actor.isOwner || actor.isAdmin;
  if (clearance >= OWNER_CLEARANCE && !canGrantTop) return;

  await db.user.update({
    where: { id: userId, isOwner: false },
    data: { clearance },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setDisplayNameAction(formData: FormData) {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!userId || !displayName) return;

  await db.user.update({
    where: { id: userId },
    data: { displayName: displayName.slice(0, 60) },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setOwnDisplayNameAction(formData: FormData) {
  const owner = await requireOwner();
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;

  await db.user.update({
    where: { id: owner.id },
    data: { displayName: displayName.slice(0, 60) },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setOwnClearanceAction(formData: FormData) {
  const owner = await requireOwner();
  const clearance = Number(formData.get("clearance"));
  if (!Number.isInteger(clearance)) return;
  if (clearance < MIN_CLEARANCE || clearance > OWNER_CLEARANCE) return;

  await db.user.update({
    where: { id: owner.id },
    data: { clearance },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setMemberDepartmentAction(formData: FormData) {
  // Staff and above may assign any department, including restricted ones.
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const department = String(formData.get("department") ?? "");
  if (!userId) return;
  if (department !== "" && !isValidDepartment(department)) return;

  await db.user.update({
    where: { id: userId },
    data: { department: department === "" ? null : department },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function toggleCanPostScpAction(formData: FormData) {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const canPostScp = formData.get("canPostScp") === "true";

  if (!userId) return;

  await db.user.update({
    where: { id: userId },
    data: { canPostScp },
  });

  revalidatePath("/admin");
}

export async function toggleStaffAction(formData: FormData) {
  // Owner or admin may grant/revoke the Staff role.
  await requireAdminPowers();
  const userId = String(formData.get("userId") ?? "");
  const isStaff = formData.get("isStaff") === "true";

  if (!userId) return;

  await db.user.update({
    where: { id: userId, isOwner: false },
    data: { isStaff },
  });

  revalidatePath("/admin");
}

export async function toggleAdminAction(formData: FormData) {
  // Only the owner may grant or revoke the owner-level Admin role.
  await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const isAdmin = formData.get("isAdmin") === "true";

  if (!userId) return;

  await db.user.update({
    where: { id: userId, isOwner: false },
    data: { isAdmin },
  });

  revalidatePath("/admin");
}

export async function deleteAccountAction(formData: FormData) {
  const actor = await requireAdminPowers();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actor.id) return;

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.isOwner) return; // never delete the owner

  // No FK cascade under relationMode="prisma": clean up related rows manually.
  await db.message.deleteMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
  });
  await db.scpFile.deleteMany({ where: { authorId: userId } });
  await db.broadcast.deleteMany({ where: { authorId: userId } });
  await db.clearanceRequest.deleteMany({ where: { userId } });
  await db.clearanceRequest.updateMany({
    where: { reviewedById: userId },
    data: { reviewedById: null },
  });
  await db.inviteCode.updateMany({
    where: { usedById: userId },
    data: { usedById: null },
  });
  await db.user.delete({ where: { id: userId } });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function generateInviteCodeAction() {
  await requireStaff();
  await db.inviteCode.create({ data: { code: generateInviteCode() } });
  revalidatePath("/admin");
}

export async function revokeInviteCodeAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.inviteCode.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
}

export async function reviewClearanceRequestAction(formData: FormData) {
  const reviewer = await requireStaff();
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  const request = await db.clearanceRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "pending") return;

  await db.clearanceRequest.update({
    where: { id: requestId },
    data: {
      status: decision === "approve" ? "approved" : "denied",
      reviewedById: reviewer.id,
      reviewedAt: new Date(),
    },
  });

  if (decision === "approve" && request.requestedLevel <= MAX_CLEARANCE) {
    // Staff cannot push a member to the top clearance; owner/admin can.
    const canGrantTop = reviewer.isOwner || reviewer.isAdmin;
    if (request.requestedLevel < OWNER_CLEARANCE || canGrantTop) {
      await db.user.update({
        where: { id: request.userId, isOwner: false },
        data: { clearance: request.requestedLevel },
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/personnel");
  revalidatePath("/clearance-request");
}
