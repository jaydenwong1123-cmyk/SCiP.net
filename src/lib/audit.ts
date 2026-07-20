import { after } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

// Append-only audit trail for privileged actions.
//
// Two rules shape this module:
//   1. Logging must never break the action it describes. Every write is
//      wrapped so a failed insert degrades to a console warning.
//   2. Logging must never slow the action down. Writes are scheduled with
//      `after()`, which runs them once the response has been flushed.

export const AUDIT_ACTIONS = {
  clearanceSet: "user.clearance.set",
  displayNameSet: "user.name.set",
  departmentSet: "user.department.set",
  scpPostToggled: "user.scp_post.toggle",
  incidentFileToggled: "user.incident_file.toggle",
  staffToggled: "user.staff.toggle",
  adminToggled: "user.admin.toggle",
  coOwnerToggled: "user.coowner.toggle",
  suspensionSet: "user.suspension.set",
  accountDeleted: "user.delete",
  inviteCreated: "invite.create",
  inviteRevoked: "invite.revoke",
  inviteRedeemed: "invite.redeem",
  clearanceReviewed: "clearance_request.review",
  maintenanceSet: "site.maintenance.set",
  scpEdited: "scp.edit",
  scpDeleted: "scp.delete",
  incidentEdited: "incident.edit",
  incidentDeleted: "incident.delete",
  broadcastEdited: "broadcast.edit",
  broadcastDeleted: "broadcast.delete",
  loginBlocked: "auth.login.blocked",
  infractionFiled: "infraction.file",
  infractionDeleted: "infraction.delete",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// Human-readable labels for the admin log filter.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.clearanceSet]: "CLEARANCE CHANGED",
  [AUDIT_ACTIONS.displayNameSet]: "NAME CHANGED",
  [AUDIT_ACTIONS.departmentSet]: "DEPARTMENT CHANGED",
  [AUDIT_ACTIONS.scpPostToggled]: "SCP-POST TOGGLED",
  [AUDIT_ACTIONS.incidentFileToggled]: "INCIDENT-FILE TOGGLED",
  [AUDIT_ACTIONS.staffToggled]: "STAFF TOGGLED",
  [AUDIT_ACTIONS.adminToggled]: "ADMIN TOGGLED",
  [AUDIT_ACTIONS.coOwnerToggled]: "CO-OWNER TOGGLED",
  [AUDIT_ACTIONS.suspensionSet]: "SUSPENSION",
  [AUDIT_ACTIONS.accountDeleted]: "ACCOUNT DELETED",
  [AUDIT_ACTIONS.inviteCreated]: "INVITE CREATED",
  [AUDIT_ACTIONS.inviteRevoked]: "INVITE REVOKED",
  [AUDIT_ACTIONS.inviteRedeemed]: "INVITE REDEEMED",
  [AUDIT_ACTIONS.clearanceReviewed]: "REQUEST REVIEWED",
  [AUDIT_ACTIONS.maintenanceSet]: "MAINTENANCE",
  [AUDIT_ACTIONS.scpEdited]: "SCP EDITED",
  [AUDIT_ACTIONS.scpDeleted]: "SCP DELETED",
  [AUDIT_ACTIONS.incidentEdited]: "INCIDENT EDITED",
  [AUDIT_ACTIONS.incidentDeleted]: "INCIDENT DELETED",
  [AUDIT_ACTIONS.broadcastEdited]: "BROADCAST EDITED",
  [AUDIT_ACTIONS.broadcastDeleted]: "BROADCAST DELETED",
  [AUDIT_ACTIONS.loginBlocked]: "LOGIN THROTTLED",
  [AUDIT_ACTIONS.infractionFiled]: "INFRACTION FILED",
  [AUDIT_ACTIONS.infractionDeleted]: "INFRACTION DELETED",
};

type Actor = { id: string; displayName: string | null; email: string };

export type AuditInput = {
  action: AuditAction;
  actor: Actor | null;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  summary?: string;
};

// Best-effort client IP. Vercel and most proxies set x-forwarded-for; the
// first entry is the original client.
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
    return (h.get("x-real-ip") ?? "").slice(0, 64);
  } catch {
    return "";
  }
}

async function write(input: AuditInput, ip: string) {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.displayName ?? input.actor?.email ?? "SYSTEM",
        targetType: input.targetType ?? "",
        targetId: input.targetId ?? "",
        targetName: (input.targetName ?? "").slice(0, 120),
        summary: (input.summary ?? "").slice(0, 500),
        ip,
      },
    });
  } catch (err) {
    // An unwritable audit row must not surface as a failed user action.
    console.warn("[audit] failed to record", input.action, err);
  }
}

// Schedule an audit entry. Safe to call from Server Actions and Route
// Handlers; the IP is read during the request, then handed to `after`.
export async function logAudit(input: AuditInput): Promise<void> {
  const ip = await clientIp();
  after(() => write(input, ip));
}

// Synchronous-path variant for contexts without a request scope (e.g. the
// NextAuth `authorize` callback, which runs outside `after`'s lifetime).
export async function logAuditNow(
  input: AuditInput,
  ip = ""
): Promise<void> {
  await write(input, ip);
}
