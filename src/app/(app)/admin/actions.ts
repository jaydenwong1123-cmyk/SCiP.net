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
import { purgeUser } from "@/lib/purge-user";
import { isBulkOp, ADMIN_ONLY_BULK_OPS } from "@/lib/bulk-ops";

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

  // Optional scheduled unlock. The datetime-local input has no timezone, so it
  // arrives as the owner's wall-clock time; we treat it as such. A blank value,
  // an unparseable one, or one already in the past means "no schedule" — an
  // indefinite lockdown that stays up until turned off by hand.
  const lockdownUntilRaw = String(formData.get("lockdownUntil") ?? "").trim();
  let lockdownUntil: Date | null = null;
  if (lockdownUntilRaw) {
    const parsed = new Date(lockdownUntilRaw);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
      lockdownUntil = parsed;
    }
  }

  // Never enable the lockdown without a code — that would lock everyone out,
  // including the owner.
  const maintenanceMode = wantsMaintenance && bypassCode.length > 0;

  await updateSiteConfig({
    maintenanceMode,
    bypassCode,
    maintenanceMessage,
    // Only carry a schedule while the lockdown is actually on, so a stale end
    // time can't linger on a disabled config.
    lockdownUntil: maintenanceMode ? lockdownUntil : null,
  });

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
      ? lockdownUntil
        ? `Enabled maintenance lockdown until ${lockdownUntil.toISOString()}`
        : "Enabled maintenance lockdown"
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
  // Plain Staff (no admin/owner powers) may only raise members up to L-3.
  if (!canGrantTop && clearance > 3) return;

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

export async function toggleCanLogTestAction(formData: FormData) {
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const canLogTest = formData.get("canLogTest") === "true";

  if (!userId) return;

  const name = await targetName(userId);

  await db.user.update({
    where: { id: userId },
    data: { canLogTest },
  });

  await logAudit({
    action: AUDIT_ACTIONS.testLogToggled,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: name,
    summary: canLogTest
      ? "Granted experiment-log permission"
      : "Revoked experiment-log permission",
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

  await purgeUser(userId);

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

// ---------------------------------------------------------------------------
// Bulk member management
//
// Every operation here is the multi-target form of a single-member action
// above, and deliberately reuses the *same* authorization rules rather than
// restating them loosely. Targets that fail a rule are skipped individually
// instead of failing the whole batch, and the audit trail records one entry
// per member acted on plus a batch summary — so a bulk change is no less
// traceable than doing it one row at a time.
// ---------------------------------------------------------------------------

// Cap on how many members one submission may touch. Keeps a runaway or forged
// request from walking the whole roster in a single call.
const MAX_BULK_TARGETS = 100;

export async function bulkMemberAction(
  _prevState: { ok: boolean; error?: string; message?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const actor = await requireStaff();
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: "NON-ASCII CHARACTERS ARE NOT ALLOWED." };
  }

  const op = String(formData.get("op") ?? "");
  if (!isBulkOp(op)) return { ok: false, error: "UNKNOWN OPERATION." };

  const userIds = [
    ...new Set(
      formData
        .getAll("userIds")
        .map((v) => String(v))
        .filter(Boolean)
    ),
  ];
  if (userIds.length === 0) return { ok: false, error: "NO MEMBERS SELECTED." };
  if (userIds.length > MAX_BULK_TARGETS) {
    return {
      ok: false,
      error: `TOO MANY MEMBERS SELECTED (MAX ${MAX_BULK_TARGETS}).`,
    };
  }

  // Role gates, mirroring the single-member actions exactly.
  const ownerPowers = hasOwnerPowers(actor);
  const adminPowers = ownerPowers || actor.isAdmin;
  // Role/Staff grants and account deletion are Admin-and-above, matching
  // toggleHelperAction / toggleStaffAction / deleteAccountAction.
  if (ADMIN_ONLY_BULK_OPS.includes(op) && !adminPowers) {
    return { ok: false, error: "INSUFFICIENT AUTHORITY FOR THIS OPERATION." };
  }

  // Operation-specific payload validation, done once before touching anything.
  let clearance = 0;
  let designation: string | null = null;
  let department = "";
  let reason = "";

  if (op === "clearance") {
    const parsed = parseClearanceAssignment(String(formData.get("clearance") ?? ""));
    if (!parsed) return { ok: false, error: "INVALID CLEARANCE LEVEL." };
    ({ clearance, designation } = parsed);
    // Same caps as setClearanceAction: only admin+ may grant L-OMNI, and plain
    // Staff top out at L-3.
    if (clearance >= OWNER_CLEARANCE && !adminPowers) {
      return { ok: false, error: "ONLY ADMIN AND ABOVE MAY GRANT L-OMNI." };
    }
    if (!adminPowers && clearance > 3) {
      return { ok: false, error: "STAFF MAY ONLY ASSIGN UP TO L-3." };
    }
  }

  if (op === "department") {
    department = String(formData.get("department") ?? "");
    if (department !== "" && !isValidDepartment(department)) {
      return { ok: false, error: "INVALID DEPARTMENT." };
    }
  }

  if (op === "suspend") {
    reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  }

  const targets = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      displayName: true,
      clearance: true,
      designation: true,
      isOwner: true,
      isCoOwner: true,
    },
  });

  let applied = 0;
  let skipped = 0;

  for (const target of targets) {
    // The owner and the co-owner are never bulk-targetable. Appointing or
    // removing a co-owner stays a deliberate, single, confirmed act.
    if (target.isOwner || target.isCoOwner) {
      skipped++;
      continue;
    }
    // Never let an operator suspend or delete themselves out of the panel.
    if ((op === "suspend" || op === "delete") && target.id === actor.id) {
      skipped++;
      continue;
    }

    const name = target.displayName ?? target.email;

    switch (op) {
      case "clearance":
        await db.user.update({
          where: { id: target.id, isOwner: false, isCoOwner: false },
          data: { clearance, designation },
        });
        await logAudit({
          action: AUDIT_ACTIONS.clearanceSet,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: `Clearance ${clearanceDisplay(
            target.clearance,
            target.designation
          )} → ${clearanceDisplay(clearance, designation)} (bulk)`,
        });
        break;

      case "department":
        await db.user.update({
          where: { id: target.id },
          data: { department: department === "" ? null : department },
        });
        await logAudit({
          action: AUDIT_ACTIONS.departmentSet,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: department
            ? `Assigned to ${department} (bulk)`
            : "Removed department assignment (bulk)",
        });
        break;

      case "grantScpPost":
      case "revokeScpPost": {
        const canPostScp = op === "grantScpPost";
        await db.user.update({
          where: { id: target.id },
          data: { canPostScp },
        });
        await logAudit({
          action: AUDIT_ACTIONS.scpPostToggled,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: canPostScp
            ? "Granted SCP filing permission (bulk)"
            : "Revoked SCP filing permission (bulk)",
        });
        break;
      }

      case "grantIncidentFile":
      case "revokeIncidentFile": {
        const canFileIncident = op === "grantIncidentFile";
        await db.user.update({
          where: { id: target.id },
          data: { canFileIncident },
        });
        await logAudit({
          action: AUDIT_ACTIONS.incidentFileToggled,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: canFileIncident
            ? "Granted incident filing permission (bulk)"
            : "Revoked incident filing permission (bulk)",
        });
        break;
      }

      case "grantTestLog":
      case "revokeTestLog": {
        const canLogTest = op === "grantTestLog";
        await db.user.update({
          where: { id: target.id },
          data: { canLogTest },
        });
        await logAudit({
          action: AUDIT_ACTIONS.testLogToggled,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: canLogTest
            ? "Granted experiment-log permission (bulk)"
            : "Revoked experiment-log permission (bulk)",
        });
        break;
      }

      case "grantHelper":
      case "revokeHelper": {
        const isHelper = op === "grantHelper";
        await db.user.update({
          where: { id: target.id, isOwner: false, isCoOwner: false },
          data: { isHelper },
        });
        await logAudit({
          action: AUDIT_ACTIONS.helperToggled,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: isHelper
            ? "Granted Helper role (bulk)"
            : "Revoked Helper role (bulk)",
        });
        break;
      }

      case "grantStaff":
      case "revokeStaff": {
        const isStaff = op === "grantStaff";
        await db.user.update({
          where: { id: target.id, isOwner: false, isCoOwner: false },
          data: { isStaff },
        });
        await logAudit({
          action: AUDIT_ACTIONS.staffToggled,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: isStaff
            ? "Granted Staff role (bulk)"
            : "Revoked Staff role (bulk)",
        });
        break;
      }

      case "suspend":
      case "reinstate": {
        const suspend = op === "suspend";
        await db.user.update({
          where: { id: target.id, isOwner: false, isCoOwner: false },
          data: {
            suspended: suspend,
            suspendedReason: suspend ? (reason ? reason : null) : null,
          },
        });
        await logAudit({
          action: AUDIT_ACTIONS.suspensionSet,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: suspend
            ? `Suspended (bulk)${reason ? `: ${reason}` : ""}`
            : "Lifted suspension (bulk)",
        });
        break;
      }

      case "delete":
        await purgeUser(target.id);
        await logAudit({
          action: AUDIT_ACTIONS.accountDeleted,
          actor,
          targetType: "user",
          targetId: target.id,
          targetName: name,
          summary: `Deleted account ${target.email} (bulk)`,
        });
        break;
    }

    applied++;
  }

  // Members whose ids were submitted but no longer exist.
  skipped += userIds.length - targets.length;

  await logAudit({
    action: AUDIT_ACTIONS.bulkMemberAction,
    actor,
    targetType: "user",
    summary: `Bulk "${op}" applied to ${applied} member(s)${
      skipped > 0 ? `, ${skipped} skipped` : ""
    }`,
  });

  revalidatePath("/admin");
  revalidatePath("/personnel");

  return {
    ok: true,
    message: `APPLIED TO ${applied} MEMBER(S)${
      skipped > 0 ? ` — ${skipped} SKIPPED (PROTECTED OR NOT FOUND)` : ""
    }.`,
  };
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
    // Plain Staff (no admin/owner powers) may only approve requests up to L-3.
    const withinStaffCap = canGrantTop || request.requestedLevel <= 3;
    if ((request.requestedLevel < OWNER_CLEARANCE || canGrantTop) && withinStaffCap) {
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
