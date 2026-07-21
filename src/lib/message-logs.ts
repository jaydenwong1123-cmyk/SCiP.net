import { R5_DESIGNATION } from "@/lib/clearance";
import { hasStaffPowers } from "@/lib/session";

// Oversight view over member-to-member correspondence.
//
// Retention is enforced at query time rather than by a purge job, for the same
// reason broadcast scheduling is (see `broadcast-schedule.ts`): this deployment
// has no cron, so anything job-based would silently never fire. Messages older
// than the window fall out of the log on their own while the members who sent
// and received them keep their own copies.
export const MESSAGE_LOG_RETENTION_DAYS = 14;

export function logRetentionCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - MESSAGE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

// RAISA (the L-R5 recordkeeper designation) and Staff and above. Note this
// deliberately does not consult clearance rank on its own: an L-O5 who is
// neither RAISA nor staff has no business reading other members' mail.
export function canAccessMessageLogs(user: {
  designation?: string | null;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}): boolean {
  return user.designation === R5_DESIGNATION || hasStaffPowers(user);
}
