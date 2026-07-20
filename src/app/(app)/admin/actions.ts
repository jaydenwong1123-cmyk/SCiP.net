"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  requireOwner,
  requireRootOwner,
  requireAdminPowers,
  requireStaff,
  hasOwnerPowers,
} from "@/lib/session";
import { generateInviteCode } from "@/lib/codeword";
import {
  MAX_CLEARANCE,
  MIN_CLEARANCE,
  OWNER_CLEARANCE,
  parseClearanceAssignment,
} from "@/lib/clearance";
import { isValidDepartment } from "@/lib/departments";
import { updateSiteConfig, MAINT_COOKIE } from "@/lib/site-config";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { clearanceDisplay, clearanceLabel } from "@/lib/clearance";
import { findNonAsciiFormField } from "@/lib/validation";

// Audit entries name the person acted on, not just their id. Looked up once
// per action rather than joined into every log read.
async function targetName(userId: string): Promise<string> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true },
  });
  return u?.displayName ?? u?.email ?? userId;
}

export async function setMaintenanceAction(formData: FormData) {
  const actor = await requireOwner();
  if (findNonAsciiFormField(formData)) return;
  const wantsMaintenance = formData.get("maintenanceMode") === "on";
  const bypassCode = String(formData.get("bypassCode") ?? "").trim().slice(0, 64);
  const maintenanceMessage = String(formData.get("maintenanceMessage") ?? "")
    .trim()
    .slice(0, 300);

  // Never enable the lockdown without a code — that would lock everyone out,
  // including the owner.
  const maintenanceMode = wantsMaintenance && bypassCode.length > 0;

  await updateSiteConfig({ maintenanceMode, bypassCode, maintenanceMessage });

  // Grant the owner the bypass cookie immediately so enabling the lockdown
  // doesn't kick them out of their own admin session.
  if (maintenanceMode) {
    const jar = await cookies();
    jar.set(MAINT_COOKIE, bypassCode, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  await logAudit({
    action: AUDIT_ACTIONS.maintenanceSet,
    actor,
    targetType: "site",
    summary: maintenanceMode
      ? "Enabled maintenance lockdown"
      : "Disabled maintenance lockdown",
  });

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setClearanceAction(formData: FormData) {
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const parsed = parseClearanceAssignment(String(formData.get("clearance") ?? ""));

  if (!userId || !parsed) return;
  const { clearance, designation } = parsed;

  // Only owner/co-owner/admin may grant the top clearance (L-OMNI). Staff cap
  // below it.
  const canGrantTop = hasOwnerPowers(actor) || actor.isAdmin;
  if (clearance >= OWNER_CLEARANCE && !canGrantTop) return;

  const before = await db.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true, clearance: true, designation: true },
  });
  if (!before) return;

  await db.user.update({
    where: { id: userId, isOwner: false, isCoOwner: false },
    data: { clearance, designation },
  });

  await logAudit({
    action: AUDIT_ACTIONS.clearanceSet,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: before.displayName ?? before.email,
    summary: `Clearance ${clearanceDisplay(
      before.clearance,
      before.designation
    )} → ${clearanceDisplay(clearance, designation)}`,
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setDisplayNameAction(formData: FormData) {
  const actor = await requireStaff();
  if (findNonAsciiFormField(formData)) return;
  const userId = String(formData.get("userId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!userId || !displayName) return;

  const previous = await targetName(userId);
  const next = displayName.slice(0, 60);

  await db.user.update({
    where: { id: userId },
    data: { displayName: next },
  });

  await logAudit({
    action: AUDIT_ACTIONS.displayNameSet,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: next,
    summary: `Renamed "${previous}" → "${next}"`,
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setOwnDisplayNameAction(formData: FormData) {
  const owner = await requireOwner();
  if (findNonAsciiFormField(formData)) return;
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
  const parsed = parseClearanceAssignment(String(formData.get("clearance") ?? ""));
  if (!parsed) return;
  const { clearance, designation } = parsed;
  if (clearance < MIN_CLEARANCE || clearance > OWNER_CLEARANCE) return;

  await db.user.update({
    where: { id: owner.id },
    data: { clearance, designation },
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setMemberDepartmentAction(formData: FormData) {
  // Staff and above may assign any department, including restricted ones.
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const department = String(formData.get("department") ?? "");
  if (!userId) return;
  if (department !== "" && !isValidDepartment(department)) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId },
    data: { department: department === "" ? null : department },
  });

  await logAudit({
    action: AUDIT_ACTIONS.departmentSet,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: department
      ? `Assigned to ${department}`
      : "Removed department assignment",
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function toggleCanPostScpAction(formData: FormData) {
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const canPostScp = formData.get("canPostScp") === "true";

  if (!userId) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId },
    data: { canPostScp },
  });

  await logAudit({
    action: AUDIT_ACTIONS.scpPostToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: canPostScp
      ? "Granted SCP filing permission"
      : "Revoked SCP filing permission",
  });

  revalidatePath("/admin");
}

export async function toggleCanFileIncidentAction(formData: FormData) {
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const canFileIncident = formData.get("canFileIncident") === "true";

  if (!userId) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId },
    data: { canFileIncident },
  });

  await logAudit({
    action: AUDIT_ACTIONS.incidentFileToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: canFileIncident
      ? "Granted incident filing permission"
      : "Revoked incident filing permission",
  });

  revalidatePath("/admin");
}

export async function toggleHelperAction(formData: FormData) {
  // Helper sits below Staff, but granting it is reserved for Admin and above —
  // Staff cannot appoint their own juniors.
  const actor = await requireAdminPowers();
  const userId = String(formData.get("userId") ?? "");
  const isHelper = formData.get("isHelper") === "true";

  if (!userId) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId, isOwner: false, isCoOwner: false },
    data: { isHelper },
  });

  await logAudit({
    action: AUDIT_ACTIONS.helperToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: isHelper ? "Granted Helper role" : "Revoked Helper role",
  });

  revalidatePath("/admin");
}

export async function toggleStaffAction(formData: FormData) {
  // Owner or admin may grant/revoke the Staff role.
  const actor = await requireAdminPowers();
  const userId = String(formData.get("userId") ?? "");
  const isStaff = formData.get("isStaff") === "true";

  if (!userId) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId, isOwner: false, isCoOwner: false },
    data: { isStaff },
  });

  await logAudit({
    action: AUDIT_ACTIONS.staffToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: isStaff ? "Granted Staff role" : "Revoked Staff role",
  });

  revalidatePath("/admin");
}

export async function toggleAdminAction(formData: FormData) {
  // Only the owner may grant or revoke the owner-level Admin role.
  const actor = await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const isAdmin = formData.get("isAdmin") === "true";

  if (!userId) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId, isOwner: false, isCoOwner: false },
    data: { isAdmin },
  });

  await logAudit({
    action: AUDIT_ACTIONS.adminToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: isAdmin ? "Granted Admin role" : "Revoked Admin role",
  });

  revalidatePath("/admin");
}

export async function toggleCoOwnerAction(formData: FormData) {
  // Only the seeded owner may appoint or remove the Co-Owner — a co-owner
  // cannot hand the role to someone else or entrench themselves.
  const actor = await requireRootOwner();
  const userId = String(formData.get("userId") ?? "");
  const isCoOwner = formData.get("isCoOwner") === "true";

  if (!userId) return;

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.isOwner) return; // the owner already outranks the role

  if (isCoOwner) {
    // At most one co-owner: demote any current holder first.
    await db.user.updateMany({
      where: { isCoOwner: true },
      data: { isCoOwner: false },
    });
  }

  await db.user.update({
    where: { id: userId, isOwner: false },
    data: { isCoOwner },
  });

  await logAudit({
    action: AUDIT_ACTIONS.coOwnerToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: target.displayName ?? target.email,
    summary: isCoOwner ? "Appointed Co-Owner" : "Removed Co-Owner",
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function setSuspendedAction(formData: FormData) {
  const actor = await requireStaff();
  if (findNonAsciiFormField(formData)) return;
  const userId = String(formData.get("userId") ?? "");
  const suspend = formData.get("suspend") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!userId || userId === actor.id) return;

  const target = await db.user.findUnique({ where: { id: userId } });
  // Never suspend the owner or the co-owner.
  if (!target || hasOwnerPowers(target)) return;

  await db.user.update({
    where: { id: userId, isOwner: false, isCoOwner: false },
    data: {
      suspended: suspend,
      suspendedReason: suspend ? (reason ? reason.slice(0, 300) : null) : null,
    },
  });

  await logAudit({
    action: AUDIT_ACTIONS.suspensionSet,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: target.displayName ?? target.email,
    summary: suspend
      ? `Suspended${reason ? `: ${reason.slice(0, 300)}` : ""}`
      : "Lifted suspension",
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function deleteAccountAction(formData: FormData) {
  const actor = await requireAdminPowers();
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === actor.id) return;

  const target = await db.user.findUnique({ where: { id: userId } });
  // Never delete the owner or the co-owner.
  if (!target || hasOwnerPowers(target)) return;

  // No FK cascade under relationMode="prisma": clean up related rows manually.
  await db.message.deleteMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
  });
  await db.scpFile.deleteMany({ where: { authorId: userId } });
  await db.broadcast.deleteMany({ where: { authorId: userId } });
  await db.incidentReport.deleteMany({ where: { authorId: userId } });
  await db.secureMessage.deleteMany({ where: { authorId: userId } });
  await db.clearanceRequest.deleteMany({ where: { userId } });
  await db.clearanceRequest.updateMany({
    where: { reviewedById: userId },
    data: { reviewedById: null },
  });
  await db.inviteCode.updateMany({
    where: { usedById: userId },
    data: { usedById: null },
  });
  await db.inviteRedemption.deleteMany({ where: { userId } });
  await db.memberNote.deleteMany({
    where: { OR: [{ subjectId: userId }, { authorId: userId }] },
  });
  // Tickets they opened go with them, replies and all. Replies they left on
  // *other* people's tickets stay: the thread has to remain readable, and
  // `authorName` is denormalized precisely so it survives this.
  const ownTickets = await db.ticket.findMany({
    where: { authorId: userId },
    select: { id: true },
  });
  await db.ticketReply.deleteMany({
    where: { ticketId: { in: ownTickets.map((t) => t.id) } },
  });
  await db.ticket.deleteMany({ where: { authorId: userId } });
  await db.ticketReply.updateMany({
    where: { authorId: userId },
    data: { authorId: null },
  });
  await db.ticket.updateMany({
    where: { closedById: userId },
    data: { closedById: null },
  });
  await db.scpAccessGrant.deleteMany({ where: { userId } });
  await db.scpAccessGrant.updateMany({
    where: { grantedById: userId },
    data: { grantedById: null },
  });
  await db.notification.deleteMany({ where: { userId } });
  // Audit rows and revisions deliberately survive: both denormalize the
  // actor's name so the history stays readable, and detaching the id keeps
  // the record without dangling at a deleted user.
  await db.auditLog.updateMany({
    where: { actorId: userId },
    data: { actorId: null },
  });
  await db.revision.updateMany({
    where: { editorId: userId },
    data: { editorId: null },
  });
  await db.user.delete({ where: { id: userId } });

  await logAudit({
    action: AUDIT_ACTIONS.accountDeleted,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: target.displayName ?? target.email,
    summary: `Deleted account ${target.email}`,
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
}

export async function generateInviteCodeAction(formData: FormData) {
  const actor = await requireStaff();
  if (findNonAsciiFormField(formData)) return;

  const countRaw = Number(formData.get("count"));
  const count =
    Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= 50 ? countRaw : 1;

  // How many registrations each generated code may back. 1 keeps the original
  // single-use behavior.
  const maxUsesRaw = Number(formData.get("maxUses"));
  const maxUses =
    Number.isInteger(maxUsesRaw) && maxUsesRaw >= 1 && maxUsesRaw <= 100
      ? maxUsesRaw
      : 1;

  const note = String(formData.get("note") ?? "").trim().slice(0, 120);

  const expiryDays = Number(formData.get("expiryDays"));
  let expiresAt: Date | null = null;
  if (Number.isInteger(expiryDays) && expiryDays >= 1 && expiryDays <= 365) {
    expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  }

  await db.inviteCode.createMany({
    data: Array.from({ length: count }, () => ({
      code: generateInviteCode(),
      expiresAt,
      maxUses,
      note,
      createdById: actor.id,
    })),
  });

  await logAudit({
    action: AUDIT_ACTIONS.inviteCreated,
    actor,
    targetType: "invite",
    targetName: note || `${count} code(s)`,
    summary: `Generated ${count} invite code${count === 1 ? "" : "s"}${
      maxUses > 1 ? ` (${maxUses} uses each)` : ""
    }${expiresAt ? `, expiring ${expiresAt.toISOString().slice(0, 10)}` : ""}${
      note ? ` — ${note}` : ""
    }`,
  });

  revalidatePath("/admin");
}

export async function revokeInviteCodeAction(formData: FormData) {
  const actor = await requireStaff();
  if (findNonAsciiFormField(formData)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  const invite = await db.inviteCode.findUnique({ where: { id } });
  if (!invite) return;

  await db.inviteCode.update({
    where: { id },
    data: { active: false, revokedReason: reason },
  });

  await logAudit({
    action: AUDIT_ACTIONS.inviteRevoked,
    actor,
    targetType: "invite",
    targetId: id,
    targetName: invite.code,
    summary: `Revoked code ${invite.code}${reason ? `: ${reason}` : ""}`,
  });

  revalidatePath("/admin");
}

export async function reviewClearanceRequestAction(formData: FormData) {
  const reviewer = await requireStaff();
  if (findNonAsciiFormField(formData)) return;
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim();

  const request = await db.clearanceRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "pending") return;

  await db.clearanceRequest.update({
    where: { id: requestId },
    data: {
      status: decision === "approve" ? "approved" : "denied",
      reviewNote: reviewNote ? reviewNote.slice(0, 500) : null,
      reviewedById: reviewer.id,
      reviewedAt: new Date(),
    },
  });

  let granted = false;
  if (decision === "approve" && request.requestedLevel <= MAX_CLEARANCE) {
    // Staff cannot push a member to the top clearance; owner-level/admin can.
    const canGrantTop = hasOwnerPowers(reviewer) || reviewer.isAdmin;
    if (request.requestedLevel < OWNER_CLEARANCE || canGrantTop) {
      await db.user.update({
        where: { id: request.userId, isOwner: false, isCoOwner: false },
        data: { clearance: request.requestedLevel, designation: null },
      });
      granted = true;
    }
  }

  await logAudit({
    action: AUDIT_ACTIONS.clearanceReviewed,
    actor: reviewer,
    targetType: "user",
    targetId: request.userId,
    targetName: await targetName(request.userId),
    summary: `${decision === "approve" ? "Approved" : "Denied"} request for ${
      clearanceLabel(request.requestedLevel)
    }${
      decision === "approve" && !granted
        ? " (not applied — exceeds reviewer authority)"
        : ""
    }${reviewNote ? ` — ${reviewNote.slice(0, 200)}` : ""}`,
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");
  revalidatePath("/clearance-request");
}
