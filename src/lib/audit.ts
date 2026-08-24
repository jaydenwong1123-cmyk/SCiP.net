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
  testLogToggled: "user.test_log.toggle",
  personnelEditToggled: "user.personnel_edit.toggle",
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
  scpAccessGranted: "scp.access.grant",
  scpAccessRevoked: "scp.access.revoke",
  helperToggled: "user.helper.toggle",
  ticketClosed: "ticket.close",
  messageLogViewed: "message_log.view",
  scpTestLogged: "scp.test.log",
  scpTestDeleted: "scp.test.delete",
  // Terminal intrusion. The two intruder-side verbs are logged with a NULL
  // actor on purpose — see the note in app/(app)/hack/actions.ts. The
  // RAISA-side verbs do carry their actor: that is oversight of the overseer.
  hackRunStarted: "hack.run.start",
  hackRunFailed: "hack.run.fail",
  hackGrantIssued: "hack.grant.issue",
  hackGrantRevoked: "hack.grant.revoke",
  hackTraceRevealed: "hack.trace.reveal",
  hackRunDeleted: "hack.run.delete",
  hackCaseStatusSet: "hack.case_status.set",
  hackCaseFlagToggled: "hack.case_flag.toggle",
  // Desk workload. Named actors, like every other RAISA-side verb: who picked a
  // case up and who put it down is oversight of the overseer.
  hackCaseClaimed: "hack.case.claim",
  hackCaseReleased: "hack.case.release",
  // A run crossed the conduct threshold. NULL actor, like the other
  // intruder-side verbs: the whole point of the reveal ladder is that
  // /admin/audit must not name the intruder before RAISA has earned it. The
  // evidence itself lives in ConductRecord, which is Admin+ only.
  hackConductFlagged: "hack.conduct.flag",
  hackDuelEngaged: "hack.duel.engage",
  hackDuelResolved: "hack.duel.resolve",
  // A GHOST PROTOCOL charge rolled a case's reveal level back. NULL actor, like
  // every other intruder-side verb — this entry is about an identity being
  // pulled back out of view, and naming it here would defeat the point.
  hackTraceScrubbed: "hack.trace.scrub",
  // Terminal conduct sanctions, issued from /admin/conduct. These DO carry
  // their actor: a disciplinary step is an exercise of power over a named
  // member, and belongs in the trail with the name of who took it.
  hackSanctionIssued: "hack.sanction.issue",
  hackSanctionLifted: "hack.sanction.lift",
  bulkMemberAction: "user.bulk",
  // OMEGA AUTHORITY. The rejection verbs matter as much as the success ones:
  // a sentinel failure or a refused OMEGA attempt is the tripwire telling the
  // owner that somebody reached their account, so both are logged even though
  // nothing happened.
  sentinelPassed: "owner.sentinel.pass",
  sentinelFailed: "owner.sentinel.fail",
  sentinelLocked: "owner.sentinel.lockout",
  omegaArmed: "omega.arm",
  omegaAborted: "omega.abort",
  omegaRejected: "omega.reject",
  siteTerminated: "site.terminate",
  siteRestored: "site.restore",
  sitePurged: "site.purge",
  // A full network export. Logged for the same reason the purge is: it is the
  // one read in this application that takes everything at once, and a backup
  // file is as sensitive as the database it came from.
  siteBackupExported: "site.backup.export",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// Human-readable labels for the admin log filter.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.clearanceSet]: "CLEARANCE CHANGED",
  [AUDIT_ACTIONS.displayNameSet]: "NAME CHANGED",
  [AUDIT_ACTIONS.departmentSet]: "DEPARTMENT CHANGED",
  [AUDIT_ACTIONS.scpPostToggled]: "SCP-POST TOGGLED",
  [AUDIT_ACTIONS.incidentFileToggled]: "INCIDENT-FILE TOGGLED",
  [AUDIT_ACTIONS.testLogToggled]: "TEST-LOG TOGGLED",
  [AUDIT_ACTIONS.personnelEditToggled]: "PERSONNEL-EDIT TOGGLED",
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
  [AUDIT_ACTIONS.scpAccessGranted]: "SCP ACCESS GRANTED",
  [AUDIT_ACTIONS.scpAccessRevoked]: "SCP ACCESS REVOKED",
  [AUDIT_ACTIONS.helperToggled]: "HELPER TOGGLED",
  [AUDIT_ACTIONS.ticketClosed]: "TICKET CLOSED",
  [AUDIT_ACTIONS.messageLogViewed]: "MESSAGE LOG READ",
  [AUDIT_ACTIONS.scpTestLogged]: "TEST LOG FILED",
  [AUDIT_ACTIONS.scpTestDeleted]: "TEST LOG RETRACTED",
  [AUDIT_ACTIONS.hackRunStarted]: "INTRUSION DETECTED",
  [AUDIT_ACTIONS.hackRunFailed]: "INTRUSION REPELLED",
  [AUDIT_ACTIONS.hackGrantIssued]: "ILLICIT ACCESS BANKED",
  [AUDIT_ACTIONS.hackGrantRevoked]: "ILLICIT ACCESS REVOKED",
  [AUDIT_ACTIONS.hackTraceRevealed]: "INTRUSION TRACED",
  [AUDIT_ACTIONS.hackRunDeleted]: "CASE FILE DELETED",
  [AUDIT_ACTIONS.hackCaseStatusSet]: "CASE STATUS SET",
  [AUDIT_ACTIONS.hackCaseFlagToggled]: "CASE FLAG TOGGLED",
  [AUDIT_ACTIONS.hackCaseClaimed]: "CASE CLAIMED",
  [AUDIT_ACTIONS.hackCaseReleased]: "CASE RELEASED",
  [AUDIT_ACTIONS.hackDuelEngaged]: "COUNTER-INTRUSION ENGAGED",
  [AUDIT_ACTIONS.hackDuelResolved]: "COUNTER-INTRUSION RESOLVED",
  [AUDIT_ACTIONS.hackTraceScrubbed]: "TRACE SCRUBBED",
  [AUDIT_ACTIONS.hackSanctionIssued]: "TERMINAL SANCTION ISSUED",
  [AUDIT_ACTIONS.hackSanctionLifted]: "TERMINAL SANCTION LIFTED",
  [AUDIT_ACTIONS.bulkMemberAction]: "BULK MEMBER ACTION",
  [AUDIT_ACTIONS.sentinelPassed]: "SENTINEL CLEARED",
  [AUDIT_ACTIONS.sentinelFailed]: "SENTINEL FAILED",
  [AUDIT_ACTIONS.sentinelLocked]: "SENTINEL LOCKOUT",
  [AUDIT_ACTIONS.omegaArmed]: "OMEGA ARMED",
  [AUDIT_ACTIONS.omegaAborted]: "OMEGA ABORTED",
  [AUDIT_ACTIONS.omegaRejected]: "OMEGA REJECTED",
  [AUDIT_ACTIONS.siteTerminated]: "SITE TERMINATED",
  [AUDIT_ACTIONS.siteRestored]: "SITE RESTORED",
  [AUDIT_ACTIONS.sitePurged]: "DATA PURGED",
  [AUDIT_ACTIONS.siteBackupExported]: "BACKUP EXPORTED",
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
